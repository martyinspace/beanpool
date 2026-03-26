import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadIdentity } from './identity';
import * as Crypto from 'expo-crypto';
import { sign } from '@noble/ed25519';
import { hexToBytes, encodeBase64, encodeUtf8, decodeBase64, decodeUtf8 } from './crypto';

/**
 * Singleton database instance.
 * Using the synchronous API available in expo-sqlite version 14.x+ 
 */
let db: SQLite.SQLiteDatabase | null = null;
let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

// Global JS Mutex to prevent expo-sqlite "database is locked" crashes
// arising from concurrent loops across background Pillar polls and foreground Inbox rendering
let dbSyncLock = false;
async function acquireSyncLock() {
    while (dbSyncLock) await new Promise(r => setTimeout(r, 50));
    dbSyncLock = true;
}
function releaseSyncLock() {
    dbSyncLock = false;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
    if (db) return db;
    // Open or create the local store
    db = await SQLite.openDatabaseAsync('beanpool.db', { useNewConnection: true });
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
            accepted_by_callsign TEXT,
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
        // Transaction Tracking Migrations
        try { await database.execAsync(`ALTER TABLE posts ADD COLUMN accepted_by TEXT;`); } catch (e) {}
        try { await database.execAsync(`ALTER TABLE posts ADD COLUMN accepted_by_callsign TEXT;`); } catch (e) {}
        try { await database.execAsync(`ALTER TABLE posts ADD COLUMN accepted_at DATETIME;`); } catch (e) {}
        try { await database.execAsync(`ALTER TABLE posts ADD COLUMN pending_transaction_id TEXT;`); } catch (e) {}
        try { await database.execAsync(`ALTER TABLE posts ADD COLUMN completed_at DATETIME;`); } catch (e) {}
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
        SELECT c.id, c.name, m.ciphertext as lastMessage, m.nonce as lastNonce, MAX(m.timestamp) as timestamp,
        (SELECT memb.callsign FROM conversation_participants cp 
         LEFT JOIN members memb ON memb.public_key = cp.public_key
         WHERE cp.conversation_id = c.id AND cp.public_key != ? LIMIT 1) as otherCallsign,
        (SELECT COUNT(msg.id) FROM messages msg 
         WHERE msg.conversation_id = c.id 
         AND msg.author_pubkey != ?
         AND (msg.timestamp > IFNULL((SELECT last_read_at FROM conversation_participants WHERE conversation_id = c.id AND public_key = ?), '2000-01-01'))
        ) as unreadCount
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.id IN (SELECT conversation_id FROM conversation_participants WHERE public_key = ?)
        GROUP BY c.id
        ORDER BY timestamp DESC
    `, [myPubkey, myPubkey, myPubkey, myPubkey]);
    
    return rows.map(row => {
        let displayMsg = row.lastMessage ? '[Encrypted Message]' : 'Started conversation';
        if (row.lastNonce && row.lastNonce.startsWith('plaintext')) {
            try {
                displayMsg = decodeUtf8(decodeBase64(row.lastMessage));
            } catch {
                displayMsg = '[Encrypted]';
            }
        } else if (row.lastNonce === '00000') {
            displayMsg = row.lastMessage;
        }

        return {
            id: row.id,
            peer: row.name || row.otherCallsign || row.id.slice(0, 8),
            lastMessage: displayMsg,
            timestamp: row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'New',
            unread: row.unreadCount || 0
        };
    });
}

export async function markConversationRead(conversationId: string, myPubkey: string) {
    const database = await getDb();
    const now = new Date().toISOString();
    await database.runAsync(
        'UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND public_key = ?',
        [now, conversationId, myPubkey]
    );
}

export async function getGlobalUnreadCount(myPubkey: string): Promise<number> {
    const database = await getDb();
    const result = await database.getFirstAsync<any>(`
        SELECT COUNT(m.id) as count
        FROM messages m
        JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
        WHERE cp.public_key = ? 
        AND m.author_pubkey != ?
        AND (m.timestamp > IFNULL(cp.last_read_at, '2000-01-01'))
    `, [myPubkey, myPubkey]);
    return result?.count || 0;
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

    // 1. Enforce Online Connection & Broadcast First
    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) {
        throw new Error('You are currently offline. Please connect to a BeanPool Node to broadcast your post.');
    }

    const identity = await loadIdentity();
    if (!identity) {
        throw new Error('No identity found.');
    }

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

    const privateKeyBytes = hexToBytes(identity.privateKey);
    const messageBytes = encodeUtf8(bodyString);
    const signatureBytes = await sign(messageBytes, privateKeyBytes);
    const signatureBase64 = encodeBase64(signatureBytes);

    try {
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
            const txt = await res.text();
            let errMsg = 'Network request failed or server rejected the post.';
            try {
                const json = JSON.parse(txt);
                if (json.error) errMsg = json.error;
            } catch (e) {
                if (txt) errMsg = txt;
            }
            throw new Error(errMsg);
        }
    } catch (e: any) {
        // If it fails (e.g., no internet or server error), bubble it up to the UI so we DON'T lose the drafted post!
        throw new Error(e.message || 'Network request failed. You must be connected to a node to post.');
    }

    // 2. Local Database Confirmation
    // Only save to SQLite AFTER the server has safely accepted it, preventing the background sync from wiping our un-synced draft
    await database.runAsync(
        `INSERT INTO posts (id, type, category, title, description, credits, author_pubkey, created_at, lat, lng, price_type, repeatable, photos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [post.id, post.type, post.category, post.title, post.description, post.credits,
         post.author_pubkey, post.created_at, post.lat || null, post.lng || null,
         post.price_type || 'fixed', post.repeatable || 0, post.photos || null]
    );
}

export async function createProject(project: { title: string, description: string, goal_amount: number }) {
    await waitForInit();
    await acquireSyncLock();
    try {
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
        if (!anchorUrl) {
            throw new Error('You are currently offline. Please connect to a BeanPool Node to propose your project.');
        }

        const identity = await loadIdentity();
        if (!identity) {
            throw new Error('No identity found.');
        }

        const projectId = Crypto.randomUUID();

        const body = {
            id: projectId,
            creatorPubkey: identity.publicKey,
            title: project.title,
            description: project.description,
            photos: [], // Phase 4 MVP: no photos yet
            goalAmount: project.goal_amount,
            deadlineAt: null,
        };
        const bodyString = JSON.stringify(body);

        const privateKeyBytes = hexToBytes(identity.privateKey);
        const messageBytes = encodeUtf8(bodyString);
        const signatureBytes = await sign(messageBytes, privateKeyBytes);
        const signatureBase64 = encodeBase64(signatureBytes);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        let res;
        try {
            res = await fetch(`${anchorUrl}/api/crowdfund/projects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Public-Key': identity.publicKey,
                    'X-Signature': signatureBase64,
                },
                body: bodyString,
                signal: controller.signal,
            });
        } catch (e: any) {
            throw new Error(e.message || 'Network request failed. You must be connected to a node to propose projects.');
        } finally {
            clearTimeout(timeoutId);
        }

        if (!res.ok) {
            const txt = await res.text();
            let errMsg = 'Network request failed or server rejected the project.';
            try {
                const json = JSON.parse(txt);
                if (json.error) errMsg = json.error;
            } catch (e) {
                if (txt) errMsg = txt;
            }
            throw new Error(errMsg);
        }

        // Save to SQLite
        const database = await getDb();
        await database.runAsync(
            `INSERT INTO projects (id, creator_pubkey, title, description, photos, goal_amount, current_amount, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, 'ACTIVE', ?)`,
            [projectId, identity.publicKey, project.title, project.description, JSON.stringify([]), project.goal_amount, new Date().toISOString()]
        );
    } finally {
        releaseSyncLock();
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
    await acquireSyncLock();
    try {
        const database = await getDb();
        
        // Full-replace sync: server response is the source of truth
    if (delta.accounts) {
        for (const acc of delta.accounts) {
            await database.runAsync(
                'INSERT OR REPLACE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, ?, ?)',
                [acc.public_key ?? null, acc.balance ?? 0, acc.last_demurrage_epoch ?? 0]
            );
        }
    }
    
    if (delta.members && delta.members.length > 0) {
        let sql = 'BEGIN TRANSACTION;\n';
        for (const m of delta.members) {
            const pk = (m.publicKey || m.public_key || '').replace(/'/g, "''");
            const cs = (m.callsign || '').replace(/'/g, "''");
            const av = m.avatarUrl || m.avatar_url ? `'${m.avatarUrl.replace(/'/g, "''")}'` : 'NULL';
            sql += `INSERT OR REPLACE INTO members (public_key, callsign, avatar_url) VALUES ('${pk}', '${cs}', ${av});\n`;
        }
        sql += 'COMMIT;';
        await database.execAsync(sql);
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
            // Delta Sync: Server dataset only transmits modified rows.
            // Deleted posts are transmitted with active=0 and tombstoned here natively.
            for (const p of delta.posts) {
                await database.runAsync(
                    'INSERT OR REPLACE INTO posts (id, type, category, title, description, credits, author_pubkey, lat, lng, photos, price_type, repeatable, status, accepted_by, accepted_by_callsign, pending_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
                        p.photos ? JSON.stringify(p.photos.filter((url: string) => !url.startsWith('file://'))) : null,
                        p.price_type || p.priceType || 'fixed',
                        p.repeatable ? 1 : 0,
                        p.status || 'active',
                        p.accepted_by || p.acceptedBy || null,
                        p.accepted_by_callsign || p.acceptedByCallsign || null,
                        p.pending_transaction_id || p.pendingTransactionId || null
                    ]
                );
            }
        }

        if (delta.projects !== undefined) {
            for (const proj of delta.projects) {
                await database.runAsync(
                    'INSERT OR REPLACE INTO projects (id, creator_pubkey, title, description, photos, goal_amount, current_amount, deadline_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        proj.id ?? null,
                        proj.creatorPubkey ?? proj.creator_pubkey ?? null,
                        proj.title ?? null,
                        proj.description ?? '',
                        proj.photos ? JSON.stringify(proj.photos.filter((url: string) => !url.startsWith('file://'))) : null,
                        proj.goalAmount ?? proj.goal_amount ?? 0,
                        proj.currentAmount ?? proj.current_amount ?? 0,
                        proj.deadlineAt ?? proj.deadline_at ?? null,
                        proj.status ?? 'ACTIVE',
                        proj.createdAt ?? proj.created_at ?? new Date().toISOString()
                    ]
                );
            }
        }

        console.log(`[DB] applyDelta: replaced posts table with ${delta.posts?.length || 0} posts from server`);
    } finally {
        releaseSyncLock();
    }
}

export async function syncMessages(publicKey: string) {
    await acquireSyncLock();
    try {
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
        if (!anchorUrl) return;
        const database = await getDb();
        
        const controller1 = new AbortController();
        const timeout1 = setTimeout(() => controller1.abort(), 10000);
        
        const [convRes, dirRes] = await Promise.all([
            fetch(`${anchorUrl}/api/messages/conversations/${publicKey}`, { headers: { 'Accept': 'application/json' }, signal: controller1.signal }),
            fetch(`${anchorUrl}/api/members`, { headers: { 'Accept': 'application/json' }, signal: controller1.signal }).catch(() => null)
        ]);
        clearTimeout(timeout1);
        
        if (dirRes && dirRes.ok) {
            try {
                const dirData = await dirRes.json();
                if (Array.isArray(dirData) && dirData.length > 0) {
                    let sql = 'BEGIN TRANSACTION;\n';
                    for (const m of dirData) {
                        const pk = (m.publicKey || m.public_key || '').replace(/'/g, "''");
                        const cs = (m.callsign || '').replace(/'/g, "''");
                        const av = m.avatarUrl || m.avatar_url ? `'${m.avatarUrl.replace(/'/g, "''")}'` : 'NULL';
                        sql += `INSERT OR REPLACE INTO members (public_key, callsign, avatar_url) VALUES ('${pk}', '${cs}', ${av});\n`;
                    }
                    sql += 'COMMIT;';
                    await database.execAsync(sql);
                }
            } catch (e) {}
        }

        if (!convRes.ok) return;
        
        const convData = await convRes.json();
        if (!convData.conversations) return;
        
        for (const conv of convData.conversations) {
            const localConv = await database.getFirstAsync<any>('SELECT id FROM conversations WHERE id = ?', [conv.id]);
            if (!localConv) {
                await database.runAsync('INSERT INTO conversations (id, type, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)', 
                    [conv.id, conv.type || 'dm', conv.name || null, conv.createdBy || '', conv.createdAt || new Date().toISOString()]);
                
                if (Array.isArray(conv.participants)) {
                    for (const pub of conv.participants) {
                        await database.runAsync('INSERT OR IGNORE INTO conversation_participants (conversation_id, public_key) VALUES (?, ?)', [conv.id, pub]);
                    }
                }
            }
            
            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), 5000);
            const msgRes = await fetch(`${anchorUrl}/api/messages/${conv.id}`, { headers: { 'Accept': 'application/json' }, signal: controller2.signal });
            clearTimeout(timeout2);
            if (!msgRes.ok) continue;
            
            const msgData = await msgRes.json();
            const messages = msgData.messages;
            if (!Array.isArray(messages)) continue;
            
            for (const m of messages) {
                await database.runAsync(
                    'INSERT OR IGNORE INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                    [m.id, conv.id, m.author_pubkey || m.authorPubkey || '', m.ciphertext || '', m.nonce || '', m.timestamp || m.created_at || new Date().toISOString()]
                );
            }
        }
    } catch (err) {
        console.log('[Sync] Failed to pull messages natively', err);
    } finally {
        releaseSyncLock();
    }
}

export async function syncSingleConversation(conversationId: string) {
    await acquireSyncLock();
    try {
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
        if (!anchorUrl) return;
        
        const database = await getDb();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const msgRes = await fetch(`${anchorUrl}/api/messages/${conversationId}`, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
        clearTimeout(timeout);
        
        if (!msgRes.ok) return;
        
        const msgData = await msgRes.json();
        const messages = msgData.messages;
        if (!Array.isArray(messages)) return;
        
        for (const m of messages) {
            await database.runAsync(
                'INSERT OR IGNORE INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                [m.id, conversationId, m.author_pubkey || m.authorPubkey || '', m.ciphertext || '', m.nonce || '', m.timestamp || m.created_at || new Date().toISOString()]
            );
        }
    } catch (err) {
        // Silent catch for background polling
    } finally {
        releaseSyncLock();
    }
}

export async function getConversation(id: string, myPubkey?: string) {
    const database = await getDb();
    if (myPubkey) {
        return await database.getFirstAsync<any>(`
            SELECT c.name,
            (SELECT memb.callsign FROM conversation_participants cp 
             LEFT JOIN members memb ON memb.public_key = cp.public_key
             WHERE cp.conversation_id = c.id AND cp.public_key != ? LIMIT 1) as otherCallsign
            FROM conversations c 
            WHERE id = ?`, [myPubkey, id]);
    }
    return await database.getFirstAsync<any>('SELECT name FROM conversations WHERE id = ?', [id]);
}

export async function getMessages(conversationId: string) {
    const database = await getDb();
    const rows = await database.getAllAsync<any>(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC', 
        [conversationId]
    );
    return rows.map(row => {
        let displayTxt = row.ciphertext;
        if (row.nonce && row.nonce.startsWith('plaintext')) {
            try {
                displayTxt = decodeUtf8(decodeBase64(row.ciphertext));
            } catch {
                displayTxt = '[Encrypted]';
            }
        }
        return {
            id: row.id,
            senderId: row.author_pubkey,
            text: displayTxt,
            timestamp: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
    });
}

export async function insertMessage(conversationId: string, authorPubkey: string, text: string) {
    const database = await getDb();
    const id = Date.now().toString();
    const timestamp = new Date().toISOString();
    
    // Exact parity with PWA encodePlaintext()
    const nonce = 'plaintext-v1'; 
    const ciphertext = encodeBase64(encodeUtf8(text));

    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) {
        throw new Error('You are off-grid. Please connect to a BeanPool Node to send secure messages.');
    }

    const identity = await loadIdentity();
    if (!identity) throw new Error('No identity found.');

    const body = {
        conversationId,
        authorPubkey,
        ciphertext,
        nonce
    };
    const bodyString = JSON.stringify(body);

    const privateKeyBytes = hexToBytes(identity.privateKey);
    const messageBytes = encodeUtf8(bodyString);
    const signatureBytes = await sign(messageBytes, privateKeyBytes);
    const signatureBase64 = encodeBase64(signatureBytes);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${anchorUrl}/api/messages/send`, {
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
            const txt = await res.text();
            let errMsg = 'Failed to deliver message.';
            try {
                const json = JSON.parse(txt);
                if (json.error) errMsg = json.error;
            } catch (e) {
                if (txt) errMsg = txt;
            }
            throw new Error(errMsg);
        }
    } catch (e: any) {
        throw new Error(e.message || 'Network request failed. Message unable to be sent.');
    }

    // Safely write to physical storage since the node accepted it
    await database.runAsync(
        'INSERT INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [id, conversationId, authorPubkey, ciphertext, nonce, timestamp]
    );
}

export async function createConversationApi(type: 'dm' | 'group', participants: string[], createdBy: string, name?: string): Promise<any> {
    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) throw new Error('You are off-grid. Please connect to a node first.');

    const identity = await loadIdentity();
    if (!identity) throw new Error('No identity found.');

    const body: any = { type, participants, createdBy };
    if (name) body.name = name;

    const bodyString = JSON.stringify(body);
    const privateKeyBytes = hexToBytes(identity.privateKey);
    const messageBytes = encodeUtf8(bodyString);
    const signatureBytes = await sign(messageBytes, privateKeyBytes);
    const signatureBase64 = encodeBase64(signatureBytes);

    try {
        const res = await fetch(`${anchorUrl}/api/messages/conversation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Public-Key': identity.publicKey,
                'X-Signature': signatureBase64,
            },
            body: bodyString,
        });

        if (!res.ok) {
            const txt = await res.text();
            let errMsg = 'Failed to create conversation thread.';
            try { const json = JSON.parse(txt); if (json.error) errMsg = json.error; } catch (e) { if (txt) errMsg = txt; }
            throw new Error(errMsg);
        }
        const data = await res.json();
        return data.conversation;
    } catch (e: any) {
        throw new Error(e.message || 'Network request failed when creating thread.');
    }
}

export async function redeemInvite(code: string, callsign: string): Promise<boolean> {
    try {
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url') || 'https://review.beanpool.org:8443';

        const identity = await loadIdentity();
        if (!identity) throw new Error('No identity to register');

        const body = { code, publicKey: identity.publicKey, callsign };
        const bodyString = JSON.stringify(body);

        const privateKeyBytes = hexToBytes(identity.privateKey);
        const messageBytes = encodeUtf8(bodyString);
        const signatureBytes = await sign(messageBytes, privateKeyBytes);
        
        const signatureBase64 = encodeBase64(signatureBytes);

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

// ==========================================
// MARKETPLACE TRANSACTION AND RATING HELPERS
// ==========================================

async function _signedRequest(endpoint: string, payload: any) {
    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) throw new Error('You are off-grid. Please connect to a BeanPool Node to perform this action.');

    const identity = await loadIdentity();
    if (!identity) throw new Error('No identity found. You must be logged in.');

    const bodyString = JSON.stringify(payload);
    const privateKeyBytes = hexToBytes(identity.privateKey);
    const messageBytes = encodeUtf8(bodyString);
    const signatureBytes = await sign(messageBytes, privateKeyBytes);
    const signatureBase64 = encodeBase64(signatureBytes);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let res;
    try {
        res = await fetch(`${anchorUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Public-Key': identity.publicKey,
                'X-Signature': signatureBase64,
            },
            body: bodyString,
            signal: controller.signal
        });
    } catch (e: any) {
        clearTimeout(timeoutId);
        throw new Error(e.message || 'Network request failed. You must be connected to a node.');
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
        let errorMsg = `Server returned ${res.status}`;
        try {
            const errJson = await res.json();
            if (errJson.error) errorMsg = errJson.error;
        } catch {
            try {
                const txt = await res.text();
                if (txt) errorMsg = txt;
            } catch {}
        }
        throw new Error(errorMsg);
    }
    
    return await res.json();
}

export async function acceptMarketplacePost(postId: string, buyerPublicKey: string, hours?: number) {
    return _signedRequest('/api/marketplace/posts/accept', { postId, buyerPublicKey, hours });
}

export async function completeMarketplaceTransaction(transactionId: string, confirmerPublicKey: string, finalHours?: number) {
    return _signedRequest('/api/marketplace/transactions/complete', { transactionId, confirmerPublicKey, finalHours });
}

export async function cancelMarketplaceTransaction(transactionId: string, cancellerPublicKey: string) {
    return _signedRequest('/api/marketplace/transactions/cancel', { transactionId, cancellerPublicKey });
}

export async function submitRating(raterPublicKey: string, targetPublicKey: string, score: number, comment: string, transactionId: string) {
    return _signedRequest('/api/members/rate', { raterPublicKey, targetPublicKey, score, comment, transactionId });
}

export async function reportAbuse(reporterPublicKey: string, targetPublicKey: string, reason: string, postId?: string) {
    return _signedRequest('/api/members/report', { reporterPublicKey, targetPublicKey, reason, postId });
}

