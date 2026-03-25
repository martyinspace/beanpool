import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadIdentity } from './identity';
import { sign } from '@noble/ed25519';
import { hexToBytes } from './crypto';

/**
 * Singleton database instance.
 * Using the synchronous API available in expo-sqlite version 14.x+ 
 */
let db: SQLite.SQLiteDatabase | null = null;
let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
    if (db) return db;
    // Open or create the local store
    db = await SQLite.openDatabaseAsync('beanpool.db');
    return db;
}

/** Ensures initDB has completed before any query runs */
async function waitForInit(): Promise<SQLite.SQLiteDatabase> {
    if (dbInitialized) return getDb();
    if (dbInitPromise) {
        await dbInitPromise;
        return getDb();
    }
    // If neither, trigger initDB ourselves
    dbInitPromise = initDB();
    await dbInitPromise;
    return getDb();
}

/**
 * Physically translates the Node Server schema identical array into
 * the local Native device's memory for Background Libp2p gossiping.
 */
export async function initDB() {
    if (dbInitialized) return;
    if (dbInitPromise) { await dbInitPromise; return; }
    dbInitPromise = _doInitDB();
    await dbInitPromise;
}

async function _doInitDB() {
    const database = await getDb();
    
    // We execute the same exact schema.sql payload to guarantee 1:1 API compatibility locally
    const schema = `
        -- 1. Members and Profiles
        CREATE TABLE IF NOT EXISTS members (
            public_key TEXT PRIMARY KEY,
            callsign TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            invited_by TEXT,
            invite_code TEXT,
            home_node_url TEXT,
            
            avatar_url TEXT,
            bio TEXT,
            contact_value TEXT,
            contact_visibility TEXT,
            status TEXT DEFAULT 'active',
            last_active_at DATETIME
        );

        -- 2. Ledger Accounts & Transactions
        CREATE TABLE IF NOT EXISTS accounts (
            public_key TEXT PRIMARY KEY,
            balance REAL DEFAULT 0.0,
            last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_demurrage_epoch INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            from_pubkey TEXT NOT NULL,
            to_pubkey TEXT NOT NULL,
            amount REAL NOT NULL CHECK (amount > 0),
            memo TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_pubkey);
        CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_pubkey);
        CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);

        -- 3. Marketplace Posts
        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            credits REAL NOT NULL DEFAULT 0,
            author_pubkey TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            active INTEGER DEFAULT 1,
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'paused', 'completed', 'cancelled')),
            price_type TEXT DEFAULT 'fixed',
            repeatable INTEGER DEFAULT 0,
            accepted_by TEXT,
            accepted_at DATETIME,
            pending_transaction_id TEXT,
            completed_at DATETIME,
            lat REAL,
            lng REAL,
            origin_node TEXT,
            photos TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_active_posts ON posts(created_at DESC) WHERE status = 'active';
        CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

        -- 4. Messaging & Chat
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            name TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS conversation_participants (
            conversation_id TEXT,
            public_key TEXT,
            last_read_at DATETIME,
            PRIMARY KEY (conversation_id, public_key)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            author_pubkey TEXT NOT NULL,
            ciphertext TEXT NOT NULL,
            nonce TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON messages(conversation_id, timestamp ASC);
        
        -- 5. Projects
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            creator_pubkey TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            photos TEXT,
            goal_amount INTEGER NOT NULL,
            current_amount INTEGER DEFAULT 0,
            deadline_at DATETIME,
            status TEXT DEFAULT 'ACTIVE',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await database.execAsync(schema);
        console.log('[SQLite] Local database initialized physically 1:1 with Server node.');
        
        // Add photos column if not exists (for existing simulators)
        try {
            await database.execAsync(`ALTER TABLE posts ADD COLUMN photos TEXT;`);
        } catch (e) {
            // Column likely already exists, ignore
        }
        // Add price_type column if not exists
        try {
            await database.execAsync(`ALTER TABLE posts ADD COLUMN price_type TEXT DEFAULT 'fixed';`);
        } catch (e) {}
        // Add repeatable column if not exists
        try {
            await database.execAsync(`ALTER TABLE posts ADD COLUMN repeatable INTEGER DEFAULT 0;`);
        } catch (e) {}
    } catch (e) {
        console.error('[SQLite] Database init error:', e);
    }
    dbInitialized = true;
}

/**
 * Simple Drop util if the User needs to wipe memory
 */
export async function clearDB() {
    const database = await getDb();
    await database.execAsync('DROP TABLE IF EXISTS messages; DROP TABLE IF EXISTS conversation_participants; DROP TABLE IF EXISTS conversations; DROP TABLE IF EXISTS posts; DROP TABLE IF EXISTS transactions; DROP TABLE IF EXISTS accounts; DROP TABLE IF EXISTS members; DROP TABLE IF EXISTS projects;');
    await initDB();
}

/**
 * PWA Fetch Equivalents executed cleanly across the Local Disk
 */
export async function getPosts(filter?: { type?: string; category?: string }) {
    const database = await waitForInit();
    let query = `
        SELECT p.*, m.callsign as author_callsign, m.avatar_url as author_avatar
        FROM posts p
        LEFT JOIN members m ON p.author_pubkey = m.public_key
        WHERE p.status = 'active'
    `;
    let params: any[] = [];
    
    if (filter?.type) {
        query += ' AND p.type = ?';
        params.push(filter.type);
    }
    if (filter?.category) {
        query += ' AND p.category = ?';
        params.push(filter.category);
    }
    query += ' ORDER BY p.created_at DESC';
    
    if (params.length > 0) {
        return await database.getAllAsync(query, params);
    } else {
        return await database.getAllAsync(query);
    }
}

export async function getPost(id: string) {
    const database = await waitForInit();
    return await database.getFirstAsync(`
        SELECT p.*, m.callsign as author_callsign, m.avatar_url as author_avatar
        FROM posts p
        LEFT JOIN members m ON p.author_pubkey = m.public_key
        WHERE p.id = ?
    `, [id]);
}

export async function getConversations(myPubkey: string) {
    const database = await getDb();
    const rows = await database.getAllAsync<any>(`
        SELECT c.id, c.name, m.ciphertext as lastMessage, m.timestamp
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.id IN (SELECT conversation_id FROM conversation_participants WHERE public_key = ?)
        GROUP BY c.id
        ORDER BY m.timestamp DESC
    `, [myPubkey]);
    
    return rows.map(row => ({
        id: row.id,
        peer: row.name || row.id.slice(0, 8),
        lastMessage: row.lastMessage ? '[Encrypted Message]' : 'Started conversation',
        timestamp: row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'New',
        unread: 0
    }));
}

export async function getBalance(pubkey: string) {
    const database = await getDb();
    const row = await database.getFirstAsync<any>('SELECT balance, last_demurrage_epoch FROM accounts WHERE public_key = ?', [pubkey]);
    const commons = await database.getFirstAsync<any>('SELECT balance FROM accounts WHERE public_key = "COMMONS"');
    
    return {
        balance: row?.balance || 0,
        floor: 0,
        commons: commons?.balance || 0
    };
}

export async function getTransactions(pubkey: string) {
    const database = await getDb();
    const rows = await database.getAllAsync<any>(`
        SELECT t.*, 
               CASE WHEN t.from_pubkey = ? THEN t.to_pubkey ELSE t.from_pubkey END as peer_pubkey,
               CASE WHEN t.to_pubkey = ? THEN 'credit' ELSE 'debit' END as type
        FROM transactions t
        WHERE t.from_pubkey = ? OR t.to_pubkey = ?
        ORDER BY t.timestamp DESC
        LIMIT 50
    `, [pubkey, pubkey, pubkey, pubkey]);
    
    return rows.map(row => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        peer: row.peer_pubkey.slice(0, 8).toUpperCase(),
        timestamp: new Date(row.timestamp).toLocaleDateString(),
        memo: row.memo
    }));
}

export async function getMemberProfile(pubkey: string) {
    const database = await getDb();
    return await database.getFirstAsync<any>('SELECT * FROM members WHERE public_key = ?', [pubkey]);
}

export async function updateMemberProfile(pubkey: string, data: { callsign: string, avatar_url?: string | null, bio?: string, contact_value?: string, contact_visibility?: string }) {
    const database = await getDb();
    
    // UPSERT basically because they might not exist locally yet if they haven't synced their own genesis block
    await database.runAsync(`
        INSERT INTO members (public_key, callsign, avatar_url, bio, contact_value, contact_visibility)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(public_key) DO UPDATE SET
            callsign = excluded.callsign,
            avatar_url = excluded.avatar_url,
            bio = excluded.bio,
            contact_value = excluded.contact_value,
            contact_visibility = excluded.contact_visibility
    `, [pubkey, data.callsign, data.avatar_url || null, data.bio || null, data.contact_value || null, data.contact_visibility || 'hidden']);
}

export async function getProjects() {
    const database = await getDb();
    const rows = await database.getAllAsync<any>('SELECT * FROM projects ORDER BY created_at DESC');
    return rows.map(row => ({
        id: row.id,
        title: row.title,
        goal: row.goal_amount,
        current: row.current_amount,
        type: 'community' // fallback mapping
    }));
}

export async function createPost(post: any) {
    const database = await getDb();
    await database.runAsync(
        `INSERT INTO posts (id, type, category, title, description, credits, author_pubkey, created_at, lat, lng, price_type, repeatable, photos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [post.id, post.type, post.category, post.title, post.description, post.credits,
         post.author_pubkey, post.created_at, post.lat || null, post.lng || null,
         post.price_type || 'fixed', post.repeatable || 0, post.photos || null]
    );

    // Push to remote BeanPool node so other devices can see it
    try {
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
        if (!anchorUrl) {
            console.warn('[DB] No anchor URL cached — post saved locally only');
            return;
        }

        // Build the POST body
        const body = {
            type: post.type,
            category: post.category,
            title: post.title,
            description: post.description,
            credits: post.credits,
            priceType: post.price_type || 'fixed',
            authorPublicKey: post.author_pubkey,
            lat: post.lat,
            lng: post.lng,
            photos: post.photos ? JSON.parse(post.photos) : undefined,
            repeatable: post.repeatable === 1,
        };
        const bodyString = JSON.stringify(body);

        // Sign the request with Ed25519 (required by server middleware)
        const identity = await loadIdentity();
        if (!identity) {
            console.warn('[DB] No identity — cannot sign POST request');
            return;
        }
        const privateKeyBytes = hexToBytes(identity.privateKey);
        const messageBytes = new TextEncoder().encode(bodyString);
        const signatureBytes = await sign(messageBytes, privateKeyBytes);
        // Convert signature to base64
        let binary = '';
        for (let i = 0; i < signatureBytes.length; i++) {
            binary += String.fromCharCode(signatureBytes[i]);
        }
        const signatureBase64 = btoa(binary);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${anchorUrl}/api/marketplace/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Public-Key': identity.publicKey,
                'X-Signature': signatureBase64,
            },
            body: bodyString,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
            console.warn('[DB] Remote post push failed:', res.status, await res.text());
        } else {
            console.log('[DB] ✅ Post pushed to remote node successfully');
        }
    } catch (e: any) {
        console.warn('[DB] Failed to push post to remote node:', e.message);
    }
}

export async function updatePost(id: string, updates: any) {
    const database = await getDb();
    await database.runAsync(
        `UPDATE posts SET type = ?, category = ?, title = ?, description = ?, credits = ?, price_type = ?, photos = ? WHERE id = ?`,
        [updates.type, updates.category, updates.title, updates.description, updates.credits, updates.price_type || 'fixed', updates.photos || null, id]
    );
}

export async function deletePost(id: string) {
    const database = await getDb();
    await database.runAsync('DELETE FROM posts WHERE id = ?', [id]);
}

export async function applyDelta(delta: any) {
    const database = await getDb();
    
    // Full-replace sync: server response is the source of truth
    await database.withTransactionAsync(async () => {
        if (delta.accounts) {
            for (const acc of delta.accounts) {
                await database.runAsync(
                    'INSERT OR REPLACE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, ?, ?)',
                    [acc.public_key ?? null, acc.balance ?? 0, acc.last_demurrage_epoch ?? 0]
                );
            }
        }
        
        if (delta.transactions) {
            for (const t of delta.transactions) {
                await database.runAsync(
                    'INSERT OR REPLACE INTO transactions (id, from_pubkey, to_pubkey, amount, memo, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                    [t.id ?? null, t.from_pubkey ?? null, t.to_pubkey ?? null, t.amount ?? 0, t.memo ?? null, t.timestamp ?? null]
                );
            }
        }

        if (delta.posts !== undefined) {
            // Wipe stale posts — the server dataset is the full truth
            await database.runAsync('DELETE FROM posts');
            for (const p of delta.posts) {
                await database.runAsync(
                    'INSERT OR REPLACE INTO posts (id, type, category, title, description, credits, author_pubkey, lat, lng, photos, price_type, repeatable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        p.id ?? null,
                        p.type ?? null,
                        p.category ?? null,
                        p.title ?? null,
                        p.description ?? '',
                        p.credits ?? 0,
                        p.author_pubkey || p.authorPubkey || p.authorPublicKey || null,
                        p.lat ?? null,
                        p.lng ?? null,
                        p.photos ? JSON.stringify(p.photos) : null,
                        p.price_type || p.priceType || 'fixed',
                        p.repeatable ? 1 : 0
                    ]
                );
            }
            console.log(`[DB] applyDelta: replaced posts table with ${delta.posts.length} posts from server`);
        }
    });
}

export async function getConversation(id: string) {
    const database = await getDb();
    return await database.getFirstAsync<any>('SELECT name FROM conversations WHERE id = ?', [id]);
}

export async function getMessages(conversationId: string) {
    const database = await getDb();
    const rows = await database.getAllAsync<any>(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC', 
        [conversationId]
    );
    return rows.map(row => ({
        id: row.id,
        senderId: row.author_pubkey,
        text: row.ciphertext, // We display ciphertext natively for now representing encrypted payload
        timestamp: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));
}

export async function insertMessage(conversationId: string, authorPubkey: string, text: string) {
    const database = await getDb();
    const id = Date.now().toString();
    const timestamp = new Date().toISOString();
    await database.runAsync(
        'INSERT INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [id, conversationId, authorPubkey, text, '00000', timestamp]
    );
}

export async function redeemInvite(code: string, callsign: string): Promise<boolean> {
    try {
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url') || 'https://review.beanpool.org:8443';

        const identity = await loadIdentity();
        if (!identity) throw new Error('No identity to register');

        const body = { code, publicKey: identity.publicKey, callsign };
        const bodyString = JSON.stringify(body);

        const { sign } = await import('@noble/ed25519');
        const { hexToBytes } = await import('./crypto');
        const privateKeyBytes = hexToBytes(identity.privateKey);
        const messageBytes = new TextEncoder().encode(bodyString);
        const signatureBytes = await sign(messageBytes, privateKeyBytes);
        
        let binary = '';
        for (let i = 0; i < signatureBytes.length; i++) {
            binary += String.fromCharCode(signatureBytes[i]);
        }
        const signatureBase64 = btoa(binary);

        const res = await fetch(`${anchorUrl}/api/invite/redeem`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Public-Key': identity.publicKey,
                'X-Signature': signatureBase64,
            },
            body: bodyString,
        });

        if (!res.ok) {
            let errorMsg = 'Failed to redeem invite';
            try {
                const errJson = await res.json();
                if (errJson.error) errorMsg = errJson.error;
            } catch {}
            throw new Error(errorMsg);
        }

        console.log('[DB] ✅ Invite redeemed successfully!');
        return true;
    } catch (e: any) {
        console.warn('[DB] Failed to redeem invite:', e.message);
        throw e;
    }
}
