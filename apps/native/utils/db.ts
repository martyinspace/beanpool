import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadIdentity } from './identity';
import * as Crypto from 'expo-crypto';
import { sign } from '@noble/ed25519';
import { hexToBytes, encodeBase64, encodeUtf8, decodeBase64, decodeUtf8 } from './crypto';
import { getDatabaseFilenameForNode, addSavedNode } from './nodes';

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
    // Open the local store dynamically corresponding to the currently active Node network.
    const url = await AsyncStorage.getItem('beanpool_anchor_url');
    if (url) await addSavedNode(url); // Auto-track nodes we jump into correctly inside the UI Matrix.
    
    const dbName = getDatabaseFilenameForNode(url);
    db = await SQLite.openDatabaseAsync(dbName, { useNewConnection: true });
    return db;
}

export async function closeDB() {
    if (db) {
        await db.closeAsync();
        db = null;
        dbInitialized = false;
        dbInitPromise = null;
    }
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
    
    // Nuke & Pave Version 3: Typed System Messages
    const versionResult = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if (!versionResult || versionResult.user_version < 3) {
        console.log("🧨 Native DB Version < 3. Nuking messaging tables for Object Attribution Overhaul...");
        await database.execAsync(`
            DROP TABLE IF EXISTS messages;
            DROP TABLE IF EXISTS conversation_participants;
            DROP TABLE IF EXISTS conversations;
        `);
        await database.execAsync('PRAGMA user_version = 3');
    }

    // We execute the same exact schema.sql payload to guarantee 1:1 API compatibility locally
    const schema = `
        -- 1. Members and Profiles
        CREATE TABLE IF NOT EXISTS members (
            public_key TEXT PRIMARY KEY,
            callsign TEXT NOT NULL,
            joined_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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
            last_updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            last_demurrage_epoch INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            from_pubkey TEXT NOT NULL,
            to_pubkey TEXT NOT NULL,
            amount REAL NOT NULL CHECK (amount > 0),
            memo TEXT,
            timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
            created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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

        -- 4. Marketplace Transactions
        CREATE TABLE IF NOT EXISTS marketplace_transactions (
            id TEXT PRIMARY KEY,
            post_id TEXT NOT NULL,
            buyer_pubkey TEXT NOT NULL,
            seller_pubkey TEXT NOT NULL,
            credits REAL NOT NULL,
            hours REAL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            completed_at DATETIME,
            cover_image TEXT
        );

        -- 5. Messaging & Chat
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            post_id TEXT,
            name TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
            type TEXT DEFAULT 'text',
            system_type TEXT,
            metadata TEXT,
            timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON messages(conversation_id, timestamp ASC);

        -- 6. Relations (Friends, Ratings, Abuse)
        CREATE TABLE IF NOT EXISTS ratings (
            id TEXT PRIMARY KEY,
            target_pubkey TEXT NOT NULL,
            rater_pubkey TEXT NOT NULL,
            role TEXT NOT NULL,
            stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
            comment TEXT,
            transaction_id TEXT,
            created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE(rater_pubkey, transaction_id)
        );
        
        -- 7. Projects
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
            created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
        
        try {
            await database.execAsync(`ALTER TABLE projects ADD COLUMN photos TEXT;`);
        } catch (e) {
            // Column likely already exists, ignore
        }

        // Add missing columns introduced in the State Engine patch
        try {
            await database.execAsync(`ALTER TABLE posts ADD COLUMN updated_at DATETIME;`);
            console.log('[SQLite] Successfully added updated_at column');
        } catch (e) {
            // Column likely already exists, ignore
        }
        
        try {
            await database.execAsync(`ALTER TABLE posts ADD COLUMN origin_node TEXT;`);
        } catch (e) {
            // Column likely already exists, ignore
        }

        // Add cover_image to marketplace_transactions
        try {
            await database.execAsync(`ALTER TABLE marketplace_transactions ADD COLUMN cover_image TEXT;`);
        } catch (e) {}

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
        // Ratings table migration for legacy setups where Schema wasn't ran
        try { 
            await database.execAsync(`
                CREATE TABLE IF NOT EXISTS ratings (
                    id TEXT PRIMARY KEY,
                    target_pubkey TEXT NOT NULL,
                    rater_pubkey TEXT NOT NULL,
                    role TEXT NOT NULL,
                    stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
                    comment TEXT,
                    transaction_id TEXT,
                    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                    UNIQUE(rater_pubkey, transaction_id)
                );
            `);
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
    
    // Reset flags to force schema recreation
    dbInitialized = false;
    dbInitPromise = null;
    
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
        WHERE p.status IN ('active', 'pending', 'completed')
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
        SELECT c.id, c.name, c.post_id, p.title as postTitle, p.status as postStatus, m.ciphertext as lastMessage, m.nonce as lastNonce, m.type as lastMsgType, m.system_type as lastSysType, MAX(m.timestamp) as timestamp,
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
        LEFT JOIN posts p ON c.post_id = p.id
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
            postId: row.post_id,
            postTitle: row.postTitle,
            postStatus: row.postStatus,
            peer: row.name || row.otherCallsign || row.id.slice(0, 8),
            lastMessage: displayMsg,
            lastMsgType: row.lastMsgType,
            lastSysType: row.lastSysType,
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
    const commons = await database.getFirstAsync<any>('SELECT balance FROM accounts WHERE public_key = "COMMONS" OR public_key = "commons"');
    
    // Background fetch to ensure parity
    AsyncStorage.getItem('beanpool_anchor_url').then((anchorUrl: string | null) => {
        if (!anchorUrl) return;
        const { DeviceEventEmitter } = require('react-native');
        fetch(`${anchorUrl}/api/ledger/balance/${pubkey}?_t=${Date.now()}`)
            .then(res => res.json())
            .then(async balData => {
                let changed = false;
                if (typeof balData.balance === 'number') {
                    if (balData.balance !== (row?.balance || 0)) changed = true;
                    await database.runAsync(
                        'INSERT OR REPLACE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, ?, ?)',
                        [pubkey, balData.balance, balData.last_demurrage_epoch || 0]
                    );
                }
                if (typeof balData.commonsBalance === 'number') {
                    if (balData.commonsBalance !== (commons?.balance || 0)) changed = true;
                    await database.runAsync(
                        'INSERT OR REPLACE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, ?, ?)',
                        ['COMMONS', balData.commonsBalance, 0]
                    );
                }
                if (changed) {
                    DeviceEventEmitter.emit('sync_data_updated');
                }
            }).catch(() => null);
    });

    return {
        balance: row?.balance || 0,
        floor: 0,
        commons: commons?.balance || 0
    };
}

export async function getTransactions(pubkey: string) {
    const database = await getDb();
    
    // Background fetch to ensure quick sync of newly released Escrow credits
    const { DeviceEventEmitter } = require('react-native');
    AsyncStorage.getItem('beanpool_anchor_url').then(async (anchorUrl: string | null) => {
        if (!anchorUrl) return;
        try {
            const res = await fetch(`${anchorUrl}/api/ledger/transactions?publicKey=${pubkey}&limit=20&_t=${Date.now()}`);
            if (res.ok) {
                const txns = await res.json();
                if (Array.isArray(txns)) {
                    let newInserted = false;
                    for (const t of txns) {
                        try {
                            const result = await database.runAsync(
                                'INSERT OR IGNORE INTO transactions (id, from_pubkey, to_pubkey, amount, memo, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                                [t.id, t.from, t.to, t.amount, t.memo, t.timestamp]
                            );
                            if (result.changes > 0) newInserted = true;
                        } catch(e) {}
                    }
                    if (newInserted) {
                        DeviceEventEmitter.emit('sync_data_updated');
                    }
                }
            }
        } catch(e) {}
    });

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

export async function getAllCommunityMembers(): Promise<{ publicKey: string; callsign: string }[]> {
    const database = await getDb();
    const rows = await database.getAllAsync<any>("SELECT public_key, callsign FROM members WHERE status IS NULL OR status != 'pruned' ORDER BY callsign COLLATE NOCASE ASC");
    return rows.map(r => ({ publicKey: r.public_key, callsign: r.callsign }));
}

export async function sendTransfer(from: string, to: string, amount: number, memo: string) {
    const res = await _signedRequest('/api/ledger/transfer', { from, to, amount, memo });
    
    // Write new transaction and refresh balances
    try {
        const database = await getDb();
        
        // 1. Insert transaction into local DB so it shows up instantly
        if (res?.transaction) {
            const t = res.transaction;
            const fromKey = t.from_pubkey || t.from || null;
            const toKey = t.to_pubkey || t.to || null;
            await database.runAsync(
                'INSERT OR REPLACE INTO transactions (id, from_pubkey, to_pubkey, amount, memo, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                [t.id || null, fromKey, toKey, t.amount || 0, t.memo || null, t.timestamp || null]
            );
        }

        // 2. Refresh both parties' balances from server
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
        if (anchorUrl) {
            for (const pk of [from, to]) {
                try {
                    const balRes = await fetch(`${anchorUrl}/api/ledger/balance/${pk}?_t=${Date.now()}`);
                    if (balRes.ok) {
                        const balData = await balRes.json();
                        await database.runAsync(
                            'INSERT OR REPLACE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, ?, ?)',
                            [pk, balData.balance || 0, balData.last_demurrage_epoch || 0]
                        );
                    }
                } catch {}
            }
        }
        
        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit('transaction_completed');
        DeviceEventEmitter.emit('sync_data_updated');
    } catch (e) {
        console.warn('[Transfer] Transaction save / balance refresh failed:', e);
    }
    
    return res;
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
    const rows = await database.getAllAsync<any>(`
        SELECT p.*, m.callsign as creator_callsign
        FROM projects p
        LEFT JOIN members m ON p.creator_pubkey = m.public_key
        ORDER BY p.created_at DESC
    `);
    return rows.map(row => ({
        ...row,
        goal: row.goal_amount,
        current: row.current_amount,
        type: 'community' // fallback mapping
    }));
}

export async function getProjectById(id: string) {
    const database = await getDb();
    const row = await database.getFirstAsync<any>(`
        SELECT p.*, m.callsign as creator_callsign
        FROM projects p
        LEFT JOIN members m ON p.creator_pubkey = m.public_key
        WHERE p.id = ?;
    `, [id]);
    if (!row) return null;
    return {
        ...row,
        goal: row.goal_amount,
        current: row.current_amount,
        type: 'community'
    };
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
        id: post.id,
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

export async function createProject(project: {
    title: string;
    description: string;
    goal_amount: number;
    photos?: string[];
    deadline_at?: string | null;
}) {
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
            photos: project.photos || [],
            goalAmount: project.goal_amount,
            deadlineAt: project.deadline_at || null,
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
             `INSERT INTO projects (id, creator_pubkey, title, description, photos, goal_amount, current_amount, status, created_at, deadline_at)
              VALUES (?, ?, ?, ?, ?, ?, 0, 'ACTIVE', ?, ?)`,
             [projectId, identity.publicKey, project.title, project.description, JSON.stringify(project.photos || []), project.goal_amount, new Date().toISOString(), project.deadline_at || null]
        );
    } finally {
        releaseSyncLock();
    }
}


export async function updateCrowdfundProjectApi(
    projectId: string,
    title: string,
    description: string,
    photos: string[],
    goalAmount: number,
    deadlineAt?: string | null
) {
    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) {
        throw new Error('You are currently offline. Please connect to a BeanPool Node to update your project.');
    }

    const identity = await loadIdentity();
    if (!identity) {
        throw new Error('No identity found.');
    }

    const body = {
        id: projectId,
        creatorPubkey: identity.publicKey,
        title,
        description,
        photos,
        goalAmount,
        deadlineAt: deadlineAt || null,
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
        res = await fetch(`${anchorUrl}/api/crowdfund/projects/update`, {
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
        throw new Error(e.message || 'Network request failed. You must be connected to a node to update projects.');
    } finally {
        clearTimeout(timeoutId);
    }

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Failed to update project.');
    }

    // Update local SQLite
    const database = await getDb();
    if (deadlineAt !== undefined) {
         await database.runAsync(
             `UPDATE projects SET title = ?, description = ?, photos = ?, goal_amount = ?, deadline_at = ?
              WHERE id = ? AND creator_pubkey = ?`,
             [title, description, JSON.stringify(photos), goalAmount, deadlineAt, projectId, identity.publicKey]
         );
    } else {
         await database.runAsync(
             `UPDATE projects SET title = ?, description = ?, photos = ?, goal_amount = ?
              WHERE id = ? AND creator_pubkey = ?`,
             [title, description, JSON.stringify(photos), goalAmount, projectId, identity.publicKey]
         );
    }
}

export async function deleteCrowdfundProjectApi(projectId: string) {
    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) {
        throw new Error('You are currently offline. Please connect to a BeanPool Node to delete your project.');
    }

    const identity = await loadIdentity();
    if (!identity) {
        throw new Error('No identity found.');
    }

    const body = {
        id: projectId,
        creatorPubkey: identity.publicKey
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
        res = await fetch(`${anchorUrl}/api/crowdfund/projects/delete`, {
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
        throw new Error(e.message || 'Network request failed. You must be connected to a node to delete projects.');
    } finally {
        clearTimeout(timeoutId);
    }
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to delete project: ${errorText}`);
    }
    
    // Local SQLite Cascade Delete
    const database = await getDb();
    await database.runAsync(`DELETE FROM projects WHERE id = ?;`, [projectId]);
}

export async function pledgeToCrowdfundProjectApi(projectId: string, amount: number, memo: string) {
    const identity = await loadIdentity();
    if (!identity) throw new Error("No identity block found");

    const res = await _signedRequest(`/api/crowdfund/projects/${projectId}/pledge`, { 
        fromPubkey: identity.publicKey, 
        amount: amount, 
        memo: memo 
    });

    const database = await getDb();
    await database.runAsync(
        'UPDATE projects SET current_amount = current_amount + ? WHERE id = ?',
        [amount, projectId]
    );

    const txId = Crypto.randomUUID();
    const dt = new Date().toISOString();
    await database.runAsync('INSERT INTO ledger_entries (id, timestamp, pubkey, amount, balance_after, memo, reference_id, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        txId, dt, identity.publicKey, -Math.abs(amount), 0, memo, projectId, 'pledge'
    ]);

    return res;
}

export async function updatePost(id: string, updates: any) {
    const identity = await loadIdentity();
    if (!identity) throw new Error('Not logged in. Identity required.');

    // 1. Broadcast UPDATE to remote network
    await _signedRequest('/api/marketplace/posts/update', { 
        id, 
        authorPublicKey: identity.publicKey, 
        type: updates.type,
        category: updates.category,
        title: updates.title,
        description: updates.description,
        credits: updates.credits,
        priceType: updates.price_type || 'fixed',
        repeatable: updates.repeatable,
        photos: updates.photos ? JSON.parse(updates.photos) : undefined
    });

    // 2. Erase from local SQLite Cache (or gracefully update it)
    const database = await getDb();
    await database.runAsync(
        `UPDATE posts SET type = ?, category = ?, title = ?, description = ?, credits = ?, price_type = ?, repeatable = ?, photos = ? WHERE id = ?`,
        [updates.type, updates.category, updates.title, updates.description, updates.credits, updates.price_type || 'fixed', updates.repeatable ? 1 : 0, updates.photos || null, id]
    );
}

export async function deletePost(id: string) {
    // 1. Enforce Online Connection & Broadcast First
    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) throw new Error('Action requires internet connection.');

    const identity = await loadIdentity();
    if (!identity) throw new Error('Not logged in. Identity required.');

    const payload = JSON.stringify({ id, authorPublicKey: identity.publicKey });
    
    const privateKeyBytes = hexToBytes(identity.privateKey);
    const messageBytes = encodeUtf8(payload);
    const signatureBytes = await sign(messageBytes, privateKeyBytes);
    const signature = encodeBase64(signatureBytes);
    
    try {
        const res = await fetch(`${anchorUrl}/api/marketplace/posts/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Public-Key': identity.publicKey, 'X-Signature': signature },
            body: payload
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to remove post on Node');
        }
    } catch (e: any) {
        throw new Error(`Offline or anchor node unreachable: ${e.message}`);
    }

    // 2. Erase from local SQLite Cache
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
        for (const m of delta.members) {
            const pk = m.publicKey || m.public_key || '';
            const cs = m.callsign || '';
            const av = m.avatarUrl || m.avatar_url || null;
            await database.runAsync('INSERT OR REPLACE INTO members (public_key, callsign, avatar_url) VALUES (?, ?, ?)', [pk, cs, av]);
        }
    }
    
    if (delta.transactions) {
            for (const t of delta.transactions) {
                const fromKey = t.from_pubkey || t.from || null;
                const toKey = t.to_pubkey || t.to || null;
                await database.runAsync(
                    'INSERT OR REPLACE INTO transactions (id, from_pubkey, to_pubkey, amount, memo, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                    [t.id ?? null, fromKey, toKey, t.amount ?? 0, t.memo ?? null, t.timestamp ?? null]
                );
            }
        }

        if (delta.posts !== undefined) {
            // Delta Sync: Server dataset only transmits modified rows.
            // Deleted posts are transmitted with active=0 and tombstoned here natively.
            for (const p of delta.posts) {
                await database.runAsync(
                    'INSERT OR REPLACE INTO posts (id, type, category, title, description, credits, author_pubkey, lat, lng, photos, price_type, repeatable, status, active, accepted_by, accepted_by_callsign, accepted_at, completed_at, pending_transaction_id, created_at, updated_at, origin_node) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
                        p.active !== undefined ? (p.active ? 1 : 0) : 1, // Defaulting to 1 if active boolean isn't provided
                        p.accepted_by || p.acceptedBy || null,
                        p.accepted_by_callsign || p.acceptedByCallsign || null,
                        p.accepted_at || p.acceptedAt || null,
                        p.completed_at || p.completedAt || null,
                        p.pending_transaction_id || p.pendingTransactionId || null,
                        p.created_at || p.createdAt || null,
                        p.updated_at || p.updatedAt || null,
                        p.origin_node || p.originNode || null
                    ]
                );
            }
        }

        if (delta.marketplaceTransactions !== undefined) {
            console.log(`[DB] applying ${delta.marketplaceTransactions.length} marketplace_transactions...`);
            for (const tx of delta.marketplaceTransactions) {
                await database.runAsync(
                    'INSERT OR REPLACE INTO marketplace_transactions (id, post_id, buyer_pubkey, seller_pubkey, credits, hours, status, created_at, completed_at, cover_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        tx.id ?? null,
                        tx.postId ?? tx.post_id ?? null,
                        tx.buyerPublicKey ?? tx.buyer_pubkey ?? null,
                        tx.sellerPublicKey ?? tx.seller_pubkey ?? null,
                        tx.credits ?? 0,
                        tx.hours ?? null,
                        tx.status ?? 'pending',
                        tx.createdAt ?? tx.created_at ?? new Date().toISOString(),
                        tx.completedAt ?? tx.completed_at ?? null,
                        tx.coverImage ?? tx.cover_image ?? null
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
                        proj.photos ? JSON.stringify((typeof proj.photos === 'string' ? JSON.parse(proj.photos) : proj.photos).filter((url: string) => !url.startsWith('file://'))) : null,
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
                    for (const m of dirData) {
                        const pk = m.publicKey || m.public_key || '';
                        const cs = m.callsign || '';
                        const av = m.avatarUrl || m.avatar_url || null;
                        await database.runAsync('INSERT OR REPLACE INTO members (public_key, callsign, avatar_url) VALUES (?, ?, ?)', [pk, cs, av]);
                    }
                }
            } catch (e) {}
        }

        if (!convRes.ok) return;
        
        const convData = await convRes.json();
        if (!convData.conversations) return;
        
        for (const conv of convData.conversations) {
            const localConv = await database.getFirstAsync<any>('SELECT id FROM conversations WHERE id = ?', [conv.id]);
            if (!localConv) {
                await database.runAsync('INSERT INTO conversations (id, type, post_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', 
                    [conv.id, conv.type || 'dm', conv.postId || null, conv.name || null, conv.createdBy || '', conv.createdAt || new Date().toISOString()]);
                
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
                    'INSERT OR IGNORE INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, type, system_type, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [m.id, conv.id, m.author_pubkey || m.authorPubkey || '', m.ciphertext || '', m.nonce || '', m.type || 'text', m.systemType || m.system_type || null, m.metadata || null, m.timestamp || m.created_at || new Date().toISOString()]
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
                'INSERT OR IGNORE INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, type, system_type, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [m.id, conversationId, m.author_pubkey || m.authorPubkey || '', m.ciphertext || '', m.nonce || '', m.type || 'text', m.systemType || m.system_type || null, m.metadata || null, m.timestamp || m.created_at || new Date().toISOString()]
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
            SELECT c.name, c.post_id as postId, p.title as postTitle, p.status as postStatus, p.price_type, p.credits,
            (SELECT memb.callsign FROM conversation_participants cp 
             LEFT JOIN members memb ON memb.public_key = cp.public_key
             WHERE cp.conversation_id = c.id AND cp.public_key != ? LIMIT 1) as otherCallsign
            FROM conversations c 
            LEFT JOIN posts p ON c.post_id = p.id
            WHERE c.id = ?`, [myPubkey, id]);
    }
    return await database.getFirstAsync<any>('SELECT name, post_id as postId FROM conversations WHERE id = ?', [id]);
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
            type: row.type || 'text',
            systemType: row.system_type,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            timestamp: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
    });
}

export async function insertMessage(conversationId: string, authorPubkey: string, text: string) {
    const database = await getDb();
    
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
        
        const data = await res.json();
        const serverMsg = data.message;
        
        // Safely write to physical storage since the node accepted it using the Server-vetted UUID
        await database.runAsync(
            'INSERT INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
            [serverMsg.id, conversationId, authorPubkey, ciphertext, nonce, serverMsg.timestamp]
        );
        
    } catch (e: any) {
        throw new Error(e.message || 'Network request failed. Message unable to be sent.');
    }
}

export async function createConversationApi(type: 'dm' | 'group', participants: string[], createdBy: string, name?: string, postId?: string): Promise<any> {
    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) throw new Error('You are off-grid. Please connect to a node first.');

    const identity = await loadIdentity();
    if (!identity) throw new Error('No identity found.');

    const body: any = { type, participants, createdBy };
    if (name) body.name = name;
    if (postId) body.postId = postId;

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

export async function redeemInvite(code: string, callsign: string, identityToRegister?: any): Promise<boolean> {
    try {
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url') || (__DEV__ ? 'https://127.0.0.1:8443' : 'https://review.beanpool.org:8443');

        const identity = identityToRegister || await loadIdentity();
        if (!identity) throw new Error('No identity to register');

        const isOfflineTicket = code.startsWith('BP-') && code.length > 20;
        const codePayload = code.startsWith('BP-') ? code.slice(3) : code;
        const body = isOfflineTicket 
            ? { ticketB64: codePayload, publicKey: identity.publicKey, callsign }
            : { code: codePayload, publicKey: identity.publicKey, callsign };
        const bodyString = JSON.stringify(body);

        const privateKeyBytes = hexToBytes(identity.privateKey);
        const messageBytes = encodeUtf8(bodyString);
        const signatureBytes = await sign(messageBytes, privateKeyBytes);
        
        const signatureBase64 = encodeBase64(signatureBytes);

        const endpoint = isOfflineTicket ? '/api/invite/redeem-offline' : '/api/invite/redeem';

        const res = await fetch(`${anchorUrl}${endpoint}`, {
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
    const res = await _signedRequest('/api/marketplace/posts/accept', { postId, buyerPublicKey, hours });
    try {
        const database = await getDb();
        // Store both accepted_by AND pending_transaction_id from server response
        const txId = res?.transaction?.id || null;
        console.log(`[Escrow] Offer accepted — txId=${txId}, postId=${postId}`);
        const postParam = await database.getFirstAsync<{ repeatable: number }>('SELECT repeatable FROM posts WHERE id = ?', [postId]);
        if (postParam?.repeatable !== 1) {
            await database.runAsync(
                "UPDATE posts SET status = 'pending', accepted_by = ?, pending_transaction_id = ? WHERE id = ?",
                [buyerPublicKey, txId, postId]
            );
        }
        
        // Also store the marketplace transaction locally so completion can find it
        if (res?.transaction) {
            const tx = res.transaction;
            await database.runAsync(
                'INSERT OR REPLACE INTO marketplace_transactions (id, post_id, buyer_pubkey, seller_pubkey, credits, hours, status, created_at, cover_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [tx.id, tx.postId || postId, tx.buyerPublicKey || buyerPublicKey, tx.sellerPublicKey || null, tx.credits || 0, tx.hours || null, tx.status || 'pending', tx.createdAt || new Date().toISOString(), tx.coverImage || null]
            );
        }

        // Refresh buyer balance immediately (escrow just deducted from them)
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
        if (anchorUrl) {
            try {
                const balRes = await fetch(`${anchorUrl}/api/ledger/balance/${buyerPublicKey}?_t=${Date.now()}`);
                if (balRes.ok) {
                    const balData = await balRes.json();
                    await database.runAsync(
                        'INSERT OR REPLACE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, ?, ?)',
                        [buyerPublicKey, balData.balance || 0, balData.last_demurrage_epoch || 0]
                    );
                    console.log(`[Escrow] Buyer balance after escrow lock: ${balData.balance}B`);
                }
            } catch (e) {
                console.warn('[Escrow] Balance refresh failed:', e);
            }
        }
        
        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit('sync_data_updated');
    } catch(e) {
        console.error('[Escrow] acceptMarketplacePost local update failed:', e);
    }
    return res;
}

export async function completeMarketplaceTransaction(transactionId: string, confirmerPublicKey: string, finalHours?: number) {
    const res = await _signedRequest('/api/marketplace/transactions/complete', { transactionId, confirmerPublicKey, finalHours });
    console.log(`[Escrow] Server complete response:`, JSON.stringify(res));
    try {
        const database = await getDb();
        const postParam = await database.getFirstAsync<{ repeatable: number, id: string }>('SELECT id, repeatable FROM posts WHERE pending_transaction_id = ?', [transactionId]);
        if (postParam && postParam.repeatable !== 1) {
            await database.runAsync("UPDATE posts SET status = 'completed' WHERE pending_transaction_id = ?", [transactionId]);
        }
        await database.runAsync("UPDATE marketplace_transactions SET status = 'completed', completed_at = ? WHERE id = ?", [new Date().toISOString(), transactionId]);
        
        // Get both pubkeys from the server response (reliable even if local DB hasn't synced)
        const buyerPubkey = res?.transaction?.buyerPublicKey || confirmerPublicKey;
        const sellerPubkey = res?.transaction?.sellerPublicKey || null;
        console.log(`[Escrow] Completing: buyer=${buyerPubkey?.slice(0,8)}, seller=${sellerPubkey?.slice(0,8)}, credits=${res?.transaction?.credits}`);
        
        // Immediately refresh BOTH parties' balances from server
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
        if (anchorUrl) {
            const pubkeysToRefresh = [buyerPubkey, sellerPubkey].filter(Boolean) as string[];
            for (const pk of pubkeysToRefresh) {
                try {
                    const balRes = await fetch(`${anchorUrl}/api/ledger/balance/${pk}?_t=${Date.now()}`);
                    if (balRes.ok) {
                        const balData = await balRes.json();
                        await database.runAsync(
                            'INSERT OR REPLACE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, ?, ?)',
                            [pk, balData.balance || 0, balData.last_demurrage_epoch || 0]
                        );
                        console.log(`[Escrow] Balance refreshed for ${pk.slice(0,8)}: ${balData.balance}B`);
                    } else {
                        console.warn(`[Escrow] Balance fetch failed for ${pk.slice(0,8)}: HTTP ${balRes.status}`);
                    }
                } catch (e) {
                    console.warn(`[Escrow] Balance refresh error for ${pk.slice(0,8)}:`, e);
                }
            }
        } else {
            console.warn('[Escrow] No anchor URL — cannot refresh balances');
        }
        
        // Emit events so Ledger screen refreshes immediately
        const { DeviceEventEmitter } = require('react-native');
        DeviceEventEmitter.emit('transaction_completed');
        DeviceEventEmitter.emit('sync_data_updated');
        console.log('[Escrow] Events emitted, UI should refresh');
    } catch(e) {
        console.error('[Escrow] completeMarketplaceTransaction local update failed:', e);
    }
    return res;
}

export async function cancelMarketplaceTransaction(transactionId: string, cancellerPublicKey: string) {
    const res = await _signedRequest('/api/marketplace/transactions/cancel', { transactionId, cancellerPublicKey });
    try {
        const database = await getDb();
        const postParam = await database.getFirstAsync<{ repeatable: number }>('SELECT repeatable FROM posts WHERE pending_transaction_id = ?', [transactionId]);
        if (postParam && postParam.repeatable !== 1) {
            await database.runAsync("UPDATE posts SET status = 'active', accepted_by = NULL, pending_transaction_id = NULL WHERE pending_transaction_id = ?", [transactionId]);
        }
        await database.runAsync("UPDATE marketplace_transactions SET status = 'cancelled' WHERE id = ?", [transactionId]);
    } catch(e) {}
    return res;
}

export async function requestMarketplacePost(postId: string, buyerPublicKey: string, hours?: number) {
    // Unlike 'accept', requesting does not lock the post. It just creates a requested transaction.
    return _signedRequest('/api/marketplace/posts/request', { postId, buyerPublicKey, hours });
}

export async function approveMarketplaceRequest(transactionId: string, authorPublicKey: string) {
    const res = await _signedRequest('/api/marketplace/transactions/approve', { transactionId, authorPublicKey });
    try {
        const database = await getDb();
        // The transaction becomes pending, and the post becomes pending unless repeatable.
        const postParam = await database.getFirstAsync<{ repeatable: number }>('SELECT repeatable FROM posts WHERE id = (SELECT post_id FROM marketplace_transactions WHERE id = ?)', [transactionId]);
        if (postParam?.repeatable !== 1) {
            await database.runAsync("UPDATE posts SET status = 'pending', pending_transaction_id = ? WHERE id = (SELECT post_id FROM marketplace_transactions WHERE id = ?)", [transactionId, transactionId]);
        }
        await database.runAsync("UPDATE marketplace_transactions SET status = 'pending' WHERE id = ?", [transactionId]);
    } catch(e) {}
    return res;
}

export async function rejectMarketplaceRequest(transactionId: string, authorPublicKey: string) {
    const res = await _signedRequest('/api/marketplace/transactions/reject', { transactionId, authorPublicKey });
    try {
        const database = await getDb();
        await database.runAsync("UPDATE marketplace_transactions SET status = 'rejected' WHERE id = ?", [transactionId]);
    } catch(e) {}
    return res;
}

export async function cancelMarketplaceRequest(transactionId: string, buyerPublicKey: string) {
    const res = await _signedRequest('/api/marketplace/transactions/cancel-request', { transactionId, buyerPublicKey });
    try {
        const database = await getDb();
        await database.runAsync("UPDATE marketplace_transactions SET status = 'cancelled' WHERE id = ?", [transactionId]);
    } catch(e) {}
    return res;
}

export async function reportAbuse(reporterPublicKey: string, targetPublicKey: string, reason: string, postId?: string) {
    return _signedRequest('/api/reports', { reporterPubkey: reporterPublicKey, targetPubkey: targetPublicKey, reason, targetPostId: postId });
}


export async function submitRating(raterPublicKey: string, targetPublicKey: string, rating: number, comment: string, transactionId?: string) {
    return _signedRequest('/api/ratings', { raterPubkey: raterPublicKey, targetPubkey: targetPublicKey, stars: rating, comment, transactionId });
}

export async function getMemberRatings(publicKey: string): Promise<{ ratings: any[]; average: number; count: number; asProvider: { average: number; count: number }; asReceiver: { average: number; count: number } }> {
    const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
    if (!anchorUrl) {
        // Return default empty state if offline
        return { ratings: [], average: 0, count: 0, asProvider: { average: 0, count: 0 }, asReceiver: { average: 0, count: 0 } };
    }
    
    try {
        const res = await fetch(`${anchorUrl}/api/ratings/${publicKey}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch ratings: ${res.statusText}`);
        }
        return await res.json();
    } catch (e: any) {
        console.warn('Failed to fetch ratings, defaulting to 0:', e.message);
        return { ratings: [], average: 0, count: 0, asProvider: { average: 0, count: 0 }, asReceiver: { average: 0, count: 0 } };
    }
}

export async function getMarketplaceTransactions(publicKey: string, filter?: { status?: string }, limit = 50, offset = 0) {
    const database = await getDb();
    let query = `
        SELECT mt.*, p.title as postTitle, m1.callsign as buyerCallsign, m2.callsign as sellerCallsign,
               EXISTS(SELECT 1 FROM ratings r WHERE r.transaction_id = mt.id AND r.rater_pubkey = mt.buyer_pubkey) as ratedByBuyer,
               EXISTS(SELECT 1 FROM ratings r WHERE r.transaction_id = mt.id AND r.rater_pubkey = mt.seller_pubkey) as ratedBySeller
        FROM marketplace_transactions mt
        LEFT JOIN posts p ON mt.post_id = p.id
        LEFT JOIN members m1 ON mt.buyer_pubkey = m1.public_key
        LEFT JOIN members m2 ON mt.seller_pubkey = m2.public_key
        WHERE (mt.buyer_pubkey = ? OR mt.seller_pubkey = ?)
    `;
    const params: any[] = [publicKey, publicKey];
    if (filter?.status) { 
        query += " AND mt.status = ?"; 
        params.push(filter.status); 
    }
    query += " ORDER BY mt.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = await database.getAllAsync<any>(query, params);
    return rows.map(r => ({
        id: r.id, 
        postId: r.post_id, 
        postTitle: r.postTitle, 
        buyerPublicKey: r.buyer_pubkey, 
        buyerCallsign: r.buyerCallsign, 
        sellerPublicKey: r.seller_pubkey, 
        sellerCallsign: r.sellerCallsign, 
        credits: r.credits, 
        status: r.status, 
        createdAt: r.created_at, 
        completedAt: r.completed_at,
        coverImage: r.cover_image,
        ratedByBuyer: !!r.ratedByBuyer,
        ratedBySeller: !!r.ratedBySeller
    }));
}
