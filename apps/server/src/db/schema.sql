-- 1. Members and Profiles
CREATE TABLE IF NOT EXISTS members (
    public_key TEXT PRIMARY KEY,
    callsign TEXT NOT NULL,
    joined_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    invited_by TEXT REFERENCES members(public_key),
    invite_code TEXT,
    home_node_url TEXT,
    
    avatar_url TEXT,
    bio TEXT,
    contact_value TEXT,
    contact_visibility TEXT,
    status TEXT DEFAULT 'active',
    last_active_at DATETIME
);

-- 2. Invite Codes
CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES members(public_key),
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    used_by TEXT REFERENCES members(public_key),
    used_at DATETIME,
    intended_for TEXT
);

-- 3. Ledger Accounts & Transactions
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

-- 4. Marketplace Posts & Photos
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    credits REAL NOT NULL DEFAULT 0,
    author_pubkey TEXT NOT NULL REFERENCES members(public_key),
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    active INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'paused', 'completed', 'cancelled')),
    price_type TEXT DEFAULT 'fixed',
    repeatable INTEGER DEFAULT 0,
    accepted_by TEXT REFERENCES members(public_key),
    accepted_at DATETIME,
    pending_transaction_id TEXT,
    completed_at DATETIME,
    lat REAL,
    lng REAL,
    origin_node TEXT,
    updated_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CONSTRAINT lat_lng_check CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_active_posts ON posts(created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

CREATE TABLE IF NOT EXISTS post_photos (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    photo_data TEXT NOT NULL,
    order_num INTEGER NOT NULL,
    PRIMARY KEY (post_id, order_num)
);

-- 5. Marketplace Transactions
CREATE TABLE IF NOT EXISTS marketplace_transactions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id),
    buyer_pubkey TEXT NOT NULL,
    seller_pubkey TEXT NOT NULL,
    credits REAL NOT NULL,
    hours REAL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at DATETIME
);

-- 6. Messaging & Chat
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    name TEXT,
    created_by TEXT REFERENCES members(public_key),
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    public_key TEXT REFERENCES members(public_key),
    last_read_at DATETIME,
    PRIMARY KEY (conversation_id, public_key)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    author_pubkey TEXT NOT NULL REFERENCES members(public_key),
    ciphertext TEXT NOT NULL,
    nonce TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    system_type TEXT,
    metadata TEXT,
    timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON messages(conversation_id, timestamp ASC);

-- 7. Relations (Friends, Ratings, Abuse)
CREATE TABLE IF NOT EXISTS friends (
    owner_pubkey TEXT REFERENCES members(public_key),
    friend_pubkey TEXT REFERENCES members(public_key),
    added_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    is_guardian INTEGER DEFAULT 0,
    PRIMARY KEY (owner_pubkey, friend_pubkey)
);

CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    target_pubkey TEXT NOT NULL REFERENCES members(public_key),
    rater_pubkey TEXT NOT NULL REFERENCES members(public_key),
    role TEXT NOT NULL,
    stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    comment TEXT,
    transaction_id TEXT REFERENCES marketplace_transactions(id),
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(rater_pubkey, transaction_id)
);

CREATE TABLE IF NOT EXISTS abuse_reports (
    id TEXT PRIMARY KEY,
    reporter_pubkey TEXT NOT NULL REFERENCES members(public_key),
    target_pubkey TEXT NOT NULL REFERENCES members(public_key),
    target_post_id TEXT,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 8. Config
CREATE TABLE IF NOT EXISTS node_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 9. Community Crowdfunding Projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    creator_pubkey TEXT NOT NULL REFERENCES members(public_key),
    title TEXT NOT NULL,
    description TEXT,
    photos TEXT, -- JSON array of URLs
    goal_amount INTEGER NOT NULL,
    current_amount INTEGER DEFAULT 0,
    deadline_at DATETIME,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'FUNDED', 'FAILED', 'COMPLETED'
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 10. Invite Links (Deferred Deep Linking Shortener)
CREATE TABLE IF NOT EXISTS invite_links (
    hash_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

