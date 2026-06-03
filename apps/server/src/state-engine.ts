import crypto from 'node:crypto';
import { LedgerManager, COMMONS_BALANCE, setCommonsBalance, calculateDynamicFloor, getTier, getGenesisEarnedCredit, PROTOCOL_CONSTANTS } from '@beanpool/core';
import type { TrustStats, TierInfo, GenesisInviteType } from '@beanpool/core';
import { getThresholds, getLocalConfig } from './local-config.js';
import { db, initSchema, migrateLegacyState, writeTombstone } from './db/db.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPrivateKey } from './p2p.js';
import { publicKeyToProtobuf, publicKeyFromProtobuf } from '@libp2p/crypto/keys';

// Load synonym map for FTS5 search keyword expansion
const __filename_se = fileURLToPath(import.meta.url);
const __dirname_se = dirname(__filename_se);
const synonymMap: Record<string, string[]> = (() => {
    try {
        const raw = readFileSync(join(__dirname_se, 'db', 'synonyms.json'), 'utf-8');
        const parsed = JSON.parse(raw);
        delete parsed._meta;
        return parsed;
    } catch (e) {
        console.warn('[FTS] Failed to load synonyms.json, search keywords will be minimal:', e);
        return {};
    }
})();

/**
 * Generate hidden search keywords by expanding post content through the synonym map.
 * e.g. title "Fresh Lemons" → keywords "fruit citrus produce food tree"
 */
export function generateSearchKeywords(title: string, description: string, category: string): string {
    const text = `${title} ${description}`.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const words = text.split(/\s+/).filter(w => w.length > 2);
    const expanded = new Set<string>();
    expanded.add(category);

    // Try exact match first, then strip common suffixes (lemons→lemon, mowing→mow)
    const lookup = (word: string): string[] | undefined => {
        if (synonymMap[word]) return synonymMap[word];
        if (word.endsWith('ies')) { const stem = word.slice(0, -3) + 'y'; if (synonymMap[stem]) return synonymMap[stem]; }
        if (word.endsWith('es')) { const stem = word.slice(0, -2); if (synonymMap[stem]) return synonymMap[stem]; }
        if (word.endsWith('s')) { const stem = word.slice(0, -1); if (synonymMap[stem]) return synonymMap[stem]; }
        if (word.endsWith('ing')) { const stem = word.slice(0, -3); if (synonymMap[stem]) return synonymMap[stem]; }
        if (word.endsWith('ed')) { const stem = word.slice(0, -2); if (synonymMap[stem]) return synonymMap[stem]; }
        return undefined;
    };

    for (const word of words) {
        const syns = lookup(word);
        if (syns) {
            for (const syn of syns) expanded.add(syn);
        }
    }
    // Also check multi-word phrases (up to 3 words)
    const allWords = text.split(/\s+/);
    for (let i = 0; i < allWords.length - 1; i++) {
        const two = `${allWords[i]} ${allWords[i+1]}`;
        if (synonymMap[two]) {
            for (const syn of synonymMap[two]) expanded.add(syn);
        }
        if (i < allWords.length - 2) {
            const three = `${allWords[i]} ${allWords[i+1]} ${allWords[i+2]}`;
            if (synonymMap[three]) {
                for (const syn of synonymMap[three]) expanded.add(syn);
            }
        }
    }
    return [...expanded].join(' ');
}

// ===================== TYPES =====================

export interface Member {
    publicKey: string;
    callsign: string;
    joinedAt: string;
    invitedBy: string;
    inviteCode: string;
    homeNodeUrl?: string;
    avatarUrl?: string | null;
    status?: 'active' | 'migrated' | 'pruned' | 'flagged' | string;
    profileUpdatedAt?: number | null;
    bio?: string | null;
    contactValue?: string | null;
    contactVisibility?: string | null;
    lastActiveAt?: string | null;
    /** Source-of-truth mutation watermark used by delta sync for last-writer-wins conflict resolution. */
    updatedAt?: string | null;
}

export interface InviteCode {
    code: string;
    createdBy: string;
    createdAt: string;
    usedBy: string | null;
    usedAt: string | null;
    intendedFor?: string;
}

export interface MarketplacePost {
    id: string;
    type: 'offer' | 'need';
    category: string;
    title: string;
    description: string;
    credits: number;
    priceType: 'fixed' | 'hourly';
    authorPublicKey: string;
    authorCallsign: string;
    createdAt: string;
    updatedAt?: string;
    active: boolean;
    status: 'active' | 'pending' | 'paused' | 'completed' | 'cancelled';
    repeatable: boolean;
    acceptedBy?: string;
    acceptedByCallsign?: string;
    acceptedAt?: string;
    pendingTransactionId?: string;
    completedAt?: string;
    lat?: number;
    lng?: number;
    photos?: string[];
    originNode?: string;
    authorEnergyCycled?: number;
    authorAvatarUrl?: string | null;
}

export interface MarketplaceTransaction {
    id: string;
    postId: string;
    postTitle: string;
    buyerPublicKey: string;
    buyerCallsign: string;
    sellerPublicKey: string;
    sellerCallsign: string;
    credits: number;
    hours?: number;
    status: 'pending' | 'completed' | 'cancelled';
    createdAt: string;
    completedAt?: string;
}

export interface Transaction {
    id: string;
    from: string;
    to: string;
    amount: number;
    memo: string;
    timestamp: string;
}

export interface MemberProfile {
    publicKey: string;
    avatar: string | null;
    bio: string;
    contact: {
        value: string;
        visibility: 'hidden' | 'trade_partners' | 'community' | 'friends';
    } | null;
    callsign?: string;
    lastActiveAt?: string;
    status?: 'active' | 'disabled' | 'pruned';
}

export interface Conversation {
    id: string;
    type: 'dm' | 'group';
    postId?: string;
    postTitle?: string;
    postStatus?: string;
    postPhoto?: string | null;
    lastMsgType?: string;
    lastSysType?: string;
    name: string | null;
    participants: string[];
    peerCallsign?: string;
    peerAvatar?: string | null;
    createdBy: string;
    createdAt: string;
}

export interface Message {
    id: string;
    conversationId: string;
    authorPubkey: string;
    ciphertext: string;
    nonce: string;
    type?: 'text' | 'system';
    systemType?: SystemMessageType;
    metadata?: string;
    timestamp: string;
}

export enum SystemMessageType {
    ESCROW_CREATED = 'ESCROW_CREATED',
    ESCROW_FUNDED = 'ESCROW_FUNDED',
    ESCROW_RELEASED = 'ESCROW_RELEASED',
    ESCROW_CANCELLED = 'ESCROW_CANCELLED',
    DISPUTE_OPENED = 'DISPUTE_OPENED',
    REVIEW_LEFT = 'REVIEW_LEFT'
}

export interface SystemMessageMetadata {
    amount?: number;        // The Ʀ involved
    postId: string;         // Link back to the original post
    actorPubkey: string;    // Who triggered the event (Buyer/Seller)
    txHash?: string;        // The ledger transaction ID for verification
}

export interface Rating {
    id: string;
    targetPubkey: string;
    raterPubkey: string;
    stars: number;
    comment: string;
    role: 'provider' | 'receiver';
    transactionId: string;
    createdAt: string;
}

export interface AbuseReport {
    id: string;
    reporterPubkey: string;
    targetPubkey: string;
    targetPostId?: string;
    reason: string;
    createdAt: string;
}

export interface FriendEntry {
    publicKey: string;
    callsign: string;
    addedAt: string;
    isGuardian: boolean;
}

export interface RecoveryRequest {
    id: string;
    oldPubkey: string;
    newPubkey: string;
    status: 'pending' | 'approved' | 'cancelled' | 'expired' | 'executed';
    quorumRequired: number;
    createdAt: string;
    cooldownUntil?: string;
    executedAt?: string;
    expiresAt: string;
}

export interface RecoveryApproval {
    requestId: string;
    guardianPubkey: string;
    decision: 'approve' | 'reject';
    createdAt: string;
}

export interface CommunityProject {
    id: string;
    title: string;
    description: string;
    proposerPubkey: string;
    proposerCallsign: string;
    requestedAmount: number;
    status: 'proposed' | 'active' | 'funded' | 'rejected' | 'completed';
    votes: { pubkey: string; weight: number; creditsUsed?: number }[];
    createdAt: string;
    fundedAt?: string;
}

export interface VotingRound {
    id: string;
    status: 'open' | 'closed';
    closesAt: string;
    projectIds: string[];
    createdBy: string;
    createdAt: string;
}

export interface NodeConfig {
    serviceRadius?: { lat: number; lng: number; radiusKm: number };
    publishLocation?: boolean;
    publishMembers?: boolean;
    publishContacts?: boolean;
    publishHealth?: boolean;
    directoryPushIntervalHours?: number;
    lastDirectoryPush?: string;
}

// ===================== STATE =====================

const ledger = new LedgerManager();
const wsClients: Set<any> = new Set();

// ===================== INIT =====================

export function initStateEngine(): void {
    initSchema();
    migrateLegacyState();
    
    // Seed SYSTEM user securely bypassing foreign key constraints
    db.pragma('foreign_keys = OFF');
    try {
        db.prepare("INSERT OR IGNORE INTO members (public_key, callsign, invited_by, invite_code) VALUES ('SYSTEM', 'System', 'genesis', 'genesis')").run();
    } finally {
        db.pragma('foreign_keys = ON');
    }

    // Load ledger accounts into LedgerManager
    const accounts = db.prepare("SELECT public_key as id, balance, last_demurrage_epoch as lastDemurrageEpoch FROM accounts").all() as any[];
    if (accounts.length > 0) {
        ledger.loadState(accounts);
    }

    // CRITICAL: Restore persisted commons balance from DB
    // Without this, COMMONS_BALANCE resets to 0 on every restart, destroying accumulated demurrage
    const commonsRow = db.prepare("SELECT balance FROM accounts WHERE public_key = 'COMMONS_POOL'").get() as any;
    if (commonsRow && commonsRow.balance > 0) {
        setCommonsBalance(commonsRow.balance);
        console.log(`🏛️ Restored Commons Pool balance: ${commonsRow.balance.toFixed(2)}`);
    } else {
        // Seed the COMMONS_POOL account if it doesn't exist
        db.prepare("INSERT OR IGNORE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES ('COMMONS_POOL', 0, 0)").run();
        console.log(`🏛️ Commons Pool account seeded (starting from 0)`);
    }

    // Start periodic persistence of commons balance (every 5 minutes)
    setInterval(() => {
        persistCommonsBalance();
    }, 5 * 60 * 1000);

    // One-time migration: move escrow funds from old post-keyed wallets to transaction-keyed wallets
    migrateEscrowWalletKeys();

    // FTS5: Backfill search keywords for existing posts that don't have them
    backfillSearchKeywords();

    // Purge legacy synthetic wallet entries that leaked into the members table
    purgeSyntheticMembers();

    // Sweep zero-balance escrow accounts from settled/cancelled transactions
    sweepSettledEscrowAccounts();

    const memberCount = db.prepare("SELECT COUNT(*) as c FROM members").get() as any;
    const postCount = db.prepare("SELECT COUNT(*) as c FROM posts").get() as any;
    console.log(`📒 SQLite DB initialized: ${memberCount.c} members, ${postCount.c} posts`);
}

/**
 * One-time backfill: Generate search keywords for all existing posts that lack them.
 * Also rebuilds the FTS5 index to ensure it's in sync.
 */
function backfillSearchKeywords(): void {
    const posts = db.prepare(`SELECT id, title, description, category FROM posts WHERE search_keywords = '' OR search_keywords IS NULL`).all() as any[];
    if (posts.length === 0) return;

    console.log(`🔍 Backfilling FTS5 search keywords for ${posts.length} posts...`);
    
    // Step 1: Drop and recreate FTS5 table + triggers to avoid corruption
    // (external content table gets out of sync when rows existed before triggers were created)
    try {
        db.exec(`DROP TRIGGER IF EXISTS posts_ai`);
        db.exec(`DROP TRIGGER IF EXISTS posts_ad`);
        db.exec(`DROP TRIGGER IF EXISTS posts_au`);
        db.exec(`DROP TABLE IF EXISTS posts_fts`);
    } catch (e) {
        console.warn('[FTS] Cleanup failed:', e);
    }

    // Step 2: Update keywords on all posts
    const update = db.prepare(`UPDATE posts SET search_keywords = ? WHERE id = ?`);
    db.transaction(() => {
        for (const p of posts) {
            const keywords = generateSearchKeywords(p.title || '', p.description || '', p.category || 'general');
            update.run(keywords, p.id);
        }
    })();

    // Step 3: Recreate FTS5 table and triggers (now all data has keywords)
    try {
        db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
                title, description, search_keywords,
                content='posts',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
                INSERT INTO posts_fts(rowid, title, description, search_keywords)
                VALUES (new.rowid, new.title, new.description, new.search_keywords);
            END;

            CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
                INSERT INTO posts_fts(posts_fts, rowid, title, description, search_keywords)
                VALUES ('delete', old.rowid, old.title, old.description, old.search_keywords);
            END;

            CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
                INSERT INTO posts_fts(posts_fts, rowid, title, description, search_keywords)
                VALUES ('delete', old.rowid, old.title, old.description, old.search_keywords);
                INSERT INTO posts_fts(rowid, title, description, search_keywords)
                VALUES (new.rowid, new.title, new.description, new.search_keywords);
            END;
        `);
        // Rebuild index with all current data
        db.exec(`INSERT INTO posts_fts(posts_fts) VALUES('rebuild')`);
    } catch (e) {
        console.warn('[FTS] FTS5 table recreation failed:', e);
    }
    
    console.log(`✅ FTS5 search keywords backfilled for ${posts.length} posts.`);
}

/**
 * One-time migration: Existing pending transactions have funds in escrow_<post_id>.
 * New code expects escrow_<transaction_id>. Move funds from old to new wallet key.
 * Safe to re-run: it checks if the old wallet has a balance before attempting.
 */
function migrateEscrowWalletKeys(): void {
    const pending = db.prepare("SELECT id, post_id, credits FROM marketplace_transactions WHERE status='pending'").all() as any[];
    if (pending.length === 0) return;

    let migrated = 0;
    for (const tx of pending) {
        const oldKey = `escrow_${tx.post_id}`;
        const newKey = `escrow_${tx.id}`;

        // Check if funds are already in the new wallet (already migrated)
        const newAcc = ledger.getAccount(newKey);
        if (newAcc && newAcc.balance > 0) continue;

        // Check if old wallet has funds to migrate
        const oldAcc = ledger.getAccount(oldKey);
        if (!oldAcc || oldAcc.balance <= 0) {
            console.warn(`[Migration] Cannot migrate escrow for tx ${tx.id}: old wallet ${oldKey} has no balance`);
            continue;
        }

        // Transfer whatever the old wallet actually has (may be slightly less than tx.credits due to demurrage).
        // For recurring posts, the old wallet may serve multiple transactions, so take only this tx's share.
        const amountToMove = Math.min(oldAcc.balance, tx.credits);

        // Ensure the new escrow wallet has a row in the accounts table
        db.prepare(`INSERT OR IGNORE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, 0, 0)`).run(newKey);

        // Move funds: old wallet -> new wallet
        const result = transfer(oldKey, newKey, amountToMove, `Escrow wallet key migration: ${oldKey} -> ${newKey}`, 'escrow');
        if (result) {
            migrated++;
            console.log(`[Migration] ✅ Migrated ${amountToMove} beans from ${oldKey} to ${newKey} (original: ${tx.credits})`);
        } else {
            console.error(`[Migration] ❌ Failed to migrate escrow for tx ${tx.id}`);
        }
    }
    if (migrated > 0) {
        console.log(`[Migration] Escrow wallet key migration complete: ${migrated}/${pending.length} transactions migrated`);
    }
}

/**
 * One-time migration: Remove synthetic wallet entries (escrow_*, project_*) that
 * leaked into the members table before the transfer() guard was added.
 * Safe to re-run — only deletes members whose public_key matches synthetic patterns.
 */
function purgeSyntheticMembers(): void {
    const result = db.prepare(
        "DELETE FROM members WHERE public_key LIKE 'escrow_%' OR public_key LIKE 'project_%'"
    ).run();
    if (result.changes > 0) {
        console.log(`🧹 Purged ${result.changes} synthetic wallet entries from members table (escrow_*/project_*)`);
    }
}

/**
 * Sweep zero-balance escrow accounts from completed/cancelled transactions.
 * Only deletes accounts where:
 *   1. public_key starts with 'escrow_'
 *   2. balance is 0
 *   3. No pending marketplace_transaction references that escrow wallet
 * Safe to re-run and to call periodically.
 */
function sweepSettledEscrowAccounts(): void {
    const result = db.prepare(`
        DELETE FROM accounts 
        WHERE public_key LIKE 'escrow_%' 
          AND balance = 0
          AND SUBSTR(public_key, 8) NOT IN (
              SELECT id FROM marketplace_transactions WHERE status IN ('pending', 'requested')
          )
    `).run();
    if (result.changes > 0) {
        console.log(`🧹 Swept ${result.changes} settled escrow accounts with zero balance`);
    }
}

// ===================== WEBSOCKET =====================

export function addWsClient(ws: any): void {
    wsClients.add(ws);
    try {
        const counts = getCommunityInfo();
        ws.send(JSON.stringify({
            type: 'state_snapshot',
            memberCount: counts.memberCount,
            postCount: counts.postCount,
            commonsBalance: COMMONS_BALANCE,
        }));
    } catch { /* ignore */ }
}

export function removeWsClient(ws: any): void {
    wsClients.delete(ws);
}

/**
 * Optional sink for broadcast events beyond the WebSocket fanout — wired by
 * the push-on-write module at init time. Kept as a setter (rather than a direct
 * import) to avoid a state-engine ↔ push-on-write circular dependency.
 */
type BroadcastHook = (event: any) => void;
let broadcastHook: BroadcastHook | null = null;
export function setBroadcastHook(hook: BroadcastHook | null): void {
    broadcastHook = hook;
}

function broadcast(event: any): void {
    const msg = JSON.stringify(event);
    for (const ws of wsClients) {
        try { ws.send(msg); } catch { wsClients.delete(ws); }
    }
    if (broadcastHook) {
        try { broadcastHook(event); } catch (e: any) {
            console.error('[Broadcast hook error]', e?.message || e);
        }
    }
}

// ===================== DB HELPERS =====================

export function assertMemberActive(publicKey: string): void {
    if (publicKey.startsWith('escrow_') || publicKey.startsWith('project_')) return;
    const member = db.prepare("SELECT status FROM members WHERE public_key = ?").get(publicKey) as any;
    if (!member) throw new Error('Member not found');
    if (member.status === 'disabled') throw new Error('Account is disabled');
    if (member.status === 'pruned') throw new Error('Account has been pruned');
}

export function assertProfileComplete(publicKey: string): void {
    const member = db.prepare("SELECT avatar_url, callsign FROM members WHERE public_key = ?").get(publicKey) as any;
    if (!member) return; // Let assertMemberActive handle missing members
    if (!member.avatar_url) {
        throw new Error('Please set a profile photo before using the marketplace. Tap your profile to add one.');
    }
    if (!member.callsign || member.callsign.trim().length < 2) {
        throw new Error('Please set a display name before using the marketplace.');
    }
}

function rowToMember(row: any): Member {
    if (!row) return row;
    return {
        publicKey: row.public_key,
        callsign: row.callsign,
        joinedAt: row.joined_at,
        invitedBy: row.invited_by,
        inviteCode: row.invite_code,
        homeNodeUrl: row.home_node_url,
        avatarUrl: row.avatar_url || null,
        profileUpdatedAt: row.profile_updated_at || null,
        bio: row.bio || null,
        contactValue: row.contact_value || null,
        contactVisibility: row.contact_visibility || null,
        status: row.status || 'active',
        lastActiveAt: row.last_active_at || null,
        updatedAt: row.updated_at || null,
    };
}

function rowToProfile(row: any): MemberProfile {
    if (!row) return row;
    return {
        publicKey: row.public_key,
        avatar: row.avatar_url,
        bio: row.bio || '',
        contact: row.contact_value ? { value: row.contact_value, visibility: row.contact_visibility } : null,
        status: row.status,
        lastActiveAt: row.last_active_at,
        callsign: row.callsign
    };
}

// ===================== MEMBERS =====================

export function seedGenesisMember(adminPublicKey: string, callsign: string): Member {
    const existing = db.prepare("SELECT * FROM members WHERE public_key = ?").get(adminPublicKey) as any;
    if (existing) {
        db.prepare("UPDATE members SET invited_by = 'genesis', invite_code = 'genesis' WHERE public_key = ?").run(adminPublicKey);
        return getMember(adminPublicKey)!;
    }
    // Genesis bootstrap: temporarily disable FK checks because invited_by='genesis'
    // violates the self-referencing FK (no member with public_key='genesis' exists).
    db.pragma('foreign_keys = OFF');
    try {
        db.transaction(() => {
            db.prepare(`INSERT INTO members (public_key, callsign, joined_at, invited_by, invite_code) 
                        VALUES (?, ?, ?, ?, ?)`).run(adminPublicKey, callsign, new Date().toISOString(), 'genesis', 'genesis');
            db.prepare(`INSERT INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, 0, 0)`).run(adminPublicKey);
        })();
    } finally {
        db.pragma('foreign_keys = ON');
    }
    ledger.initializeGenesisAccount(adminPublicKey);
    console.log(`👑 Genesis member seeded: ${callsign}`);
    return getMember(adminPublicKey)!;
}

function registerMemberInternal(publicKey: string, callsign: string, invitedBy: string | null, inviteCode: string | null): Member | null {
    // Callsign validation: require 2+ non-whitespace characters
    if (!callsign || callsign.trim().length < 2) {
        console.warn(`[Security] Rejected registration with invalid callsign "${callsign}" for ${publicKey}`);
        return null;
    }
    callsign = callsign.trim();

    const existing = db.prepare("SELECT * FROM members WHERE public_key = ?").get(publicKey) as any;
    if (existing) {
        db.prepare("UPDATE members SET callsign = ? WHERE public_key = ?").run(callsign, publicKey);
        broadcast({ type: 'profile_updated', publicKey });
        return getMember(publicKey)!;
    }

    // SECURITY PATCH: Prevent open registration. If they don't exist and don't have an invite, block them.
    if (!inviteCode && !invitedBy) {
        console.warn(`[Security] Blocked unauthorized open registration attempt for ${callsign} (${publicKey})`);
        return null;
    }

    db.transaction(() => {
        db.prepare(`INSERT INTO members (public_key, callsign, joined_at, invited_by, invite_code) 
                    VALUES (?, ?, ?, ?, ?)`).run(publicKey, callsign, new Date().toISOString(), invitedBy, inviteCode);
        db.prepare(`INSERT INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, 0, 0)`).run(publicKey);
    })();
    ledger.initializeGenesisAccount(publicKey);
    const member = getMember(publicKey)!;
    broadcast({ type: 'member_joined', member });
    console.log(`👤 New member: ${callsign} invited by ${invitedBy ? invitedBy.substring(0, 12) : 'system'}...`);
    return member;
}

export function registerMember(publicKey: string, callsign: string): Member | null {
    return registerMemberInternal(publicKey, callsign, null, null);
}

export function registerVisitor(publicKey: string, callsign?: string, homeNodeUrl?: string): void {
    const existing = db.prepare("SELECT * FROM members WHERE public_key = ?").get(publicKey) as any;
    if (existing) {
        if (callsign && existing.callsign.startsWith('Visitor-')) {
            db.prepare("UPDATE members SET callsign = ? WHERE public_key = ?").run(callsign, publicKey);
        }
        if (homeNodeUrl && !existing.home_node_url) {
            db.prepare("UPDATE members SET home_node_url = ? WHERE public_key = ?").run(homeNodeUrl, publicKey);
        }
        return;
    }
    const generatedCallsign = callsign || `Visitor-${publicKey.substring(0, 8)}`;
    db.transaction(() => {
        db.prepare(`INSERT INTO members (public_key, callsign, joined_at, invited_by, invite_code, home_node_url) 
                    VALUES (?, ?, ?, ?, ?, ?)`).run(publicKey, generatedCallsign, new Date().toISOString(), null, null, homeNodeUrl || null);
        db.prepare(`INSERT INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, 0, 0)`).run(publicKey);
    })();
    ledger.initializeGenesisAccount(publicKey);
    console.log(`🌐 Visitor registered: ${generatedCallsign} (federation${homeNodeUrl ? ` from ${homeNodeUrl}` : ''})`);
}

export function getMembers(): Member[] {
    const rows = db.prepare("SELECT * FROM members WHERE status != 'pruned'").all() as any[];
    return rows.map(rowToMember);
}

export function getAllMembers(): Member[] {
    const rows = db.prepare("SELECT * FROM members").all() as any[];
    return rows.map(rowToMember);
}

export function getMember(publicKey: string): Member | undefined {
    const row = db.prepare("SELECT * FROM members WHERE public_key = ?").get(publicKey) as any;
    return row ? rowToMember(row) : undefined;
}

// ===================== INVITE CODES =====================

function generateShortCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = 'INV-';
    for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
    code += '-';
    for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(chars.length)];
    return code;
}

export function generateInvite(inviterPubkey: string, intendedFor?: string): InviteCode | null {
    if (!getMember(inviterPubkey)) return null;

    // Ghost invitation gate: only Resident+ can invite
    const { tier } = getMemberTrustProfile(inviterPubkey);
    if (!tier.canInvite) {
        console.log(`🚫 Ghost invite blocked: ${inviterPubkey.substring(0, 12)} (${tier.name}) attempted to generate invite`);
        return null;
    }

    recordActivity(inviterPubkey);

    const code = generateShortCode();
    const createdAt = new Date().toISOString();
    db.prepare(`INSERT INTO invite_codes (code, created_by, created_at, intended_for) VALUES (?, ?, ?, ?)`).run(code, inviterPubkey, createdAt, intendedFor || null);
    const invite: InviteCode = { code, createdBy: inviterPubkey, createdAt, usedBy: null, usedAt: null, intendedFor };
    const inviter = getMember(inviterPubkey);
    console.log(`🎟️  Invite generated: ${code} by ${inviter?.callsign || inviterPubkey.substring(0, 12)}`);
    return invite;
}

/**
 * Admin-only invite generation — bypasses Ghost tier gate and supports tiered genesis invites.
 * The genesis type is stored on the invite code and applied during redemption.
 */
export function adminGenerateInvite(adminPubkey: string, genesisType: GenesisInviteType = 'standard', intendedFor?: string): InviteCode | null {
    if (!getMember(adminPubkey)) return null;
    recordActivity(adminPubkey);

    const code = generateShortCode();
    const createdAt = new Date().toISOString();
    db.prepare(`INSERT INTO invite_codes (code, created_by, created_at, intended_for, genesis_type) VALUES (?, ?, ?, ?, ?)`).run(code, adminPubkey, createdAt, intendedFor || null, genesisType);
    const invite: InviteCode = { code, createdBy: adminPubkey, createdAt, usedBy: null, usedAt: null, intendedFor };
    const tierLabel = genesisType === 'standard' ? '👻' : genesisType === 'trusted' ? '🏠' : '🏛️';
    console.log(`🎟️  Admin Genesis Invite generated: ${code} [${genesisType} ${tierLabel}] by ${getMember(adminPubkey)?.callsign || adminPubkey.substring(0, 12)}`);
    return invite;
}

export function redeemInvite(code: string, publicKey: string, callsign: string): { success: boolean; error?: string; member?: Member } {
    const invite = db.prepare("SELECT * FROM invite_codes WHERE code COLLATE NOCASE = ?").get(code) as any;
    if (!invite) return { success: false, error: 'Invalid invite code' };
    if (invite.used_by) return { success: false, error: 'This invite has already been used' };

    if (getMember(publicKey)) return { success: false, error: 'You are already a member' };

    // Register member FIRST — invite_codes.used_by has FK to members(public_key)
    const member = registerMemberInternal(publicKey, callsign, invite.created_by, code);
    if (!member) return { success: false, error: 'Registration failed' };

    db.prepare("UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code COLLATE NOCASE = ?").run(publicKey, new Date().toISOString(), code);

    // Pre-seed earned credit for tiered genesis invites
    const genesisType = (invite.genesis_type || 'standard') as GenesisInviteType;
    if (genesisType !== 'standard') {
        const earnedCredit = getGenesisEarnedCredit(genesisType);
        if (earnedCredit > 0) {
            db.prepare("UPDATE members SET earned_credit = ? WHERE public_key = ?").run(earnedCredit, publicKey);
            const tier = getTier(PROTOCOL_CONSTANTS.CREDIT_BASE_FLOOR - earnedCredit);
            console.log(`🌟 Genesis invite redeemed: ${callsign} starts as ${tier.emoji} ${tier.name} (earned_credit: ${earnedCredit})`);
        }
    }

    return { success: true, member };
}

export function redeemOfflineTicket(ticketB64: string, joinerPublicKey: string, callsign: string): { success: boolean; error?: string; member?: Member } {
    try {
        // Support both standard base64 and url-safe base64 by normalizing back to standard
        const normalizedB64 = ticketB64.replace(/-/g, '+').replace(/_/g, '/');
        const ticketStr = Buffer.from(normalizedB64, 'base64').toString('utf8');
        const ticketObj = JSON.parse(ticketStr);
        const { p: payloadStr, s: signatureBase64 } = ticketObj;
        
        const payloadObj = JSON.parse(payloadStr);
        const { i: inviterPubkey, t: timestamp, f: intendedFor } = payloadObj;

        // 1. Verify Inviter exists (Sybil Protection)
        if (!getMember(inviterPubkey)) return { success: false, error: 'Inviter is not a formally recognized member of this decentralized mesh' };

        // 2. Strict Time-To-Live expiration (7 Days limit)
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - timestamp > SEVEN_DAYS_MS) {
            return { success: false, error: 'This offline ticket has expired (maximum 7 days issuance)' };
        }

        // 3. Mathematical Cryptographic Validation
        const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
        const spki = Buffer.concat([spkiHeader, Buffer.from(inviterPubkey, 'hex')]);
        const publicKeyObject = crypto.createPublicKey({
            key: spki,
            format: 'der',
            type: 'spki'
        });

        const isValid = crypto.verify(
            undefined,
            Buffer.from(payloadStr),
            publicKeyObject,
            Buffer.from(signatureBase64, 'base64')
        );

        if (!isValid) return { success: false, error: 'Invalid cryptographic signature structure' };

        // 4. One-Time Replay Protection Database Matrix
        // We hash the signature to map it perfectly matching traditional shortcodes in length (16-char max)
        const codeHash = crypto.createHash('sha256').update(signatureBase64).digest('hex').substring(0, 16);
        const existingInvite = db.prepare("SELECT * FROM invite_codes WHERE code COLLATE NOCASE = ?").get(codeHash) as any;
        if (existingInvite) {
            if (existingInvite.used_by) return { success: false, error: 'This exact mathematical offline ticket has already been redeemed' };
        } else {
            // First time ingestion into the mesh matrix - structurally inject to SQLite to lock memory
            const createdAt = new Date(timestamp).toISOString();
            db.prepare(`INSERT INTO invite_codes (code, created_by, created_at, intended_for) VALUES (?, ?, ?, ?)`).run(codeHash, inviterPubkey, createdAt, intendedFor || null);
        }

        // 5. Formal Identity Registration
        if (getMember(joinerPublicKey)) return { success: false, error: 'You are already a participating identity on the mesh' };
        recordActivity(inviterPubkey);

        const member = registerMemberInternal(joinerPublicKey, callsign, inviterPubkey, codeHash);
        if (!member) return { success: false, error: 'Registration failed during state sync' };

        // Update the lock
        db.prepare("UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code COLLATE NOCASE = ?").run(joinerPublicKey, new Date().toISOString(), codeHash);

        return { success: true, member };

    } catch (e) {
        return { success: false, error: 'Malformed or broken offline ticket payload' };
    }
}



export function getInvitesByMember(pubkey: string): InviteCode[] {
    const rows = db.prepare("SELECT * FROM invite_codes WHERE created_by = ?").all(pubkey) as any[];
    return rows.map(r => ({
        code: r.code, createdBy: r.created_by, createdAt: r.created_at, usedBy: r.used_by, usedAt: r.used_at, intendedFor: r.intended_for
    }));
}

export interface InviteTreeNode {
    publicKey: string;
    callsign: string;
    joinedAt: string;
    inviteCode: string;
    children: InviteTreeNode[];
}

export function getInviteTree(rootPubkey?: string): InviteTreeNode[] {
    const allMembers = getAllMembers();

    // ⚡ Bolt: Group members by invitedBy to avoid O(N²) nested filtering, turning it to O(N) lookup.
    const membersByInviter = new Map<string, Member[]>();
    for (const m of allMembers) {
        if (m.invitedBy && m.publicKey !== m.invitedBy) {
            if (!membersByInviter.has(m.invitedBy)) {
                membersByInviter.set(m.invitedBy, []);
            }
            membersByInviter.get(m.invitedBy)!.push(m);
        }
    }

    function buildSubtree(parentPubkey: string): InviteTreeNode[] {
        const children = membersByInviter.get(parentPubkey) || [];
        return children
            .map(m => ({
                publicKey: m.publicKey, callsign: m.callsign, joinedAt: m.joinedAt, inviteCode: m.inviteCode,
                children: buildSubtree(m.publicKey),
            }));
    }

    if (rootPubkey) {
        return buildSubtree(rootPubkey);
    }

    const genesisRoots = allMembers.filter(m => (m.invitedBy === 'genesis' || m.publicKey === 'genesis') && m.publicKey !== 'SYSTEM' && !m.publicKey.startsWith('escrow_'));
    if (genesisRoots.length === 0) {
        // Restored DB fallback: treat members with null/missing invitedBy as root(s)
        const roots = allMembers.filter(m => (!m.invitedBy || m.invitedBy === 'system') && m.publicKey !== 'SYSTEM' && !m.publicKey.startsWith('escrow_'));
        if (roots.length > 0) {
            return roots.map(m => ({
                publicKey: m.publicKey, callsign: m.callsign, joinedAt: m.joinedAt, inviteCode: m.inviteCode || '',
                children: buildSubtree(m.publicKey),
            }));
        }
    }
    return genesisRoots.map(m => ({
        publicKey: m.publicKey, callsign: m.callsign, joinedAt: m.joinedAt, inviteCode: m.inviteCode || '',
        children: buildSubtree(m.publicKey),
    }));
}

// ===================== PROFILES =====================

export function updateProfile(publicKey: string, update: {
    avatar?: string | null;
    bio?: string;
    contact?: { value: string; visibility: 'hidden' | 'trade_partners' | 'community' | 'friends' } | null;
    callsign?: string;
}): MemberProfile | null {
    if (!getMember(publicKey)) return null;
    recordActivity(publicKey);
    
    const existing = db.prepare("SELECT * FROM members WHERE public_key = ?").get(publicKey) as any;
    const avatar = update.avatar !== undefined ? update.avatar : existing.avatar_url;
    const bio = typeof update.bio === 'string' ? update.bio.slice(0, 200) : (update.bio === null ? null : existing.bio);
    const callsign = typeof update.callsign === 'string' ? update.callsign.slice(0, 32) : existing.callsign;
    let contact_value = existing.contact_value;
    let contact_visibility = existing.contact_visibility;
    if (update.contact !== undefined) {
        contact_value = update.contact?.value || null;
        contact_visibility = update.contact?.visibility || null;
    }

    const profileUpdatedAt = new Date().toISOString();

    db.prepare(`UPDATE members SET avatar_url=?, bio=?, contact_value=?, contact_visibility=?, callsign=?, profile_updated_at=? WHERE public_key=?`)
      .run(avatar, bio, contact_value, contact_visibility, callsign, profileUpdatedAt, publicKey);
      
    broadcast({ type: 'profile_updated', publicKey, profileUpdatedAt });
    return getProfile(publicKey);
}

export function getProfile(publicKey: string, requesterPubkey?: string): MemberProfile | null {
    const row = db.prepare("SELECT * FROM members WHERE public_key = ?").get(publicKey) as any;
    if (!row) return null;
    const profile = rowToProfile(row);
    if (profile.contact && profile.contact.visibility === 'hidden' && requesterPubkey !== publicKey) {
        profile.contact = null;
    } else if (profile.contact && profile.contact.visibility === 'friends' && requesterPubkey !== publicKey) {
        if (!requesterPubkey) {
            profile.contact = null;
        } else {
            const isFriend = db.prepare("SELECT 1 FROM friends WHERE owner_pubkey=? AND friend_pubkey=?").get(publicKey, requesterPubkey);
            if (!isFriend) profile.contact = null;
        }
    }
    return profile;
}

export function getProfiles(): Record<string, MemberProfile> {
    const rows = db.prepare("SELECT * FROM members WHERE status != 'pruned'").all() as any[];
    const map: Record<string, MemberProfile> = {};
    for (const row of rows) {
        const p = rowToProfile(row);
        if (p.contact && p.contact.visibility !== 'community') p.contact = null;
        map[p.publicKey] = p;
    }
    return map;
}

export function getAllProfiles(requesterPubkey?: string): MemberProfile[] {
    const rows = db.prepare("SELECT * FROM members WHERE status != 'pruned'").all() as any[];
    
    // Batch fetch friends where friend_pubkey is the requesterPubkey
    let friendOwners = new Set<string>();
    if (requesterPubkey) {
        const friendRows = db.prepare("SELECT owner_pubkey FROM friends WHERE friend_pubkey = ?").all(requesterPubkey) as any[];
        friendOwners = new Set(friendRows.map(f => f.owner_pubkey));
    }

    const profiles: MemberProfile[] = [];
    for (const row of rows) {
        const profile = rowToProfile(row);
        const publicKey = profile.publicKey;
        if (profile.contact && requesterPubkey !== publicKey) {
            if (profile.contact.visibility === 'hidden') {
                profile.contact = null;
            } else if (profile.contact.visibility === 'friends') {
                if (!requesterPubkey || !friendOwners.has(publicKey)) {
                    profile.contact = null;
                }
            }
        }
        profiles.push(profile);
    }
    return profiles;
}

// ===================== TRUST STATS =====================

/**
 * Calculates trust metrics for a member used by the dynamic credit formula.
 * Excludes escrow system wallets and self-transactions.
 */
export function getMemberTrustStats(publicKey: string): TrustStats {
    const member = getMember(publicKey);
    if (!member) return { tradeCount: 0, uniquePartners: 0, ageDays: 0 };

    // Trade count: completed transactions excluding escrow system wallets and self-trades
    const tradeCountRow = db.prepare(`
        SELECT COUNT(*) as count FROM transactions 
        WHERE (from_pubkey = ? OR to_pubkey = ?) 
        AND from_pubkey != to_pubkey
        AND from_pubkey NOT LIKE 'escrow_%' 
        AND to_pubkey NOT LIKE 'escrow_%'
        AND from_pubkey != 'SYSTEM'
        AND to_pubkey != 'SYSTEM'
    `).get(publicKey, publicKey) as any;

    // Unique trade partners: distinct counterparties excluding escrow and system
    const uniquePartnersRow = db.prepare(`
        SELECT COUNT(DISTINCT partner) as count FROM (
            SELECT to_pubkey as partner FROM transactions 
            WHERE from_pubkey = ? 
            AND to_pubkey NOT LIKE 'escrow_%' 
            AND to_pubkey != 'SYSTEM'
            AND to_pubkey != ?
            UNION
            SELECT from_pubkey as partner FROM transactions 
            WHERE to_pubkey = ? 
            AND from_pubkey NOT LIKE 'escrow_%' 
            AND from_pubkey != 'SYSTEM'
            AND from_pubkey != ?
        )
    `).get(publicKey, publicKey, publicKey, publicKey) as any;

    // Account age in days
    const joinedAt = member.joinedAt ? new Date(member.joinedAt) : new Date();
    const ageDays = Math.floor((Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
        tradeCount: tradeCountRow?.count || 0,
        uniquePartners: uniquePartnersRow?.count || 0,
        ageDays: Math.max(0, ageDays),
    };
}

/**
 * Returns the full trust profile for a member: stats, floor, ceiling, and tier.
 * Incorporates any pre-seeded earned_credit from admin genesis invites.
 */
export function getMemberTrustProfile(publicKey: string): {
    stats: TrustStats;
    floor: number;

    tier: TierInfo;
    earnedCredit: number;
} {
    const stats = getMemberTrustStats(publicKey);

    // Query pre-seeded earned credit from genesis invites
    const memberRow = db.prepare("SELECT earned_credit FROM members WHERE public_key = ?").get(publicKey) as any;
    const preSeeded = memberRow?.earned_credit || 0;

    // Build augmented stats: add pre-seeded credit as equivalent trade activity
    // This is done by calculating the raw floor first, then subtracting the pre-seeded bonus
    const organicFloor = calculateDynamicFloor(stats);
    const floor = organicFloor - preSeeded; // Pre-seeded credit deepens the floor


    const tier = getTier(floor);
    const c = PROTOCOL_CONSTANTS;
    const organicEarned = (stats.tradeCount * c.CREDIT_WEIGHT_TRADES)
                        + (stats.uniquePartners * c.CREDIT_WEIGHT_PARTNERS)
                        + (stats.ageDays * c.CREDIT_WEIGHT_AGE_DAYS);

    return { stats, floor, tier, earnedCredit: organicEarned + preSeeded };
}

// ===================== LEDGER =====================

export function getVelocityGateStatus(publicKey: string): { active: boolean; dailyLimit?: number; dailyUsed?: number; unlockHours?: number } {
    const member = getMember(publicKey);
    if (!member?.joinedAt) return { active: false };

    const { tier } = getMemberTrustProfile(publicKey);
    if (tier.name !== 'Newcomer') return { active: false };

    const ageHours = (Date.now() - new Date(member.joinedAt).getTime()) / (1000 * 60 * 60);
    const t = getThresholds();
    let dailyLimit: number | null = null;
    let unlockHours = 0;

    if (ageHours < t.ghostVelocityTier1Hours) {
        dailyLimit = t.ghostVelocityTier1Limit;
        unlockHours = Math.ceil(t.ghostVelocityTier1Hours - ageHours);
    } else if (ageHours < t.ghostVelocityTier2Hours) {
        dailyLimit = t.ghostVelocityTier2Limit;
        unlockHours = Math.ceil(t.ghostVelocityTier2Hours - ageHours);
    }

    if (dailyLimit === null) return { active: false };

    const recentSpend = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM transactions 
        WHERE from_pubkey = ? 
          AND timestamp > datetime('now', '-24 hours')
    `).get(publicKey) as any;

    return {
        active: true,
        dailyLimit,
        dailyUsed: Math.round((recentSpend?.total || 0) * 100) / 100,
        unlockHours,
    };
}

export function getBalance(publicKey: string): { balance: number; floor: number; tier: TierInfo; earnedCredit: number; commonsBalance: number; velocityGate?: { active: boolean; dailyLimit?: number; dailyUsed?: number; unlockHours?: number } } {
    const account = ledger.getAccount(publicKey);
    const { floor, tier, earnedCredit } = getMemberTrustProfile(publicKey);
    const velocityGate = getVelocityGateStatus(publicKey);
    return {
        balance: Math.round(account.balance * 100) / 100,
        floor,
        tier,
        earnedCredit,
        commonsBalance: Math.round(COMMONS_BALANCE * 100) / 100,
        ...(velocityGate.active ? { velocityGate } : {}),
    };
}


export function transfer(from: string, to: string, amount: number, memo: string, method?: 'direct' | 'escrow'): Transaction | null {
    if (from !== 'genesis') assertMemberActive(from);
    if (amount < 0) return null;
    // Only register real members — skip synthetic wallets (escrow_*, project_*, etc.)
    if (!from.startsWith('escrow_') && !from.startsWith('project_') && !getMember(from)) registerVisitor(from);
    if (!to.startsWith('escrow_') && !to.startsWith('project_') && !getMember(to)) registerVisitor(to);

    // Ghost gift restriction: Ghosts can only transact via marketplace escrow
    const isEscrow = method === 'escrow' || from.startsWith('escrow_') || to.startsWith('escrow_');
    if (!isEscrow) {
        const { tier } = getMemberTrustProfile(from);
        if (!tier.canGift) {
            console.log(`🚫 Ghost gift blocked: ${from.substring(0, 12)} attempted direct transfer`);
            return null;
        }
    }

    // Ghost Velocity Gate: rate-limit new Ghost accounts to prevent Sybil funneling
    if (!from.startsWith('escrow_') && !from.startsWith('project_') && from !== 'commons' && from !== 'genesis') {
        const sender = getMember(from);
        if (sender) {
            const senderTier = getMemberTrustProfile(from).tier;
            if (senderTier.name === 'Newcomer' && sender.joinedAt) {
                const ageHours = (Date.now() - new Date(sender.joinedAt).getTime()) / (1000 * 60 * 60);
                const t = getThresholds();
                let dailyLimit: number | null = null;
                let unlockHours = 0;

                if (ageHours < t.ghostVelocityTier1Hours) {
                    dailyLimit = t.ghostVelocityTier1Limit;
                    unlockHours = Math.ceil(t.ghostVelocityTier1Hours - ageHours);
                } else if (ageHours < t.ghostVelocityTier2Hours) {
                    dailyLimit = t.ghostVelocityTier2Limit;
                    unlockHours = Math.ceil(t.ghostVelocityTier2Hours - ageHours);
                }

                if (dailyLimit !== null) {
                    const recentSpend = db.prepare(`
                        SELECT COALESCE(SUM(amount), 0) as total 
                        FROM transactions 
                        WHERE from_pubkey = ? 
                          AND timestamp > datetime('now', '-24 hours')
                    `).get(from) as any;

                    if ((recentSpend?.total || 0) + amount > dailyLimit) {
                        console.log(`🛡️ Ghost velocity gate: ${sender.callsign} (${ageHours.toFixed(0)}h old) blocked — would exceed ${dailyLimit}B daily limit`);
                        throw new Error(`New accounts are limited to ${dailyLimit}B per day. Full access unlocks in ~${unlockHours} hours.`);
                    }
                }
            }
        }
    }

    // Calculate dynamic floor for the sender (escrow wallets are exempt)
    const senderFloor = from.startsWith('escrow_') ? -Infinity : calculateDynamicFloor(getMemberTrustStats(from));
    const success = ledger.transfer(from, to, amount, senderFloor);
    if (!success) return null;

    recordActivity(from);

    const txn: Transaction = {
        id: crypto.randomUUID(),
        from, to, amount,
        memo: memo || '',
        timestamp: new Date().toISOString(),
    };
    if (amount > 0) {
        db.prepare(`INSERT INTO transactions (id, from_pubkey, to_pubkey, amount, memo, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run(txn.id, txn.from, txn.to, txn.amount, txn.memo, txn.timestamp);
    }

    // Sync ledger account balances to DB
    const fromAcc = ledger.getAccount(from);
    const toAcc = ledger.getAccount(to);
    db.prepare(`UPDATE accounts SET balance=?, last_demurrage_epoch=?, last_updated_at=? WHERE public_key=?`).run(fromAcc.balance, fromAcc.lastDemurrageEpoch, new Date().toISOString(), from);
    db.prepare(`UPDATE accounts SET balance=?, last_demurrage_epoch=?, last_updated_at=? WHERE public_key=?`).run(toAcc.balance, toAcc.lastDemurrageEpoch, new Date().toISOString(), to);

    // Persist commons balance (transfers trigger decay which accumulates demurrage)
    persistCommonsBalance();

    const fromMember = getMember(from);
    const toMember = getMember(to);
    broadcast({
        type: 'transaction',
        txn: { ...txn, fromCallsign: fromMember?.callsign || 'Unknown', toCallsign: toMember?.callsign || 'Unknown' },
    });
    return txn;
}

export function getTransactions(publicKey?: string, limit = 50, offset = 0): Transaction[] {
    let rows;
    if (publicKey) {
        rows = db.prepare(`SELECT * FROM transactions WHERE from_pubkey=? OR to_pubkey=? ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(publicKey, publicKey, limit, offset) as any[];
    } else {
        rows = db.prepare(`SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(limit, offset) as any[];
    }
    return rows.map(r => ({ id: r.id, from: r.from_pubkey, to: r.to_pubkey, amount: r.amount, memo: r.memo, timestamp: r.timestamp }));
}
// ===================== MARKETPLACE =====================

function rowToPost(row: any, photosByPost: Map<string, any[]>): MarketplacePost {
    const postPhotos = photosByPost.get(row.id) || [];
    return {
        id: row.id,
        type: row.type,
        category: row.category,
        title: row.title,
        description: row.description,
        credits: row.credits,
        priceType: row.price_type || 'fixed',
        authorPublicKey: row.author_pubkey,
        authorCallsign: row.author_callsign,
        createdAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
        active: Boolean(row.active),
        status: row.status,
        repeatable: Boolean(row.repeatable),
        acceptedBy: row.accepted_by,
        acceptedByCallsign: row.accepted_callsign,
        acceptedAt: row.accepted_at,
        pendingTransactionId: row.pending_transaction_id,
        completedAt: row.completed_at,
        lat: row.lat,
        lng: row.lng,
        photos: postPhotos.sort((a: any, b: any) => a.order_num - b.order_num).map((p: any) => `/api/marketplace/posts/${row.id}/photos/${p.order_num}`),
        originNode: row.origin_node,
        authorEnergyCycled: row.author_energy_cycled ?? 0,
        authorAvatarUrl: row.author_avatar ?? null
    };
}

export function createPost(
    type: 'offer' | 'need', category: string, title: string, description: string, credits: number,
    priceType: 'fixed' | 'hourly' | 'daily' | 'weekly' | 'monthly' | string, authorPublicKey: string, lat?: number, lng?: number, photos?: string[], repeatable?: boolean, id?: string
): MarketplacePost | null {
    assertMemberActive(authorPublicKey);
    if (!getMember(authorPublicKey)) {
        return null;
    }
    assertProfileComplete(authorPublicKey);

    const finalId = id || crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const searchKeywords = generateSearchKeywords(title, description, category);
    
    db.transaction(() => {
        db.prepare(`INSERT INTO posts (
            id, type, category, title, description, credits, price_type, author_pubkey, created_at, active, status, repeatable, lat, lng, updated_at, search_keywords
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?)`).run(finalId, type, category, title, description, credits, priceType, authorPublicKey, createdAt, repeatable ? 1 : 0, lat ?? null, lng ?? null, createdAt, searchKeywords);

        if (photos && photos.length > 0) {
            const insertPhoto = db.prepare(`INSERT INTO post_photos (post_id, photo_data, order_num) VALUES (?, ?, ?)`);
            photos.slice(0, 3).forEach((p, idx) => insertPhoto.run(finalId, p, idx));
        }
    })();

    const post = getPosts({ id: finalId }).find(p => p.id === finalId)!;
    broadcast({ type: 'new_post', post });
    return post;
}

export function getPosts(filter?: { id?: string; type?: string; category?: string; status?: string; offset?: number; limit?: number; updatedAfter?: string; query?: string; authorPubkey?: string }): MarketplacePost[] {
    let query = `
        SELECT p.*, m.callsign as author_callsign, m.avatar_url as author_avatar, a.callsign as accepted_callsign,
               COALESCE((SELECT SUM(amount) FROM transactions WHERE from_pubkey = m.public_key), 0) as author_energy_cycled
        FROM posts p
        LEFT JOIN members m ON p.author_pubkey = m.public_key
        LEFT JOIN members a ON p.accepted_by = a.public_key
        WHERE 1=1
    `;
    const params: any[] = [];

    if (!filter?.id && !filter?.updatedAfter) {
        // Regular client paginated fetch: only active/pending
        query += " AND p.active = 1 AND p.status IN ('active', 'pending')";
    } else if (filter?.updatedAfter) {
        // Sync daemon fetch: MUST include completed/cancelled/deleted states to sync deletions
    } else {
        query += " AND p.active = 1";
    }

    if (filter?.id) { query += " AND p.id = ?"; params.push(filter.id); }
    if (filter?.type && filter.type !== 'all') { query += " AND p.type = ?"; params.push(filter.type); }
    if (filter?.category && filter.category !== 'all') { query += " AND p.category = ?"; params.push(filter.category); }
    if (filter?.status) { query += " AND p.status = ?"; params.push(filter.status); }
    if (filter?.authorPubkey) { query += " AND p.author_pubkey = ?"; params.push(filter.authorPubkey); }

    // FTS5 full-text search with synonym-expanded keywords
    if (filter?.query && filter.query.trim()) {
        const searchTerms = filter.query.trim().replace(/["']/g, '').split(/\s+/).filter(w => w.length > 0);
        if (searchTerms.length > 0) {
            const ftsQuery = searchTerms.map(t => `"${t}"*`).join(' OR ');
            query += ` AND p.rowid IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?)`;
            params.push(ftsQuery);
        }
    }

    if (filter?.updatedAfter) {
        query += " AND p.updated_at >= ?";
        params.push(filter.updatedAfter);
    }

    query += " ORDER BY p.updated_at DESC, p.created_at DESC";
    
    if (filter?.limit) {
        query += " LIMIT ? OFFSET ?";
        params.push(filter.limit, filter.offset || 0);
    }

    const rows = db.prepare(query).all(...params) as any[];
    const postIds = rows.map(r => r.id);
    
    // Allow syncing photos so the global feed thumbnails can actually render. 
    // We fetch only the first photo (order_num = 0) if it's a global feed to save payload size.
    const photosQuery = filter?.id 
        ? `SELECT * FROM post_photos WHERE post_id IN (${postIds.map(() => '?').join(',')})`
        : `SELECT * FROM post_photos WHERE post_id IN (${postIds.map(() => '?').join(',')}) AND order_num = 0`;

    const photos = (postIds.length > 0) ? db.prepare(photosQuery).all(...postIds) : [];

    // ⚡ Bolt: Group photos by post_id to avoid O(N²) nested filtering, turning it to O(N) lookup.
    const photosByPost = new Map<string, any[]>();
    for (const p of photos as any[]) {
        if (!photosByPost.has(p.post_id)) {
            photosByPost.set(p.post_id, []);
        }
        photosByPost.get(p.post_id)!.push(p);
    }

    return rows.map(r => rowToPost(r, photosByPost));
}

export function removePost(id: string, authorPublicKey: string): boolean {
    const result = db.prepare(`UPDATE posts SET active = 0, status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND author_pubkey = ?`).run(id, authorPublicKey);
    if (result.changes === 0) return false;
    broadcast({ type: 'post_removed', id });
    return true;
}

export function updatePost(id: string, authorPublicKey: string, updates: Partial<MarketplacePost>): MarketplacePost | null {
    const setClauses: string[] = [];
    const params: any[] = [];
    
    if (updates.title) { setClauses.push("title = ?"); params.push(updates.title); }
    if (updates.description !== undefined) { setClauses.push("description = ?"); params.push(updates.description); }
    if (updates.category) { setClauses.push("category = ?"); params.push(updates.category); }
    if (updates.credits !== undefined) { setClauses.push("credits = ?"); params.push(updates.credits); }
    if (updates.priceType) { setClauses.push("price_type = ?"); params.push(updates.priceType); }
    if (updates.type) { setClauses.push("type = ?"); params.push(updates.type); }
    if (updates.lat !== undefined) { setClauses.push("lat = ?"); params.push(updates.lat); }
    if (updates.lng !== undefined) { setClauses.push("lng = ?"); params.push(updates.lng); }
    if (updates.repeatable !== undefined) { setClauses.push("repeatable = ?"); params.push(updates.repeatable ? 1 : 0); }
    
    if (setClauses.length === 0 && updates.photos === undefined) return getPosts({ id })[0];

    // Regenerate search keywords if title, description, or category changed
    if (updates.title || updates.description !== undefined || updates.category) {
        const existing = db.prepare(`SELECT title, description, category FROM posts WHERE id = ?`).get(id) as any;
        if (existing) {
            const newTitle = updates.title || existing.title;
            const newDesc = updates.description !== undefined ? updates.description : existing.description;
            const newCat = updates.category || existing.category;
            const keywords = generateSearchKeywords(newTitle, newDesc, newCat);
            setClauses.push("search_keywords = ?");
            params.push(keywords);
        }
    }

    setClauses.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");

    const query = `UPDATE posts SET ${setClauses.join(', ')} WHERE id = ? AND author_pubkey = ? AND active = 1`;
    params.push(id, authorPublicKey);

    db.transaction(() => {
        if (setClauses.length > 1) { // >1 because updated_at is always added
            db.prepare(query).run(...params);
        }
        if (updates.photos !== undefined) {
            // Tombstone existing photos before deletion so mirrors propagate the
            // removal. Any (post_id, order_num) that gets re-inserted below will
            // win over the tombstone at import time (newer updated_at).
            const existingPhotos = db.prepare(`SELECT order_num FROM post_photos WHERE post_id=?`).all(id) as { order_num: number }[];
            for (const ph of existingPhotos) {
                writeTombstone('post_photos', `${id}|${ph.order_num}`);
            }
            db.prepare(`DELETE FROM post_photos WHERE post_id=?`).run(id);
            const insertPhoto = db.prepare(`INSERT INTO post_photos (post_id, photo_data, order_num) VALUES (?, ?, ?)`);
            updates.photos.slice(0, 3).forEach((p, idx) => insertPhoto.run(id, p, idx));
        }
    })();

    const post = getPosts({ id })[0];
    if (!post) return null;
    broadcast({ type: 'post_updated', post });
    return post;
}

// ===================== MARKETPLACE TRANSACTIONS =====================

export function requestPost(postId: string, requesterPublicKey: string, hours?: number): MarketplaceTransaction {
    assertMemberActive(requesterPublicKey);
    assertProfileComplete(requesterPublicKey);
    const post = db.prepare(`SELECT * FROM posts WHERE id=?`).get(postId) as any;
    if (!post) throw new Error('Post not found');
    if (post.status !== 'active') throw new Error('Post is not active');
    if (post.author_pubkey === requesterPublicKey) throw new Error('You cannot request your own post');

    // For Needs, the Author pays. For Offers, the Requester pays.
    const isOffer = post.type === 'offer';
    const payerPubkey = isOffer ? requesterPublicKey : post.author_pubkey;
    const payeePubkey = isOffer ? post.author_pubkey : requesterPublicKey;

    // Check if the PAYER has enough balance at the time of request to prevent spam
    const cost = post.price_type !== 'fixed' ? (post.credits * (hours || 1)) : post.credits;
    const { balance, floor } = getBalance(payerPubkey);
    if (balance - cost < floor) throw new Error('Insufficient balance to request this post.');

    const transactionId = crypto.randomUUID();
    
    db.transaction(() => {
        db.prepare(`
            INSERT INTO marketplace_transactions (id, post_id, buyer_pubkey, seller_pubkey, credits, hours, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'requested', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        `).run(transactionId, postId, payerPubkey, payeePubkey, cost, hours || null);
    })();

    // Note: getMarketplaceTransactions fetches by user; we'll fetch for the requester
    const tx = getMarketplaceTransactions(requesterPublicKey).find(t => t.id === transactionId)!;
    broadcast({ type: 'transaction_requested', transaction: tx });

    // Push notification: notify the post author that someone wants their item
    const requesterMember = getMember(requesterPublicKey) as any;
    const requesterName = requesterMember?.callsign || requesterPublicKey.slice(0, 8);
    dispatchPushNotification(
        [post.author_pubkey],
        requesterPublicKey,
        '📬 New Request',
        `${requesterName} wants "${post.title}"`,
        { screen: 'post', postId },
        'marketplace'
    );

    return tx;
}

export function approvePostRequest(transactionId: string, authorPublicKey: string): MarketplaceTransaction | null {
    const row = db.prepare("SELECT * FROM marketplace_transactions WHERE id=? AND status='requested'").get(transactionId) as any;
    if (!row) throw new Error('Request not found');

    const post = db.prepare(`SELECT * FROM posts WHERE id=?`).get(row.post_id) as any;
    if (!post || post.author_pubkey !== authorPublicKey) throw new Error('Only the author can approve a request');

    const isOffer = post.type === 'offer';
    const expectedAuthorRole = isOffer ? row.seller_pubkey : row.buyer_pubkey;
    if (expectedAuthorRole !== authorPublicKey) throw new Error('Unauthorized');

    // Verify payer STILL has enough money at the exact moment of approval
    const { balance, floor } = getBalance(row.buyer_pubkey);
    if (balance - row.credits < floor) throw new Error('Payer has insufficient funds in their wallet');

    db.transaction(() => {
        // Ensure synthetic escrow account exists natively
        db.prepare(`INSERT OR IGNORE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, 0, 0)`).run(`escrow_${transactionId}`);

        // 1. Lock the funds in Escrow — abort if transfer fails
        // Wallet keyed by transaction ID to isolate concurrent recurring-post transactions
        const escrowResult = transfer(row.buyer_pubkey, `escrow_${transactionId}`, row.credits, `Escrow hold for post ${row.post_id}`, 'escrow');
        if (!escrowResult) throw new Error('Failed to lock funds in escrow — insufficient balance or ledger error');
        
        // 2. Mark this transaction as pending
        db.prepare(`UPDATE marketplace_transactions SET status='pending' WHERE id=?`).run(transactionId);
        
        // 3. Mark the Post as pending
        if (!post.repeatable) {
            db.prepare(`UPDATE posts SET status='pending', accepted_by=?, accepted_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), pending_transaction_id=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`)
              .run(row.seller_pubkey === authorPublicKey ? row.buyer_pubkey : row.seller_pubkey, transactionId, row.post_id);
              
            // 4. Reject all other competing requests for this Non-Repeatable post
            db.prepare(`UPDATE marketplace_transactions SET status='rejected', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE post_id=? AND id!=? AND status='requested'`)
              .run(row.post_id, transactionId);
        }
    })();

    const tx = getMarketplaceTransactions(row.buyer_pubkey).find(t => t.id === transactionId)!;
    broadcast({ type: 'transaction_approved', transaction: tx });
    broadcast({ type: 'post_updated', post: getPosts({ id: row.post_id })[0] });

    // Atomicity: Ensure conversation exists BEFORE injecting the system message.
    // Both participants are guaranteed registered members at this point.
    ensureTransactionConversation(row.post_id, row.buyer_pubkey, row.seller_pubkey);

    injectSystemMessage(row.post_id, SystemMessageType.ESCROW_FUNDED, {
        amount: row.credits,
        postId: row.post_id,
        actorPubkey: authorPublicKey
    }, row.buyer_pubkey, row.seller_pubkey);

    // Push notification: notify the requester that their request was approved
    const requesterPubkey = isOffer ? row.buyer_pubkey : row.seller_pubkey;
    dispatchPushNotification(
        [requesterPubkey],
        authorPublicKey,
        '✅ Request Approved',
        `Your request for "${post.title}" was approved!`,
        { screen: 'post', postId: row.post_id },
        'marketplace'
    );

    return tx;
}

export function rejectPostRequest(transactionId: string, authorPublicKey: string): MarketplaceTransaction | null {
    const row = db.prepare("SELECT * FROM marketplace_transactions WHERE id=? AND status='requested'").get(transactionId) as any;
    if (!row) return null;

    const post = db.prepare(`SELECT * FROM posts WHERE id=?`).get(row.post_id) as any;
    if (!post) return null;

    const isOffer = post.type === 'offer';
    const expectedAuthorRole = isOffer ? row.seller_pubkey : row.buyer_pubkey;
    if (expectedAuthorRole !== authorPublicKey) return null;

    db.prepare(`UPDATE marketplace_transactions SET status='rejected', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(transactionId);
    
    const tx = getMarketplaceTransactions(row.buyer_pubkey).find(t => t.id === transactionId)!;
    broadcast({ type: 'transaction_rejected', transaction: tx });

    // Push notification: notify the requester that their request was declined
    const requesterPubkey = isOffer ? row.buyer_pubkey : row.seller_pubkey;
    dispatchPushNotification(
        [requesterPubkey],
        authorPublicKey,
        '❌ Request Declined',
        `Your request for "${post.title}" was declined`,
        { screen: 'post', postId: row.post_id },
        'marketplace'
    );

    return tx;
}

export function cancelPostRequest(transactionId: string, requesterPublicKey: string): MarketplaceTransaction | null {
    const row = db.prepare("SELECT * FROM marketplace_transactions WHERE id=? AND status='requested'").get(transactionId) as any;
    if (!row) return null;

    const post = db.prepare(`SELECT * FROM posts WHERE id=?`).get(row.post_id) as any;
    if (!post) return null;

    const isOffer = post.type === 'offer';
    const expectedRequesterRole = isOffer ? row.buyer_pubkey : row.seller_pubkey;
    if (expectedRequesterRole !== requesterPublicKey) return null;

    db.prepare(`UPDATE marketplace_transactions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(transactionId);
    
    const tx = getMarketplaceTransactions(row.buyer_pubkey).find(t => t.id === transactionId)!;
    broadcast({ type: 'transaction_cancelled', transaction: tx });
    return tx;
}

export function acceptPost(postId: string, buyerPublicKey: string, hours?: number): MarketplaceTransaction {
    assertMemberActive(buyerPublicKey);
    const post = getPosts({ id: postId, status: 'active' })[0];
    if (!post) throw new Error('Post not found or not active');
    if (post.authorPublicKey === buyerPublicKey) throw new Error('Cannot accept your own post');

    if (post.type !== 'offer') {
        throw new Error('Only Offers can be 1-step accepted');
    }

    if (post.priceType !== 'fixed' && (typeof hours !== 'number' || hours <= 0)) {
        throw new Error(`Must provide a valid quantity for a ${post.priceType} post`);
    }

    const buyer = getMember(buyerPublicKey);
    const finalCredits = post.priceType !== 'fixed' ? post.credits * hours! : post.credits;

    // Check balance
    const { balance, floor } = getBalance(buyerPublicKey);
    if (balance - finalCredits < floor) throw new Error('Insufficient balance to accept this offer');

    const tx: MarketplaceTransaction = {
        id: crypto.randomUUID(), postId: post.id, postTitle: post.title, buyerPublicKey,
        buyerCallsign: buyer?.callsign || 'Anonymous', sellerPublicKey: post.authorPublicKey,
        sellerCallsign: post.authorCallsign, credits: finalCredits, hours: post.priceType !== 'fixed' ? hours : undefined,
        status: 'pending', createdAt: new Date().toISOString(),
    };

    db.transaction(() => {
        // Ensure synthetic escrow account exists natively
        db.prepare(`INSERT OR IGNORE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, 0, 0)`).run(`escrow_${tx.id}`);

        // 1. Lock funds — abort if transfer fails
        // Wallet keyed by transaction ID to isolate concurrent recurring-post transactions
        const escrowResult = transfer(buyerPublicKey, `escrow_${tx.id}`, finalCredits, `Escrow hold for offer ${post.id}`, 'escrow');
        if (!escrowResult) throw new Error('Failed to lock funds in escrow — insufficient balance or ledger error');

        // 2. Insert pending tx
        db.prepare(`INSERT INTO marketplace_transactions (id, post_id, buyer_pubkey, seller_pubkey, credits, hours, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`).run(tx.id, tx.postId, tx.buyerPublicKey, tx.sellerPublicKey, tx.credits, tx.hours ?? null, tx.createdAt);
        
        // 3. Update post
        if (!post.repeatable) {
            db.prepare(`UPDATE posts SET status='pending', accepted_by=?, accepted_at=?, pending_transaction_id=?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(buyerPublicKey, tx.createdAt, tx.id, post.id);
        }
    })();
    broadcast({ type: 'post_accepted', postId: post.id, transaction: tx });
    
    // Atomicity: Ensure a conversation thread exists BEFORE injecting the system message.
    // Both buyer and seller are guaranteed registered members at this point.
    ensureTransactionConversation(post.id, buyerPublicKey, post.authorPublicKey);

    injectSystemMessage(post.id, SystemMessageType.ESCROW_FUNDED, {
        amount: finalCredits,
        postId: post.id,
        actorPubkey: buyerPublicKey
    }, buyerPublicKey, post.authorPublicKey);
    return tx;
}

export function completePostTransaction(transactionId: string, confirmerPublicKey: string, finalHours?: number): MarketplaceTransaction & { alreadyCompleted?: boolean } | null {
    const row = db.prepare("SELECT * FROM marketplace_transactions WHERE id=? AND status='pending'").get(transactionId) as any;
    
    // Idempotency: If already completed by the same buyer, return success instead of an error
    if (!row) {
        const completedRow = db.prepare("SELECT * FROM marketplace_transactions WHERE id=? AND status='completed'").get(transactionId) as any;
        if (completedRow && completedRow.buyer_pubkey === confirmerPublicKey) {
            const existing = getMarketplaceTransactions(confirmerPublicKey).find(t => t.id === transactionId);
            if (existing) return { ...existing, alreadyCompleted: true };
        }
        return null;
    }
    
    // Security Fix: IN Escrow, the Payer (buyer) is the ONLY one authorized to release funds to the Payee (seller).
    if (row.buyer_pubkey !== confirmerPublicKey) return null;

    const post = db.prepare("SELECT * FROM posts WHERE id=?").get(row.post_id) as any;
    const completedAt = new Date().toISOString();

    let txnRecord: Transaction | undefined;
    
    db.transaction(() => {
        if (finalHours !== undefined && post && post.price_type !== 'fixed' && finalHours > 0) {
            row.hours = finalHours;
            row.credits = post.credits * finalHours;
            db.prepare(`UPDATE marketplace_transactions SET hours=?, credits=? WHERE id=?`).run(row.hours, row.credits, transactionId);
        }

        if (row.credits > 0 && post) {
            // Funds are stored in escrow_${tx_id} since the transaction went 'pending'
            // Transfer whatever the escrow wallet actually holds (may be slightly less than row.credits due to demurrage decay)
            const escrowKey = `escrow_${transactionId}`;
            const escrowAcc = ledger.getAccount(escrowKey);
            const releaseAmount = escrowAcc ? Math.min(escrowAcc.balance, row.credits) : row.credits;
            const releaseResult = transfer(escrowKey, row.seller_pubkey, releaseAmount, `Completed: ${post.title}`, 'escrow');
            if (!releaseResult) {
                throw new Error(`Failed to release ${releaseAmount} beans from ${escrowKey} to ${row.seller_pubkey}`);
            }
        }

        db.prepare(`UPDATE marketplace_transactions SET status='completed', completed_at=? WHERE id=?`).run(completedAt, transactionId);
        
        if (post && !post.repeatable) {
            db.prepare(`UPDATE posts SET status='completed', active=0, completed_at=?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(completedAt, post.id);
        } else if (post && post.repeatable) {
            db.prepare(`UPDATE posts SET status='active', accepted_by=NULL, accepted_at=NULL, pending_transaction_id=NULL, completed_at=?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(completedAt, post.id);
        }
    })();

    const tx = getMarketplaceTransactions(row.buyer_pubkey).find(t => t.id === transactionId)!;
    broadcast({ type: 'transaction_completed', transaction: tx });
    
    injectSystemMessage(row.post_id, SystemMessageType.ESCROW_RELEASED, {
        amount: row.credits,
        postId: row.post_id,
        actorPubkey: confirmerPublicKey
    }, row.buyer_pubkey, row.seller_pubkey);
    return tx;
}

export function cancelPostTransaction(transactionId: string, cancellerPublicKey: string): MarketplaceTransaction | null {
    const row = db.prepare("SELECT * FROM marketplace_transactions WHERE id=? AND status='pending'").get(transactionId) as any;
    if (!row || (row.buyer_pubkey !== cancellerPublicKey && row.seller_pubkey !== cancellerPublicKey)) return null;

    db.transaction(() => {
        // Reverse Escrow Funds -> Refund Buyer (wallet keyed by transaction ID)
        // Transfer whatever the escrow wallet actually holds (may be slightly less due to demurrage)
        const escrowKey = `escrow_${transactionId}`;
        const escrowAcc = ledger.getAccount(escrowKey);
        const refundAmount = escrowAcc ? Math.min(escrowAcc.balance, row.credits) : row.credits;
        transfer(escrowKey, row.buyer_pubkey, refundAmount, `Escrow refund for cancelled post ${row.post_id}`, 'escrow');

        db.prepare(`UPDATE marketplace_transactions SET status='cancelled', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(transactionId);
        const post = db.prepare(`SELECT * FROM posts WHERE id=?`).get(row.post_id) as any;
        if (post && !post.repeatable && post.status === 'pending') {
            db.prepare(`UPDATE posts SET status='active', accepted_by=NULL, accepted_at=NULL, pending_transaction_id=NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?`).run(post.id);
        }
    })();
    const tx = getMarketplaceTransactions(row.buyer_pubkey).find(t => t.id === transactionId)!;
    broadcast({ type: 'transaction_cancelled', transaction: tx });
    
    injectSystemMessage(row.post_id, SystemMessageType.ESCROW_CANCELLED, {
        amount: row.credits,
        postId: row.post_id,
        actorPubkey: cancellerPublicKey
    }, row.buyer_pubkey, row.seller_pubkey);
    return tx;
}

export function pausePost(postId: string, authorPublicKey: string): boolean {
    const result = db.prepare(`UPDATE posts SET status='paused' WHERE id=? AND author_pubkey=? AND status='active'`).run(postId, authorPublicKey);
    if (result.changes === 0) return false;
    broadcast({ type: 'post_updated', post: getPosts({ id: postId })[0] });
    return true;
}

export function resumePost(postId: string, authorPublicKey: string): boolean {
    const result = db.prepare(`UPDATE posts SET status='active' WHERE id=? AND author_pubkey=? AND status='paused'`).run(postId, authorPublicKey);
    if (result.changes === 0) return false;
    broadcast({ type: 'post_updated', post: getPosts({ id: postId })[0] });
    return true;
}

export function getMarketplaceTransactions(publicKey: string, filter?: { status?: string }, limit = 50, offset = 0): MarketplaceTransaction[] {
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
    if (filter?.status) { query += " AND mt.status = ?"; params.push(filter.status); }
    query += " ORDER BY mt.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as any[];
    const postIds = Array.from(new Set(rows.map(r => r.post_id)));
    const photos = postIds.length > 0 ? db.prepare(`SELECT * FROM post_photos WHERE post_id IN (${postIds.map(() => '?').join(',')})`).all(...postIds) as any[] : [];

    // ⚡ Bolt: Group photos by post_id to avoid O(N²) nested searching
    const photosByPost = new Map<string, any[]>();
    for (const p of photos as any[]) {
        if (!photosByPost.has(p.post_id)) {
            photosByPost.set(p.post_id, []);
        }
        photosByPost.get(p.post_id)!.push(p);
    }

    return rows.map(r => {
        const postPhotos = photosByPost.get(r.post_id) || [];
        const coverImageRow = postPhotos.find(p => p.order_num === 0) || postPhotos[0];
        const coverImage = coverImageRow ? coverImageRow.photo_data : null;
        return {
            id: r.id, postId: r.post_id, postTitle: r.postTitle, buyerPublicKey: r.buyer_pubkey, buyerCallsign: r.buyerCallsign, sellerPublicKey: r.seller_pubkey, sellerCallsign: r.sellerCallsign, credits: r.credits, status: r.status, createdAt: r.created_at, completedAt: r.completed_at, ratedByBuyer: !!r.ratedByBuyer, ratedBySeller: !!r.ratedBySeller, coverImage
        };
    });
}
// ===================== COMMUNITY INFO =====================

export function getCommunityInfo(): { memberCount: number; postCount: number; transactionCount: number; commonsBalance: number; currency: { type: string, value: string } } {
    const memberCount = (db.prepare("SELECT COUNT(*) as c FROM members WHERE status != 'pruned'").get() as any).c;
    const postCount = (db.prepare("SELECT COUNT(*) as c FROM posts WHERE active=1").get() as any).c;
    const txCount = (db.prepare("SELECT COUNT(*) as c FROM transactions").get() as any).c;
    const config = getLocalConfig();
    return { memberCount, postCount, transactionCount: txCount, commonsBalance: Math.round(COMMONS_BALANCE * 100) / 100, currency: { type: config.currencyType || 'image', value: config.currencyValue || 'bean' } };
}

// ===================== MESSAGING =====================

export function createConversation(type: 'dm' | 'group', participants: string[], createdBy: string, name?: string, postId?: string): Conversation | null {
    assertMemberActive(createdBy);
    for (const p of participants) if (!getMember(p)) registerVisitor(p);

    if (type === 'dm' && participants.length === 2) {
        // Find existing DM with exact postId match (or IS NULL for general DMs)
        const existingQuery = postId 
            ? `
                SELECT c.* FROM conversations c
                JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.public_key = ?
                JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.public_key = ?
                WHERE c.type = 'dm' AND c.post_id = ?
            `
            : `
                SELECT c.* FROM conversations c
                JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.public_key = ?
                JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.public_key = ?
                WHERE c.type = 'dm' AND c.post_id IS NULL
            `;
            
        const existingParams = postId 
            ? [participants[0], participants[1], postId]
            : [participants[0], participants[1]];

        const existing = db.prepare(existingQuery).get(...existingParams) as any;

        if (existing) {
            const parts = db.prepare("SELECT public_key FROM conversation_participants WHERE conversation_id=?").all(existing.id) as any[];
            return { id: existing.id, type: existing.type, postId: existing.post_id, name: existing.name, createdBy: existing.created_by, createdAt: existing.created_at, participants: parts.map(p => p.public_key) };
        }
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.transaction(() => {
        db.prepare(`INSERT INTO conversations (id, type, post_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, type, postId || null, name || null, createdBy, createdAt);
        const insertPart = db.prepare(`INSERT INTO conversation_participants (conversation_id, public_key) VALUES (?, ?)`);
        for (const p of participants) insertPart.run(id, p);
    })();

    const conv: Conversation = { id, type, postId, name: name || null, createdBy, createdAt, participants };
    broadcast({ type: 'conversation_created', conversation: conv });
    return conv;
}

export function sendMessage(conversationId: string, authorPubkey: string, ciphertext: string, nonce: string): Message | null {
    assertMemberActive(authorPubkey);
    const participants = db.prepare("SELECT public_key FROM conversation_participants WHERE conversation_id=?").all(conversationId) as any[];
    if (!participants.length || !participants.find(p => p.public_key === authorPubkey)) return null;

    const msg: Message = { id: crypto.randomUUID(), conversationId, authorPubkey, ciphertext, nonce, timestamp: new Date().toISOString() };
    db.prepare(`INSERT INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run(msg.id, msg.conversationId, msg.authorPubkey, msg.ciphertext, msg.nonce, msg.timestamp);

    broadcast({ type: 'new_message', conversationId, message: msg, participants: participants.map(p => p.public_key) });

    // Push notification for DMs (encrypted — body cannot include message content)
    const senderMember = getMember(authorPubkey) as any;
    const senderName = senderMember?.callsign || authorPubkey.slice(0, 8);
    dispatchPushNotification(
        participants.map(p => p.public_key),
        authorPubkey,
        '💬 New Message',
        `${senderName} sent you a message`,
        { screen: 'chat', conversationId },
        'chat'
    );

    return msg;
}

export function toggleMessageReaction(messageId: string, authorPubkey: string, emoji: string): any {
    const row = db.prepare("SELECT * FROM messages WHERE id=?").get(messageId) as any;
    if (!row) return null;

    let metadata: any = {};
    if (row.metadata) {
        try {
            metadata = JSON.parse(row.metadata);
        } catch {
            metadata = {};
        }
    }

    if (!metadata.reactions) {
        metadata.reactions = [];
    }

    const existingIndex = metadata.reactions.findIndex((r: any) => r.author === authorPubkey);
    if (existingIndex > -1) {
        const existingReaction = metadata.reactions[existingIndex];
        if (existingReaction.emoji === emoji) {
            // Remove the reaction if same emoji
            metadata.reactions.splice(existingIndex, 1);
        } else {
            // Update the reaction to new emoji
            metadata.reactions[existingIndex].emoji = emoji;
        }
    } else {
        // Add new reaction
        metadata.reactions.push({ emoji, author: authorPubkey });
    }

    const metadataStr = JSON.stringify(metadata);
    db.prepare("UPDATE messages SET metadata=? WHERE id=?").run(metadataStr, messageId);

    // Broadcast the update to all active WS clients
    const participants = db.prepare("SELECT public_key FROM conversation_participants WHERE conversation_id=?").all(row.conversation_id) as any[];
    broadcast({
        type: 'message_reaction',
        conversationId: row.conversation_id,
        messageId,
        metadata: metadataStr,
        participants: participants.map(p => p.public_key)
    });

    return { success: true, metadata: metadataStr };
}

/**
 * Ensures a conversation thread exists between buyer and seller for a given post.
 * Called atomically with escrow creation so injectSystemMessage() always has a target.
 * Returns the conversation ID (existing or newly created).
 */
export function ensureTransactionConversation(postId: string, buyerPubkey: string, sellerPubkey: string): string {
    // Check if a conversation already exists for this post between these two parties
    const existing = db.prepare(`
        SELECT c.id FROM conversations c
        JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.public_key = ?
        JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.public_key = ?
        WHERE c.post_id = ?
    `).get(buyerPubkey, sellerPubkey, postId) as any;
    
    if (existing) {
        console.log(`[Comms] Conversation already exists for post ${postId}: ${existing.id}`);
        return existing.id;
    }
    
    // Create atomically — createConversation handles participant registration and broadcast
    const conv = createConversation('dm', [buyerPubkey, sellerPubkey], buyerPubkey, undefined, postId);
    if (!conv) throw new Error('Failed to create transaction conversation');
    console.log(`[Comms] Created new conversation ${conv.id} for post ${postId} between ${buyerPubkey.slice(0,8)} and ${sellerPubkey.slice(0,8)}`);
    return conv.id;
}

export function injectSystemMessage(postId: string, type: SystemMessageType, meta: SystemMessageMetadata, buyerPubkey?: string, sellerPubkey?: string) {
    let convRows: any[];
    
    // For recurring posts, scope the message to only the conversation between the specific buyer and seller
    if (buyerPubkey && sellerPubkey) {
        convRows = db.prepare(`
            SELECT c.id FROM conversations c
            JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.public_key = ?
            JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.public_key = ?
            WHERE c.post_id = ?
        `).all(buyerPubkey, sellerPubkey, postId) as any[];
    } else {
        convRows = db.prepare("SELECT id FROM conversations WHERE post_id = ?").all(postId) as any[];
    }
    
    if (convRows.length === 0) {
        console.warn(`[Comms] WARNING: No conversations found for post ${postId}. System event ${type} was NOT delivered to any inbox.`);
    }

    const contentMap: Record<SystemMessageType, string> = {
        [SystemMessageType.ESCROW_CREATED]: `Escrow initialized.`,
        [SystemMessageType.ESCROW_FUNDED]: `Ʀ${meta.amount} has been placed in escrow.`,
        [SystemMessageType.ESCROW_RELEASED]: `Payment of Ʀ${meta.amount} released to the provider.`,
        [SystemMessageType.ESCROW_CANCELLED]: `Escrow cancelled and funds refunded.`,
        [SystemMessageType.DISPUTE_OPENED]: `A dispute has been opened.`,
        [SystemMessageType.REVIEW_LEFT]: `A review has been left.`
    };
    
    for (const row of convRows) {
        const conversationId = row.id;
        const participants = db.prepare("SELECT public_key FROM conversation_participants WHERE conversation_id=?").all(conversationId) as any[];
        
        const metadataString = JSON.stringify(meta);
        const msg: Message = { 
            id: crypto.randomUUID(), 
            conversationId, 
            authorPubkey: 'SYSTEM', 
            ciphertext: contentMap[type] || 'System Event occurring.', 
            nonce: '00000', 
            type: 'system',
            systemType: type,
            metadata: metadataString,
            timestamp: new Date().toISOString() 
        };
        db.prepare(`INSERT INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, type, system_type, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(msg.id, msg.conversationId, msg.authorPubkey, msg.ciphertext, msg.nonce, msg.type, msg.systemType, msg.metadata, msg.timestamp);

        broadcast({ type: 'new_message', conversationId, message: msg, participants: participants.map(p => p.public_key) });
        
        // Dispatch push notification to all participants (except the actor)
        sendPushNotification(postId, type, meta, participants.map(p => p.public_key));
    }
}

export function getConversationsByMember(pubkey: string): Conversation[] {
    const rows = db.prepare(`
        SELECT c.*, p.title as post_title, p.status as post_status,
        m.type as last_msg_type, m.system_type as last_sys_type, m.timestamp as last_msg_time
        FROM conversations c
        JOIN conversation_participants cp ON c.id = cp.conversation_id
        LEFT JOIN posts p ON c.post_id = p.id
        LEFT JOIN messages m ON m.id = (
            SELECT id FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1
        )
        WHERE cp.public_key = ?
        ORDER BY COALESCE(last_msg_time, c.created_at) DESC
    `).all(pubkey) as any[];

    // ⚡ Bolt: Batch fetch participants to avoid N+1 queries
    const conversationIds = rows.map(r => r.id);
    const participantsByConv = new Map<string, string[]>();
    const allPeerPubkeys = new Set<string>();

    if (conversationIds.length > 0) {
        const placeholders = conversationIds.map(() => '?').join(',');
        const partsQuery = `SELECT conversation_id, public_key FROM conversation_participants WHERE conversation_id IN (${placeholders})`;
        const allParts = db.prepare(partsQuery).all(...conversationIds) as any[];

        for (const part of allParts) {
            if (!participantsByConv.has(part.conversation_id)) {
                participantsByConv.set(part.conversation_id, []);
            }
            participantsByConv.get(part.conversation_id)!.push(part.public_key);
            if (part.public_key !== pubkey) {
                allPeerPubkeys.add(part.public_key);
            }
        }
    }

    // ⚡ Bolt: Batch fetch peer member data to avoid N+1 queries
    const membersByPubkey = new Map<string, any>();
    if (allPeerPubkeys.size > 0) {
        const pubkeysArray = Array.from(allPeerPubkeys);
        const placeholders = pubkeysArray.map(() => '?').join(',');
        const membersQuery = `SELECT public_key, callsign, avatar_url FROM members WHERE public_key IN (${placeholders})`;
        const allMembers = db.prepare(membersQuery).all(...pubkeysArray) as any[];

        for (const member of allMembers) {
            membersByPubkey.set(member.public_key, member);
        }
    }

    // ⚡ Bolt: Batch fetch post photos to avoid N+1 queries
    const postIds = Array.from(new Set(rows.map(r => r.post_id).filter(id => id != null)));
    const postPhotosById = new Map<string, string | null>();
    if (postIds.length > 0) {
        const placeholders = postIds.map(() => '?').join(',');
        const postsQuery = `SELECT id, photos FROM posts WHERE id IN (${placeholders})`;
        const allPosts = db.prepare(postsQuery).all(...postIds) as any[];

        for (const post of allPosts) {
            let postPhoto: string | null = null;
            if (post.photos) {
                try {
                    const arr = JSON.parse(post.photos);
                    if (Array.isArray(arr) && arr.length > 0) postPhoto = arr[0];
                } catch {}
            }
            postPhotosById.set(post.id, postPhoto);
        }
    }

    return rows.map(r => {
        const parts = participantsByConv.get(r.id) || [];
        
        // Look up peer member data (avatar + callsign) for the other participant
        const peerPubkey = parts.find(p => p !== pubkey);
        let peerCallsign: string | undefined;
        let peerAvatar: string | null = null;
        if (peerPubkey) {
            const peerMember = membersByPubkey.get(peerPubkey);
            if (peerMember) {
                peerCallsign = peerMember.callsign;
                peerAvatar = peerMember.avatar_url || null;
            }
        }

        // Extract first photo from post
        const postPhoto = r.post_id ? (postPhotosById.get(r.post_id) || null) : null;

        return { 
            id: r.id, 
            type: r.type, 
            postId: r.post_id, 
            postTitle: r.post_title,
            postStatus: r.post_status,
            postPhoto,
            lastMsgType: r.last_msg_type,
            lastSysType: r.last_sys_type,
            name: r.name, 
            createdBy: r.created_by, 
            createdAt: r.created_at, 
            participants: parts,
            peerCallsign,
            peerAvatar,
        };
    });
}

export function getConversationMessages(conversationId: string, limit = 50, offset = 0): Message[] {
    const rows = db.prepare(`SELECT * FROM messages WHERE conversation_id=? ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(conversationId, limit, offset) as any[];
    return rows.reverse().map(r => ({ id: r.id, conversationId: r.conversation_id, authorPubkey: r.author_pubkey, ciphertext: r.ciphertext, nonce: r.nonce, type: r.type, systemType: r.system_type, metadata: r.metadata, timestamp: r.timestamp }));
}

export function getConversation(id: string): Conversation | undefined {
    const c = db.prepare(`
        SELECT c.*, p.title as post_title, p.status as post_status 
        FROM conversations c 
        LEFT JOIN posts p ON c.post_id = p.id 
        WHERE c.id=?
    `).get(id) as any;
    if (!c) return undefined;
    const parts = db.prepare("SELECT public_key FROM conversation_participants WHERE conversation_id=?").all(id) as any[];
    return { 
        id: c.id, 
        type: c.type, 
        postId: c.post_id, 
        postTitle: c.post_title,
        postStatus: c.post_status,
        name: c.name, 
        createdBy: c.created_by, 
        createdAt: c.created_at, 
        participants: parts.map(p => p.public_key) 
    };
}

// ===================== UNREAD TRACKING =====================

export function markConversationRead(pubkey: string, conversationId: string): void {
    db.prepare(`UPDATE conversation_participants SET last_read_at=? WHERE conversation_id=? AND public_key=?`).run(new Date().toISOString(), conversationId, pubkey);
}

export function getUnreadCounts(pubkey: string): Record<string, number> {
    const rows = db.prepare(`
        SELECT cp.conversation_id, 
               (SELECT COUNT(*) FROM messages m 
                WHERE m.conversation_id = cp.conversation_id 
                  AND m.author_pubkey != ? 
                  AND (cp.last_read_at IS NULL OR m.timestamp > cp.last_read_at)
               ) as unread_count
        FROM conversation_participants cp
        WHERE cp.public_key = ?
    `).all(pubkey, pubkey) as any[];

    const counts: Record<string, number> = {};
    for (const r of rows) if (r.unread_count > 0) counts[r.conversation_id] = r.unread_count;
    return counts;
}

// ===================== STATE SYNC =====================

export interface PostPhoto {
    post_id: string;
    photo_data: string;
    order_num: number;
    /** Source-of-truth mutation watermark used by delta sync for last-writer-wins conflict resolution. */
    updated_at?: string | null;
}

export interface Project {
    id: string;
    creator_pubkey: string;
    title: string;
    description: string | null;
    photos: string | null;
    goal_amount: number;
    current_amount: number;
    deadline_at: string | null;
    status: string;
    created_at: string;
    /** Source-of-truth mutation watermark used by delta sync for last-writer-wins conflict resolution. */
    updated_at?: string | null;
}

export interface SyncAccount {
    publicKey: string;
    balance: number;
    lastUpdatedAt: string;
    lastDemurrageEpoch: number;
}

export interface SyncFriend {
    ownerPubkey: string;
    friendPubkey: string;
    addedAt: string;
    isGuardian: boolean;
}

export interface SyncConversationParticipant {
    conversationId: string;
    publicKey: string;
    lastReadAt: string | null;
}

export interface SyncConversation {
    id: string;
    type: string;
    postId: string | null;
    name: string | null;
    createdBy: string | null;
    createdAt: string;
}

export interface SyncAbuseReport {
    id: string;
    reporterPubkey: string;
    targetPubkey: string;
    targetPostId: string | null;
    reason: string;
    createdAt: string;
}

export interface SyncRecoveryRequest {
    id: string;
    oldPubkey: string;
    newPubkey: string;
    status: string;
    quorumRequired: number;
    createdAt: string;
    cooldownUntil: string | null;
    executedAt: string | null;
    expiresAt: string | null;
    /** Source-of-truth mutation watermark used by delta sync for last-writer-wins conflict resolution. */
    updatedAt?: string | null;
}

export interface SyncRecoveryApproval {
    requestId: string;
    guardianPubkey: string;
    decision: string;
    createdAt: string;
}

export interface SyncMarketplaceTransaction {
    id: string;
    postId: string;
    post_id?: string;
    buyerPubkey?: string;
    buyerPublicKey?: string;
    buyer_pubkey?: string;
    sellerPubkey?: string;
    sellerPublicKey?: string;
    seller_pubkey?: string;
    credits: number;
    hours: number | null;
    status: string;
    createdAt: string;
    created_at?: string;
    completedAt: string | null;
    completed_at?: string | null;
    /** Source-of-truth mutation watermark used by delta sync for last-writer-wins conflict resolution. */
    updatedAt?: string | null;
    ratedByBuyer?: boolean;
    ratedBySeller?: boolean;
}

/**
 * Unified payload envelope used by all sync paths:
 *  - Full reconcile (every 15 min via /beanpool/sync/payload/2.0.0)     — every array populated
 *  - Cursor-based delta pull (every 30s via /beanpool/sync/delta/2.0.0) — only changed rows since `cursor`
 *  - Push-on-write event       (per write via /beanpool/sync/event/2.0.0) — single-row delta envelope
 *
 * Every row carries its own `updated_at`/timestamp so the importer can do
 * last-writer-wins conflict resolution. `tombstones` propagates hard deletes
 * (see writeTombstone in db.ts). `cursor` is the exporter's wall-clock at the
 * moment of capture and becomes the recipient's next `since`.
 */
export interface SyncPayload {
    stateHash?: string;
    cursor?: string;
    members?: Member[];
    posts?: MarketplacePost[];
    photos?: PostPhoto[];
    projects?: Project[];
    ratings?: Rating[];
    accounts?: SyncAccount[];
    transactions?: Transaction[];
    marketplaceTransactions?: SyncMarketplaceTransaction[];
    friends?: SyncFriend[];
    conversations?: SyncConversation[];
    conversationParticipants?: SyncConversationParticipant[];
    messages?: Message[];
    abuseReports?: SyncAbuseReport[];
    recoveryRequests?: SyncRecoveryRequest[];
    recoveryApprovals?: SyncRecoveryApproval[];
    tombstones?: { tableName: string; rowKey: string; deletedAt: string }[];
    nodeId: string;
    signature?: string;
    publicKey?: string;
}

export function getStateHash(): string {
    const pKeys = db.prepare("SELECT public_key FROM members ORDER BY public_key").all() as any[];
    const pIds = db.prepare("SELECT id FROM posts WHERE active=1 ORDER BY id").all() as any[];
    const data = JSON.stringify({ m: pKeys.map(k => k.public_key), p: pIds.map(i => i.id) });
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/* -------------------------------------------------------------------------- */
/*                       Sync cursors (per-peer watermarks)                    */
/* -------------------------------------------------------------------------- */

/**
 * Look up the timestamp of the last successful delta sync with a given peer.
 * Returns null if we've never synced with this peer (caller falls back to
 * full payload exchange).
 */
export function getSyncCursor(peerId: string): string | null {
    const row = db.prepare(`SELECT last_synced_at FROM sync_cursors WHERE peer_id=?`).get(peerId) as { last_synced_at: string } | undefined;
    return row?.last_synced_at ?? null;
}

/**
 * Record that a delta exchange with a peer completed successfully. The cursor
 * value is the exporter's wall-clock at the moment of capture and becomes the
 * `since` parameter for the next pull.
 */
export function setSyncCursor(peerId: string, cursor: string): void {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO sync_cursors (peer_id, last_synced_at, last_sync_attempt_at)
        VALUES (?, ?, ?)
        ON CONFLICT(peer_id) DO UPDATE SET
            last_synced_at = excluded.last_synced_at,
            last_sync_attempt_at = excluded.last_sync_attempt_at
    `).run(peerId, cursor, now);
}

/**
 * Record that we attempted a sync with a peer (whether it succeeded or not).
 * Used so we don't keep retrying a flapping peer on every tick.
 */
export function recordSyncAttempt(peerId: string): void {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO sync_cursors (peer_id, last_synced_at, last_sync_attempt_at)
        VALUES (?, ?, ?)
        ON CONFLICT(peer_id) DO UPDATE SET
            last_sync_attempt_at = excluded.last_sync_attempt_at
    `).run(peerId, now, now);  // last_synced_at only used for INSERT path
}

/* -------------------------------------------------------------------------- */
/*                     Import origin tracking (loop prevention)                */
/* -------------------------------------------------------------------------- */

/**
 * Set during an active sync import so the push-on-write hook can avoid echoing
 * the same delta back to the origin peer. Module-level state is safe here:
 * Node's single-threaded event loop + better-sqlite3's synchronous transactions
 * mean no other code interleaves while an import is in flight.
 */
let currentImportOrigin: string | null = null;

export function getCurrentImportOrigin(): string | null {
    return currentImportOrigin;
}

export async function exportSyncState(nodeId: string): Promise<SyncPayload> {
    // Select all members
    const members = getAllMembers();
    
    // Select all posts, active or inactive
    const postRows = db.prepare("SELECT * FROM posts").all() as any[];
    const posts: MarketplacePost[] = postRows.map(row => ({
        id: row.id,
        type: row.type,
        category: row.category,
        title: row.title,
        description: row.description,
        credits: row.credits,
        priceType: row.price_type || 'fixed',
        authorPublicKey: row.author_pubkey,
        authorCallsign: '', // Not strictly needed for sync insert, but let's provide fallback
        createdAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
        active: Boolean(row.active),
        status: row.status,
        repeatable: Boolean(row.repeatable),
        acceptedBy: row.accepted_by,
        acceptedAt: row.accepted_at,
        pendingTransactionId: row.pending_transaction_id,
        completedAt: row.completed_at,
        lat: row.lat,
        lng: row.lng,
        originNode: row.origin_node,
    }));

    // Select all photos
    const photos = db.prepare("SELECT * FROM post_photos").all() as PostPhoto[];

    // Select all projects
    const projects = db.prepare("SELECT * FROM projects").all() as Project[];

    // Select all ratings
    const ratingRows = db.prepare("SELECT * FROM ratings").all() as any[];
    const ratings: Rating[] = ratingRows.map(r => ({
        id: r.id,
        targetPubkey: r.target_pubkey,
        raterPubkey: r.rater_pubkey,
        stars: r.stars,
        comment: r.comment || '',
        role: r.role,
        transactionId: r.transaction_id,
        createdAt: r.created_at,
    }));

    // Disaster Recovery table exports:
    const accountRows = db.prepare("SELECT * FROM accounts").all() as any[];
    const accounts: SyncAccount[] = accountRows.map(row => ({
        publicKey: row.public_key,
        balance: row.balance,
        lastUpdatedAt: row.last_updated_at || row.joined_at || new Date().toISOString(),
        lastDemurrageEpoch: row.last_demurrage_epoch,
    }));

    const transactionRows = db.prepare("SELECT * FROM transactions").all() as any[];
    const transactions: Transaction[] = transactionRows.map(row => ({
        id: row.id,
        from: row.from_pubkey,
        to: row.to_pubkey,
        amount: row.amount,
        memo: row.memo || '',
        timestamp: row.timestamp,
    }));

    const ratingTxKeys = new Set(ratingRows.map(r => `${r.transaction_id}|${r.rater_pubkey}`));

    const marketplaceTxRows = db.prepare("SELECT * FROM marketplace_transactions").all() as any[];
    const marketplaceTransactions: SyncMarketplaceTransaction[] = marketplaceTxRows.map(row => ({
        id: row.id,
        postId: row.post_id,
        buyerPubkey: row.buyer_pubkey,
        buyerPublicKey: row.buyer_pubkey,
        buyer_pubkey: row.buyer_pubkey,
        sellerPubkey: row.seller_pubkey,
        sellerPublicKey: row.seller_pubkey,
        seller_pubkey: row.seller_pubkey,
        credits: row.credits,
        hours: row.hours,
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        updatedAt: row.updated_at || row.completed_at || row.created_at,
        ratedByBuyer: ratingTxKeys.has(`${row.id}|${row.buyer_pubkey}`),
        ratedBySeller: ratingTxKeys.has(`${row.id}|${row.seller_pubkey}`),
    }));

    const friendRows = db.prepare("SELECT * FROM friends").all() as any[];
    const friends: SyncFriend[] = friendRows.map(row => ({
        ownerPubkey: row.owner_pubkey,
        friendPubkey: row.friend_pubkey,
        addedAt: row.added_at,
        isGuardian: Boolean(row.is_guardian),
    }));

    const conversationRows = db.prepare("SELECT * FROM conversations").all() as any[];
    const conversations: SyncConversation[] = conversationRows.map(row => ({
        id: row.id,
        type: row.type,
        postId: row.post_id,
        name: row.name,
        createdBy: row.created_by,
        createdAt: row.created_at,
    }));

    const participantRows = db.prepare("SELECT * FROM conversation_participants").all() as any[];
    const conversationParticipants: SyncConversationParticipant[] = participantRows.map(row => ({
        conversationId: row.conversation_id,
        publicKey: row.public_key,
        lastReadAt: row.last_read_at,
    }));

    const messageRows = db.prepare("SELECT * FROM messages").all() as any[];
    const messages: Message[] = messageRows.map(row => ({
        id: row.id,
        conversationId: row.conversation_id,
        authorPubkey: row.author_pubkey,
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        type: row.type as 'text' | 'system',
        systemType: row.system_type as SystemMessageType,
        metadata: row.metadata || undefined,
        timestamp: row.timestamp,
    }));

    const abuseRows = db.prepare("SELECT * FROM abuse_reports").all() as any[];
    const abuseReports: SyncAbuseReport[] = abuseRows.map(row => ({
        id: row.id,
        reporterPubkey: row.reporter_pubkey,
        targetPubkey: row.target_pubkey,
        targetPostId: row.target_post_id,
        reason: row.reason,
        createdAt: row.created_at,
    }));

    const recoveryReqRows = db.prepare("SELECT * FROM recovery_requests").all() as any[];
    const recoveryRequests: SyncRecoveryRequest[] = recoveryReqRows.map(row => ({
        id: row.id,
        oldPubkey: row.old_pubkey,
        newPubkey: row.new_pubkey,
        status: row.status,
        quorumRequired: row.quorum_required,
        createdAt: row.created_at,
        cooldownUntil: row.cooldown_until,
        executedAt: row.executed_at,
        expiresAt: row.expires_at,
        updatedAt: row.updated_at || row.executed_at || row.cooldown_until || row.created_at,
    }));

    const recoveryAppRows = db.prepare("SELECT * FROM recovery_approvals").all() as any[];
    const recoveryApprovals: SyncRecoveryApproval[] = recoveryAppRows.map(row => ({
        requestId: row.request_id,
        guardianPubkey: row.guardian_pubkey,
        decision: row.decision,
        createdAt: row.created_at,
    }));

    const payload: SyncPayload = {
        stateHash: getStateHash(),
        nodeId,
        members,
        posts,
        photos,
        projects,
        ratings,
        accounts,
        transactions,
        marketplaceTransactions,
        friends,
        conversations,
        conversationParticipants,
        messages,
        abuseReports,
        recoveryRequests,
        recoveryApprovals,
    };

    const privateKey = getPrivateKey();
    if (privateKey) {
        try {
            const rawBody = JSON.stringify(payload);
            const signatureBytes = await privateKey.sign(new TextEncoder().encode(rawBody));
            payload.signature = Buffer.from(signatureBytes).toString('hex');
            payload.publicKey = Buffer.from(publicKeyToProtobuf(privateKey.publicKey)).toString('hex');
        } catch (e: any) {
            console.error(`[Sync] Failed to sign export payload:`, e.message || e);
        }
    }

    return payload;
}

/* -------------------------------------------------------------------------- */
/*                          Delta export (cursor-based)                        */
/* -------------------------------------------------------------------------- */

/**
 * Export only the rows that have mutated since `since`. Used by the
 * /beanpool/sync/delta/2.0.0 protocol once both sides have established a cursor.
 *
 * For mutable tables we filter by `updated_at`/`last_updated_at` (Deploy 1's
 * column + trigger machinery). For append-only tables (transactions, messages,
 * ratings, abuse_reports, conversations, recovery_approvals) the row's own
 * created_at/timestamp is the cursor.
 *
 * Tombstones since the cursor are included so hard-deletes propagate.
 *
 * The returned `cursor` is captured BEFORE the queries run (inside a single
 * transaction for snapshot consistency). The recipient stores this as their
 * next `since` — any write that lands during query execution will be picked
 * up by the *next* delta, not this one.
 */
export async function exportDeltaState(nodeId: string, since: string): Promise<SyncPayload> {
    const collected = db.transaction(() => {
        const cursorRow = db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS ts`).get() as { ts: string };
        const cursor = cursorRow.ts;

        // Mutable tables — filter by updated_at
        const memberRows = db.prepare(`SELECT * FROM members WHERE updated_at > ?`).all(since) as any[];
        const members: Member[] = memberRows.map(rowToMember);

        const postRows = db.prepare(`SELECT * FROM posts WHERE updated_at > ?`).all(since) as any[];
        const posts: MarketplacePost[] = postRows.map(row => ({
            id: row.id,
            type: row.type,
            category: row.category,
            title: row.title,
            description: row.description,
            credits: row.credits,
            priceType: row.price_type || 'fixed',
            authorPublicKey: row.author_pubkey,
            authorCallsign: '',
            createdAt: row.created_at,
            updatedAt: row.updated_at || row.created_at,
            active: Boolean(row.active),
            status: row.status,
            repeatable: Boolean(row.repeatable),
            acceptedBy: row.accepted_by,
            acceptedAt: row.accepted_at,
            pendingTransactionId: row.pending_transaction_id,
            completedAt: row.completed_at,
            lat: row.lat,
            lng: row.lng,
            originNode: row.origin_node,
        }));

        const photos = db.prepare(`SELECT * FROM post_photos WHERE updated_at > ?`).all(since) as PostPhoto[];
        const projects = db.prepare(`SELECT * FROM projects WHERE updated_at > ?`).all(since) as Project[];

        const accountRows = db.prepare(`SELECT * FROM accounts WHERE last_updated_at > ?`).all(since) as any[];
        const accounts: SyncAccount[] = accountRows.map(row => ({
            publicKey: row.public_key,
            balance: row.balance,
            lastUpdatedAt: row.last_updated_at,
            lastDemurrageEpoch: row.last_demurrage_epoch,
        }));

        const ratingTxKeys = new Set(
            (db.prepare("SELECT transaction_id, rater_pubkey FROM ratings").all() as any[])
                .map(r => `${r.transaction_id}|${r.rater_pubkey}`)
        );

        const marketplaceTxRows = db.prepare(`SELECT * FROM marketplace_transactions WHERE updated_at > ?`).all(since) as any[];
        const marketplaceTransactions: SyncMarketplaceTransaction[] = marketplaceTxRows.map(row => ({
            id: row.id,
            postId: row.post_id,
            buyerPubkey: row.buyer_pubkey,
            buyerPublicKey: row.buyer_pubkey,
            buyer_pubkey: row.buyer_pubkey,
            sellerPubkey: row.seller_pubkey,
            sellerPublicKey: row.seller_pubkey,
            seller_pubkey: row.seller_pubkey,
            credits: row.credits,
            hours: row.hours,
            status: row.status,
            createdAt: row.created_at,
            completedAt: row.completed_at,
            updatedAt: row.updated_at,
            ratedByBuyer: ratingTxKeys.has(`${row.id}|${row.buyer_pubkey}`),
            ratedBySeller: ratingTxKeys.has(`${row.id}|${row.seller_pubkey}`),
        }));

        const recoveryReqRows = db.prepare(`SELECT * FROM recovery_requests WHERE updated_at > ?`).all(since) as any[];
        const recoveryRequests: SyncRecoveryRequest[] = recoveryReqRows.map(row => ({
            id: row.id,
            oldPubkey: row.old_pubkey,
            newPubkey: row.new_pubkey,
            status: row.status,
            quorumRequired: row.quorum_required,
            createdAt: row.created_at,
            cooldownUntil: row.cooldown_until,
            executedAt: row.executed_at,
            expiresAt: row.expires_at,
            updatedAt: row.updated_at,
        }));

        // Append-only tables — filter by their natural creation/timestamp cursor
        const transactionRows = db.prepare(`SELECT * FROM transactions WHERE timestamp > ?`).all(since) as any[];
        const transactions: Transaction[] = transactionRows.map(row => ({
            id: row.id,
            from: row.from_pubkey,
            to: row.to_pubkey,
            amount: row.amount,
            memo: row.memo || '',
            timestamp: row.timestamp,
        }));

        const messageRows = db.prepare(`SELECT * FROM messages WHERE timestamp > ?`).all(since) as any[];
        const messages: Message[] = messageRows.map(row => ({
            id: row.id,
            conversationId: row.conversation_id,
            authorPubkey: row.author_pubkey,
            ciphertext: row.ciphertext,
            nonce: row.nonce,
            type: row.type as 'text' | 'system',
            systemType: row.system_type as SystemMessageType,
            metadata: row.metadata || undefined,
            timestamp: row.timestamp,
        }));

        const ratingRows = db.prepare(`SELECT * FROM ratings WHERE created_at > ?`).all(since) as any[];
        const ratings: Rating[] = ratingRows.map(r => ({
            id: r.id,
            targetPubkey: r.target_pubkey,
            raterPubkey: r.rater_pubkey,
            stars: r.stars,
            comment: r.comment || '',
            role: r.role,
            transactionId: r.transaction_id,
            createdAt: r.created_at,
        }));

        const abuseRows = db.prepare(`SELECT * FROM abuse_reports WHERE created_at > ?`).all(since) as any[];
        const abuseReports: SyncAbuseReport[] = abuseRows.map(row => ({
            id: row.id,
            reporterPubkey: row.reporter_pubkey,
            targetPubkey: row.target_pubkey,
            targetPostId: row.target_post_id,
            reason: row.reason,
            createdAt: row.created_at,
        }));

        const conversationRows = db.prepare(`SELECT * FROM conversations WHERE created_at > ?`).all(since) as any[];
        const conversations: SyncConversation[] = conversationRows.map(row => ({
            id: row.id,
            type: row.type,
            postId: row.post_id,
            name: row.name,
            createdBy: row.created_by,
            createdAt: row.created_at,
        }));

        const participantRows = db.prepare(`SELECT * FROM conversation_participants WHERE last_read_at > ?`).all(since) as any[];
        const conversationParticipants: SyncConversationParticipant[] = participantRows.map(row => ({
            conversationId: row.conversation_id,
            publicKey: row.public_key,
            lastReadAt: row.last_read_at,
        }));

        const friendRows = db.prepare(`SELECT * FROM friends WHERE added_at > ?`).all(since) as any[];
        const friends: SyncFriend[] = friendRows.map(row => ({
            ownerPubkey: row.owner_pubkey,
            friendPubkey: row.friend_pubkey,
            addedAt: row.added_at,
            isGuardian: Boolean(row.is_guardian),
        }));

        const recoveryAppRows = db.prepare(`SELECT * FROM recovery_approvals WHERE created_at > ?`).all(since) as any[];
        const recoveryApprovals: SyncRecoveryApproval[] = recoveryAppRows.map(row => ({
            requestId: row.request_id,
            guardianPubkey: row.guardian_pubkey,
            decision: row.decision,
            createdAt: row.created_at,
        }));

        const tombstoneRows = db.prepare(`SELECT * FROM tombstones WHERE deleted_at > ?`).all(since) as any[];
        const tombstones = tombstoneRows.map(row => ({
            tableName: row.table_name,
            rowKey: row.row_key,
            deletedAt: row.deleted_at,
        }));

        return {
            cursor, members, posts, photos, projects, accounts, marketplaceTransactions,
            recoveryRequests, transactions, messages, ratings, abuseReports,
            conversations, conversationParticipants, friends, recoveryApprovals, tombstones,
        };
    })();

    const payload: SyncPayload = { ...collected, nodeId };

    const privateKey = getPrivateKey();
    if (privateKey) {
        try {
            const rawBody = JSON.stringify(payload);
            const signatureBytes = await privateKey.sign(new TextEncoder().encode(rawBody));
            payload.signature = Buffer.from(signatureBytes).toString('hex');
            payload.publicKey = Buffer.from(publicKeyToProtobuf(privateKey.publicKey)).toString('hex');
        } catch (e: any) {
            console.error(`[Sync] Failed to sign delta payload:`, e.message || e);
        }
    }

    return payload;
}

export async function signSyncPayload(payload: SyncPayload): Promise<SyncPayload> {
    const privateKey = getPrivateKey();
    if (privateKey) {
        try {
            const rawBody = JSON.stringify(payload);
            const signatureBytes = await privateKey.sign(new TextEncoder().encode(rawBody));
            payload.signature = Buffer.from(signatureBytes).toString('hex');
            payload.publicKey = Buffer.from(publicKeyToProtobuf(privateKey.publicKey)).toString('hex');
        } catch (e: any) {
            console.error(`[Sync] Failed to sign payload:`, e.message || e);
        }
    }
    return payload;
}


/**
 * True if any of the row arrays or the tombstones array in the payload contains
 * at least one row. Used by the delta protocol responder to skip emitting an
 * empty payload (which would still serialize to ~80 bytes but isn't useful).
 */
export function hasDeltaContent(payload: SyncPayload): boolean {
    const arrayFields: (keyof SyncPayload)[] = [
        'members', 'posts', 'photos', 'projects', 'ratings', 'accounts',
        'transactions', 'marketplaceTransactions', 'friends', 'conversations',
        'conversationParticipants', 'messages', 'abuseReports',
        'recoveryRequests', 'recoveryApprovals', 'tombstones',
    ];
    return arrayFields.some(f => Array.isArray(payload[f]) && (payload[f] as any[]).length > 0);
}

export interface ImportResult {
    newMembers: number;
    updatedMembers: number;
    newPosts: number;
    updatedPosts: number;
    newTransactions: number;
    accountChanges: number;
    marketplaceTxns: number;
    newMessages: number;
    /** Tombstones successfully applied (rows deleted locally). */
    tombstonesApplied: number;
    /** Rows skipped because local copy was newer (last-writer-wins). */
    conflictsSkipped: number;
}

/* -------------------------------------------------------------------------- */
/*                  Tombstone application (hard-delete propagation)            */
/* -------------------------------------------------------------------------- */

/**
 * Apply a tombstone locally. Maps `tableName` to the correct DELETE statement
 * and splits compound `rowKey` on `|`. Returns true if a row was actually
 * deleted (false = row already gone, e.g. we already applied this tombstone).
 *
 * Whenever you add a new table to delta sync that supports hard-deletes,
 * add a case here AND ensure the corresponding deletion site calls
 * `writeTombstone(tableName, rowKey)` (see db.ts).
 */
function applyTombstoneLocally(tableName: string, rowKey: string): boolean {
    switch (tableName) {
        case 'friends': {
            const [owner, friend] = rowKey.split('|');
            if (!owner || !friend) return false;
            const r = db.prepare(`DELETE FROM friends WHERE owner_pubkey=? AND friend_pubkey=?`).run(owner, friend);
            return r.changes > 0;
        }
        case 'projects': {
            const r = db.prepare(`DELETE FROM projects WHERE id=?`).run(rowKey);
            return r.changes > 0;
        }
        case 'post_photos': {
            const [postId, orderNum] = rowKey.split('|');
            if (!postId || orderNum === undefined) return false;
            const r = db.prepare(`DELETE FROM post_photos WHERE post_id=? AND order_num=?`).run(postId, Number(orderNum));
            return r.changes > 0;
        }
        default:
            console.warn(`[Sync] Ignoring tombstone for unknown table: ${tableName}`);
            return false;
    }
}

/**
 * Look up the local mutation watermark for a row that might be tombstoned.
 * Returns null if the row doesn't exist locally (tombstone applies cleanly).
 * If the local row is newer than the incoming tombstone, the importer skips
 * the delete (a re-creation has happened locally since the tombstone).
 */
function lookupLocalUpdatedAt(tableName: string, rowKey: string): string | null {
    switch (tableName) {
        case 'friends': {
            const [owner, friend] = rowKey.split('|');
            if (!owner || !friend) return null;
            const r = db.prepare(`SELECT added_at AS ts FROM friends WHERE owner_pubkey=? AND friend_pubkey=?`).get(owner, friend) as { ts: string } | undefined;
            return r?.ts ?? null;
        }
        case 'projects': {
            const r = db.prepare(`SELECT updated_at AS ts FROM projects WHERE id=?`).get(rowKey) as { ts: string } | undefined;
            return r?.ts ?? null;
        }
        case 'post_photos': {
            const [postId, orderNum] = rowKey.split('|');
            if (!postId || orderNum === undefined) return null;
            const r = db.prepare(`SELECT updated_at AS ts FROM post_photos WHERE post_id=? AND order_num=?`).get(postId, Number(orderNum)) as { ts: string } | undefined;
            return r?.ts ?? null;
        }
        default:
            return null;
    }
}

export async function importRemoteState(remote: SyncPayload): Promise<ImportResult> {
    // Cryptographic validation of P2P Sync Payload
    if (!remote.signature || !remote.publicKey) {
        throw new Error(`[Sync] Cryptographic validation failed: Missing SyncPayload signature or publicKey`);
    }

    try {
        // Construct the unsigned base payload to verify against
        const { signature, publicKey, ...basePayload } = remote;
        const serialized = JSON.stringify(basePayload);
        
        // Reconstruct libp2p public key
        const pubKeyBuffer = Buffer.from(publicKey, 'hex');
        const pubKey = publicKeyFromProtobuf(pubKeyBuffer);
        
        // Verify signature
        const isValid = await pubKey.verify(
            new TextEncoder().encode(serialized),
            Buffer.from(signature, 'hex')
        );

        if (!isValid) {
            throw new Error('Invalid cryptographic signature.');
        }
        console.log(`[Sync] ✓ Cryptographically validated sync payload from nodeId: ${remote.nodeId}`);
    } catch (e: any) {
        console.error(`[Sync] ❌ SyncPayload signature validation failed:`, e.message || e);
        throw new Error(`Cryptographic sync payload verification failed: ${e.message}`);
    }

    let newMembers = 0, newPosts = 0;
    let updatedMembers = 0, updatedPosts = 0;
    let newTransactions = 0, accountChanges = 0, marketplaceTxns = 0, newMessages = 0;
    let tombstonesApplied = 0, conflictsSkipped = 0;

    // Set the origin so push-on-write can avoid echoing this delta back. Cleared
    // in the `finally` after the transaction. Module-level state is safe here
    // because Node's event loop + better-sqlite3's synchronous transactions
    // prevent interleaving with concurrent local writes.
    currentImportOrigin = remote.nodeId;

    try {
    db.transaction(() => {
        // 1. Import/Upsert Members
        for (const rm of remote.members ?? []) {
            const existing = db.prepare("SELECT updated_at FROM members WHERE public_key=?").get(rm.publicKey) as { updated_at: string | null } | undefined;
            if (!existing) {
                db.prepare(`INSERT INTO members (public_key, callsign, joined_at, invited_by, invite_code, home_node_url, avatar_url, bio, contact_value, contact_visibility, status, last_active_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    rm.publicKey,
                    rm.callsign,
                    rm.joinedAt,
                    rm.invitedBy,
                    rm.inviteCode,
                    rm.homeNodeUrl || null,
                    rm.avatarUrl || null,
                    rm.bio || null,
                    rm.contactValue || null,
                    rm.contactVisibility || null,
                    rm.status || 'active',
                    rm.lastActiveAt || null,
                    rm.updatedAt || rm.joinedAt
                );
                db.prepare(`INSERT INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, 0, 0)`).run(rm.publicKey);
                newMembers++;
            } else {
                // Last-writer-wins: skip if local copy is newer.
                if (rm.updatedAt && existing.updated_at && existing.updated_at >= rm.updatedAt) {
                    conflictsSkipped++;
                    continue;
                }
                // Explicitly write `updated_at` to the source's value so:
                //  (a) LWW semantics are preserved (cursor reflects source mutation time)
                //  (b) the members trigger's `WHEN NEW.updated_at IS OLD.updated_at` guard
                //      evaluates false → no double-bump on top of the source timestamp.
                const res = db.prepare(`UPDATE members SET
                    callsign = ?,
                    avatar_url = ?,
                    bio = ?,
                    contact_value = ?,
                    contact_visibility = ?,
                    status = ?,
                    last_active_at = ?,
                    updated_at = ?
                    WHERE public_key = ?`).run(
                    rm.callsign,
                    rm.avatarUrl || null,
                    rm.bio || null,
                    rm.contactValue || null,
                    rm.contactVisibility || null,
                    rm.status || 'active',
                    rm.lastActiveAt || null,
                    rm.updatedAt || existing.updated_at || new Date().toISOString(),
                    rm.publicKey
                );
                if (res.changes > 0) updatedMembers++;
            }
        }

        // 2. Import/Upsert Posts
        for (const rp of remote.posts ?? []) {
            const existing = db.prepare("SELECT updated_at FROM posts WHERE id=?").get(rp.id) as { updated_at: string | null } | undefined;
            if (!existing) {
                db.prepare(`INSERT INTO posts (id, type, category, title, description, credits, author_pubkey, created_at, active, status, repeatable, lat, lng, origin_node, price_type, accepted_by, accepted_at, pending_transaction_id, completed_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    rp.id,
                    rp.type,
                    rp.category,
                    rp.title,
                    rp.description,
                    rp.credits,
                    rp.authorPublicKey,
                    rp.createdAt,
                    rp.active ? 1 : 0,
                    rp.status,
                    rp.repeatable ? 1 : 0,
                    rp.lat ?? null,
                    rp.lng ?? null,
                    rp.originNode || remote.nodeId,
                    rp.priceType || 'fixed',
                    rp.acceptedBy || null,
                    rp.acceptedAt || null,
                    rp.pendingTransactionId || null,
                    rp.completedAt || null,
                    rp.updatedAt || rp.createdAt
                );
                newPosts++;
            } else {
                if (rp.updatedAt && existing.updated_at && existing.updated_at >= rp.updatedAt) {
                    conflictsSkipped++;
                    continue;
                }
                const res = db.prepare(`UPDATE posts SET
                    title = ?,
                    description = ?,
                    credits = ?,
                    active = ?,
                    status = ?,
                    repeatable = ?,
                    price_type = ?,
                    accepted_by = ?,
                    accepted_at = ?,
                    pending_transaction_id = ?,
                    completed_at = ?,
                    lat = ?,
                    lng = ?,
                    updated_at = ?
                    WHERE id = ?`).run(
                    rp.title,
                    rp.description,
                    rp.credits,
                    rp.active ? 1 : 0,
                    rp.status,
                    rp.repeatable ? 1 : 0,
                    rp.priceType || 'fixed',
                    rp.acceptedBy || null,
                    rp.acceptedAt || null,
                    rp.pendingTransactionId || null,
                    rp.completedAt || null,
                    rp.lat ?? null,
                    rp.lng ?? null,
                    rp.updatedAt || existing.updated_at || new Date().toISOString(),
                    rp.id
                );
                if (res.changes > 0) updatedPosts++;
            }
        }

        // 3. Import/Upsert Post Photos
        if (remote.photos) {
            for (const ph of remote.photos) {
                db.prepare(`INSERT OR REPLACE INTO post_photos (post_id, photo_data, order_num) 
                            VALUES (?, ?, ?)`).run(
                    ph.post_id,
                    ph.photo_data,
                    ph.order_num
                );
            }
        }

        // 4. Import/Upsert Projects
        if (remote.projects) {
            for (const pr of remote.projects) {
                db.prepare(`INSERT OR REPLACE INTO projects (id, creator_pubkey, title, description, photos, goal_amount, current_amount, deadline_at, status, created_at) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    pr.id,
                    pr.creator_pubkey,
                    pr.title,
                    pr.description,
                    pr.photos,
                    pr.goal_amount,
                    pr.current_amount,
                    pr.deadline_at,
                    pr.status,
                    pr.created_at
                );
            }
        }

        // 5. Import/Upsert Ratings (Reputation system)
        if (remote.ratings) {
            for (const rt of remote.ratings) {
                db.prepare(`INSERT OR REPLACE INTO ratings (id, target_pubkey, rater_pubkey, role, stars, comment, transaction_id, created_at) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    rt.id,
                    rt.targetPubkey,
                    rt.raterPubkey,
                    rt.role,
                    rt.stars,
                    rt.comment || null,
                    rt.transactionId,
                    rt.createdAt
                );
            }
        }

        // 6. Import/Upsert Accounts
        if (remote.accounts) {
            for (const acc of remote.accounts) {
                const res = db.prepare(`INSERT INTO accounts (public_key, balance, last_updated_at, last_demurrage_epoch)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(public_key) DO UPDATE SET
                                balance = excluded.balance,
                                last_updated_at = excluded.last_updated_at,
                                last_demurrage_epoch = excluded.last_demurrage_epoch`).run(
                    acc.publicKey,
                    acc.balance,
                    acc.lastUpdatedAt,
                    acc.lastDemurrageEpoch
                );
                if (res.changes > 0) accountChanges++;
            }
            // Reload LedgerManager state in memory to dynamically reflect remote ledger updates
            const updatedAccs = db.prepare("SELECT public_key as id, balance, last_demurrage_epoch as lastDemurrageEpoch FROM accounts").all() as any[];
            ledger.loadState(updatedAccs);
            // Restore commons balance if COMMONS_POOL exists in remote accounts
            const commonsAcc = remote.accounts.find(a => a.publicKey === 'COMMONS_POOL');
            if (commonsAcc) {
                setCommonsBalance(commonsAcc.balance);
            }
        }

        // 7. Import Immutable Transactions (Ledger Transfers)
        if (remote.transactions) {
            for (const tx of remote.transactions) {
                const res = db.prepare(`INSERT OR IGNORE INTO transactions (id, from_pubkey, to_pubkey, amount, memo, timestamp)
                            VALUES (?, ?, ?, ?, ?, ?)`).run(
                    tx.id,
                    tx.from,
                    tx.to,
                    tx.amount,
                    tx.memo,
                    tx.timestamp
                );
                if (res.changes > 0) newTransactions++;
            }
        }

        // 8. Import/Upsert Marketplace Escrow Transactions
        if (remote.marketplaceTransactions) {
            for (const mt of remote.marketplaceTransactions) {
                const res = db.prepare(`INSERT INTO marketplace_transactions (id, post_id, buyer_pubkey, seller_pubkey, credits, hours, status, created_at, completed_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                status = excluded.status,
                                completed_at = excluded.completed_at,
                                hours = excluded.hours,
                                credits = excluded.credits`).run(
                    mt.id,
                    mt.postId ?? mt.post_id ?? null,
                    mt.buyerPubkey ?? mt.buyerPublicKey ?? mt.buyer_pubkey ?? null,
                    mt.sellerPubkey ?? mt.sellerPublicKey ?? mt.seller_pubkey ?? null,
                    mt.credits ?? 0,
                    mt.hours ?? null,
                    mt.status ?? 'pending',
                    mt.createdAt ?? mt.created_at ?? new Date().toISOString(),
                    mt.completedAt ?? mt.completed_at ?? null
                );
                if (res.changes > 0) marketplaceTxns++;
            }
        }

        // 9. Import/Upsert Friends & Guardian Relations
        if (remote.friends) {
            for (const fr of remote.friends) {
                db.prepare(`INSERT INTO friends (owner_pubkey, friend_pubkey, added_at, is_guardian)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(owner_pubkey, friend_pubkey) DO UPDATE SET
                                is_guardian = excluded.is_guardian`).run(
                    fr.ownerPubkey,
                    fr.friendPubkey,
                    fr.addedAt,
                    fr.isGuardian ? 1 : 0
                );
            }
        }

        // 10. Import/Upsert Conversations
        if (remote.conversations) {
            for (const cv of remote.conversations) {
                db.prepare(`INSERT INTO conversations (id, type, post_id, name, created_by, created_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                name = excluded.name`).run(
                    cv.id,
                    cv.type,
                    cv.postId || null,
                    cv.name || null,
                    cv.createdBy || null,
                    cv.createdAt
                );
            }
        }

        // 11. Import/Upsert Conversation Participants
        if (remote.conversationParticipants) {
            for (const cp of remote.conversationParticipants) {
                db.prepare(`INSERT INTO conversation_participants (conversation_id, public_key, last_read_at)
                            VALUES (?, ?, ?)
                            ON CONFLICT(conversation_id, public_key) DO UPDATE SET
                                last_read_at = excluded.last_read_at`).run(
                    cp.conversationId,
                    cp.publicKey,
                    cp.lastReadAt || null
                );
            }
        }

        // 12. Import Immutable Chat Messages
        if (remote.messages) {
            for (const msg of remote.messages) {
                const res = db.prepare(`INSERT OR IGNORE INTO messages (id, conversation_id, author_pubkey, ciphertext, nonce, type, system_type, metadata, timestamp)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    msg.id,
                    msg.conversationId,
                    msg.authorPubkey,
                    msg.ciphertext,
                    msg.nonce,
                    msg.type || 'text',
                    msg.systemType || null,
                    msg.metadata || null,
                    msg.timestamp
                );
                if (res.changes > 0) newMessages++;
            }
        }

        // 13. Import Immutable Abuse Reports
        if (remote.abuseReports) {
            for (const ar of remote.abuseReports) {
                db.prepare(`INSERT OR IGNORE INTO abuse_reports (id, reporter_pubkey, target_pubkey, target_post_id, reason, created_at)
                            VALUES (?, ?, ?, ?, ?, ?)`).run(
                    ar.id,
                    ar.reporterPubkey,
                    ar.targetPubkey,
                    ar.targetPostId || null,
                    ar.reason,
                    ar.createdAt
                );
            }
        }

        // 14. Import/Upsert Social Recovery Requests
        if (remote.recoveryRequests) {
            for (const rr of remote.recoveryRequests) {
                db.prepare(`INSERT INTO recovery_requests (id, old_pubkey, new_pubkey, status, quorum_required, created_at, cooldown_until, executed_at, expires_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                status = excluded.status,
                                cooldown_until = excluded.cooldown_until,
                                executed_at = excluded.executed_at,
                                expires_at = excluded.expires_at`).run(
                    rr.id,
                    rr.oldPubkey,
                    rr.newPubkey,
                    rr.status,
                    rr.quorumRequired,
                    rr.createdAt,
                    rr.cooldownUntil || null,
                    rr.executedAt || null,
                    rr.expiresAt || null
                );
            }
        }

        // 15. Import Immutable Recovery Approvals
        if (remote.recoveryApprovals) {
            for (const ra of remote.recoveryApprovals) {
                db.prepare(`INSERT OR IGNORE INTO recovery_approvals (request_id, guardian_pubkey, decision, created_at)
                            VALUES (?, ?, ?, ?)`).run(
                    ra.requestId,
                    ra.guardianPubkey,
                    ra.decision,
                    ra.createdAt
                );
            }
        }

        // 16. Apply Tombstones (hard-delete propagation)
        //
        // For each tombstone we received, check whether the local row has
        // been re-created with a newer timestamp than the tombstone — if so,
        // skip the delete (the row was resurrected after the tombstone was
        // written elsewhere). Otherwise apply the DELETE locally AND persist
        // the tombstone in our own tombstones table so we forward it on the
        // next delta export.
        if (remote.tombstones) {
            for (const ts of remote.tombstones) {
                const localTs = lookupLocalUpdatedAt(ts.tableName, ts.rowKey);
                if (localTs && localTs > ts.deletedAt) {
                    conflictsSkipped++;
                    continue;
                }
                const deleted = applyTombstoneLocally(ts.tableName, ts.rowKey);
                db.prepare(`INSERT OR REPLACE INTO tombstones (table_name, row_key, deleted_at)
                            VALUES (?, ?, ?)`).run(ts.tableName, ts.rowKey, ts.deletedAt);
                if (deleted) tombstonesApplied++;
            }
        }
    })();
    } finally {
        currentImportOrigin = null;
    }

    if (newMembers > 0 || newPosts > 0) {
        broadcast({ type: 'state_synced', newMembers, newPosts, from: remote.nodeId });
    }
    return {
        newMembers,
        updatedMembers,
        newPosts,
        updatedPosts,
        newTransactions,
        accountChanges,
        marketplaceTxns,
        newMessages,
        tombstonesApplied,
        conflictsSkipped,
    };
}
// ===================== RATINGS =====================

export function addRating(raterPubkey: string, targetPubkey: string, stars: number, comment: string, transactionId: string): Rating | null {
    assertMemberActive(raterPubkey);
    if (!getMember(raterPubkey) || !getMember(targetPubkey) || raterPubkey === targetPubkey || stars < 1 || stars > 5) return null;

    const tx = db.prepare("SELECT * FROM marketplace_transactions WHERE id=? AND status='completed'").get(transactionId) as any;
    if (!tx || (tx.buyer_pubkey !== raterPubkey && tx.seller_pubkey !== raterPubkey) || (tx.buyer_pubkey !== targetPubkey && tx.seller_pubkey !== targetPubkey)) return null;

    const post = db.prepare("SELECT type FROM posts WHERE id=?").get(tx.post_id) as any;
    const isOffer = post?.type === 'offer';
    const targetRole: 'provider' | 'receiver' = (tx.seller_pubkey === targetPubkey) 
        ? (isOffer ? 'provider' : 'receiver') 
        : (isOffer ? 'receiver' : 'provider');

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    // UPSERT pattern
    const existing = db.prepare("SELECT * FROM ratings WHERE transaction_id=? AND rater_pubkey=?").get(transactionId, raterPubkey) as any;
    if (existing) {
        db.prepare("UPDATE ratings SET stars=?, comment=?, created_at=? WHERE id=?").run(stars, comment.slice(0, 200), createdAt, existing.id);
        return { ...existing, stars, comment, createdAt };
    }

    db.prepare(`INSERT INTO ratings (id, target_pubkey, rater_pubkey, stars, comment, role, transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, targetPubkey, raterPubkey, stars, comment.slice(0, 200), targetRole, transactionId, createdAt);
    return { id, targetPubkey, raterPubkey, stars, comment: comment.slice(0, 200), role: targetRole, transactionId, createdAt };
}

export function getRatings(targetPubkey: string): Rating[] {
    const rows = db.prepare("SELECT * FROM ratings WHERE target_pubkey=? ORDER BY created_at DESC").all(targetPubkey) as any[];
    return rows.map(r => ({ id: r.id, targetPubkey: r.target_pubkey, raterPubkey: r.rater_pubkey, stars: r.stars, comment: r.comment, role: r.role, transactionId: r.transaction_id, createdAt: r.created_at }));
}

export function getAverageRating(targetPubkey: string): { average: number; count: number; asProvider: { average: number; count: number }; asReceiver: { average: number; count: number } } {
    const all = db.prepare("SELECT AVG(stars) as avg, COUNT(*) as cnt FROM ratings WHERE target_pubkey=?").get(targetPubkey) as any;
    const prov = db.prepare("SELECT AVG(stars) as avg, COUNT(*) as cnt FROM ratings WHERE target_pubkey=? AND role='provider'").get(targetPubkey) as any;
    const recv = db.prepare("SELECT AVG(stars) as avg, COUNT(*) as cnt FROM ratings WHERE target_pubkey=? AND role='receiver'").get(targetPubkey) as any;

    const round = (val: number) => Math.round((val || 0) * 10) / 10;
    return {
        average: round(all.avg), count: all.cnt || 0,
        asProvider: { average: round(prov.avg), count: prov.cnt || 0 },
        asReceiver: { average: round(recv.avg), count: recv.cnt || 0 }
    };
}

// ===================== FRIENDS & GUARDIANS =====================

export function getFriends(pubkey: string): FriendEntry[] {
    const rows = db.prepare(`SELECT f.friend_pubkey, m.callsign, f.added_at, f.is_guardian FROM friends f JOIN members m ON f.friend_pubkey = m.public_key WHERE f.owner_pubkey=?`).all(pubkey) as any[];
    return rows.map(r => ({ publicKey: r.friend_pubkey, callsign: r.callsign, addedAt: r.added_at, isGuardian: Boolean(r.is_guardian) }));
}

export function addFriend(ownerPubkey: string, friendPubkey: string): FriendEntry | null {
    if (!getMember(ownerPubkey) || !getMember(friendPubkey) || ownerPubkey === friendPubkey) return null;
    
    // UPSERT ignore logic
    const exists = db.prepare("SELECT * FROM friends WHERE owner_pubkey=? AND friend_pubkey=?").get(ownerPubkey, friendPubkey);
    if (!exists) {
        db.prepare("INSERT INTO friends (owner_pubkey, friend_pubkey, added_at) VALUES (?, ?, ?)").run(ownerPubkey, friendPubkey, new Date().toISOString());
    }
    return getFriends(ownerPubkey).find(f => f.publicKey === friendPubkey) || null;
}

export function removeFriend(ownerPubkey: string, friendPubkey: string): boolean {
    const res = db.prepare("DELETE FROM friends WHERE owner_pubkey=? AND friend_pubkey=?").run(ownerPubkey, friendPubkey);
    if (res.changes > 0) {
        writeTombstone('friends', `${ownerPubkey}|${friendPubkey}`);
    }
    return res.changes > 0;
}

export function setGuardian(ownerPubkey: string, friendPubkey: string, isGuardian: boolean): boolean {
    const res = db.prepare("UPDATE friends SET is_guardian=? WHERE owner_pubkey=? AND friend_pubkey=?").run(isGuardian ? 1 : 0, ownerPubkey, friendPubkey);
    return res.changes > 0;
}

// ===================== SOCIAL RECOVERY =====================

export function getGuardiansOf(pubkey: string): string[] {
    const rows = db.prepare(`SELECT friend_pubkey FROM friends WHERE owner_pubkey=? AND is_guardian=1`).all(pubkey) as any[];
    return rows.map(r => r.friend_pubkey);
}

export function getMyWards(guardianPubkey: string): { publicKey: string; callsign: string; avatarUrl: string | null }[] {
    const rows = db.prepare(`
        SELECT f.owner_pubkey as publicKey, m.callsign, m.avatar_url as avatarUrl
        FROM friends f 
        JOIN members m ON f.owner_pubkey = m.public_key 
        WHERE f.friend_pubkey=? AND f.is_guardian=1
    `).all(guardianPubkey) as any[];
    return rows;
}

export function createRecoveryRequest(oldPubkey: string, newPubkey: string, guardianGuessCallsign: string): RecoveryRequest | null {
    const oldMember = getMember(oldPubkey);
    if (!oldMember || oldMember.status === 'migrated') throw new Error('Invalid or already migrated member');
    
    // Guardian knowledge check
    const guardians = getGuardiansOf(oldPubkey);
    if (guardians.length < 3) throw new Error('Account does not have enough guardians to recover');
    
    const normalizedGuess = guardianGuessCallsign.toLowerCase().trim();
    const guessMatch = guardians.some(pubkey => {
        const m = getMember(pubkey);
        return m ? m.callsign.toLowerCase().trim() === normalizedGuess : false;
    });
    
    if (!guessMatch) {
        throw new Error('Guardian knowledge check failed. You must provide the exact callsign of one of your guardians.');
    }

    const existingPending = db.prepare(`SELECT * FROM recovery_requests WHERE old_pubkey=? AND status='pending'`).get(oldPubkey);
    if (existingPending) throw new Error('A recovery request is already pending for this account');
    
    if (getMember(newPubkey)) throw new Error('New public key is already registered');

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    // Expire in 7 days
    const expiresAtDate = new Date();
    expiresAtDate.setDate(expiresAtDate.getDate() + 7);
    const expiresAt = expiresAtDate.toISOString();

    db.prepare(`
        INSERT INTO recovery_requests (id, old_pubkey, new_pubkey, status, quorum_required, created_at, expires_at)
        VALUES (?, ?, ?, 'pending', 3, ?, ?)
    `).run(id, oldPubkey, newPubkey, createdAt, expiresAt);

    return getRecoveryRequest(id)!;
}

export function getRecoveryRequest(id: string): RecoveryRequest | undefined {
    const row = db.prepare(`SELECT * FROM recovery_requests WHERE id=?`).get(id) as any;
    if (!row) return undefined;
    return {
        id: row.id,
        oldPubkey: row.old_pubkey,
        newPubkey: row.new_pubkey,
        status: row.status,
        quorumRequired: row.quorum_required,
        createdAt: row.created_at,
        cooldownUntil: row.cooldown_until,
        executedAt: row.executed_at,
        expiresAt: row.expires_at
    };
}

export function approveRecovery(requestId: string, guardianPubkey: string): boolean {
    const req = getRecoveryRequest(requestId);
    if (!req || req.status !== 'pending') throw new Error('Invalid or non-pending request');
    
    const guardians = getGuardiansOf(req.oldPubkey);
    if (!guardians.includes(guardianPubkey)) throw new Error('Not a guardian for this account');

    db.transaction(() => {
        db.prepare(`INSERT OR REPLACE INTO recovery_approvals (request_id, guardian_pubkey, decision, created_at) VALUES (?, ?, 'approve', ?)`).run(requestId, guardianPubkey, new Date().toISOString());
        
        // Check quorum
        const approvals = db.prepare(`SELECT COUNT(*) as count FROM recovery_approvals WHERE request_id=? AND decision='approve'`).get(requestId) as any;
        if (approvals.count >= req.quorumRequired) {
            const cooldownDate = new Date();
            cooldownDate.setHours(cooldownDate.getHours() + 24);
            db.prepare(`UPDATE recovery_requests SET status='approved', cooldown_until=? WHERE id=?`).run(cooldownDate.toISOString(), requestId);
        }
    })();
    return true;
}

export function rejectRecovery(requestId: string, guardianPubkey: string): boolean {
    const req = getRecoveryRequest(requestId);
    if (!req || req.status !== 'pending') throw new Error('Invalid or non-pending request');
    
    const guardians = getGuardiansOf(req.oldPubkey);
    if (!guardians.includes(guardianPubkey)) throw new Error('Not a guardian for this account');

    db.transaction(() => {
        db.prepare(`INSERT OR REPLACE INTO recovery_approvals (request_id, guardian_pubkey, decision, created_at) VALUES (?, ?, 'reject', ?)`).run(requestId, guardianPubkey, new Date().toISOString());
        
        // Check if impossible to reach quorum
        const rejections = db.prepare(`SELECT COUNT(*) as count FROM recovery_approvals WHERE request_id=? AND decision='reject'`).get(requestId) as any;
        const maxPossibleApprovals = guardians.length - rejections.count;
        if (maxPossibleApprovals < req.quorumRequired) {
            db.prepare(`UPDATE recovery_requests SET status='cancelled' WHERE id=?`).run(requestId);
        }
    })();
    return true;
}

export function cancelRecovery(requestId: string, cancellerPubkey: string): boolean {
    const req = getRecoveryRequest(requestId);
    if (!req || (req.status !== 'pending' && req.status !== 'approved')) throw new Error('Cannot cancel this request');
    
    if (req.oldPubkey !== cancellerPubkey && req.newPubkey !== cancellerPubkey) {
        throw new Error('Only the original or new identity can cancel');
    }

    db.prepare(`UPDATE recovery_requests SET status='cancelled' WHERE id=?`).run(requestId);
    return true;
}

export function executeRecovery(requestId: string): boolean {
    const req = getRecoveryRequest(requestId);
    if (!req || req.status !== 'approved') throw new Error('Request not ready for execution');
    if (!req.cooldownUntil || new Date() < new Date(req.cooldownUntil)) throw new Error('Cooldown period has not elapsed');

    const oldP = req.oldPubkey;
    const newP = req.newPubkey;

    db.transaction(() => {
        // 1. Members and Accounts
        db.prepare(`UPDATE members SET public_key=? WHERE public_key=?`).run(newP, oldP);
        db.prepare(`UPDATE accounts SET public_key=? WHERE public_key=?`).run(newP, oldP);
        
        // 2. Transactions
        db.prepare(`UPDATE transactions SET from_pubkey=? WHERE from_pubkey=?`).run(newP, oldP);
        db.prepare(`UPDATE transactions SET to_pubkey=? WHERE to_pubkey=?`).run(newP, oldP);
        
        // 3. Posts & Marketplace
        db.prepare(`UPDATE posts SET author_pubkey=? WHERE author_pubkey=?`).run(newP, oldP);
        db.prepare(`UPDATE posts SET accepted_by=? WHERE accepted_by=?`).run(newP, oldP);
        db.prepare(`UPDATE marketplace_transactions SET buyer_pubkey=? WHERE buyer_pubkey=?`).run(newP, oldP);
        db.prepare(`UPDATE marketplace_transactions SET seller_pubkey=? WHERE seller_pubkey=?`).run(newP, oldP);
        
        // 4. Conversations & Messages
        db.prepare(`UPDATE conversations SET created_by=? WHERE created_by=?`).run(newP, oldP);
        db.prepare(`UPDATE conversation_participants SET public_key=? WHERE public_key=?`).run(newP, oldP);
        db.prepare(`UPDATE messages SET author_pubkey=? WHERE author_pubkey=?`).run(newP, oldP);
        
        // 5. Friends
        db.prepare(`UPDATE friends SET owner_pubkey=? WHERE owner_pubkey=?`).run(newP, oldP);
        db.prepare(`UPDATE friends SET friend_pubkey=? WHERE friend_pubkey=?`).run(newP, oldP);
        
        // 6. Ratings & Abuse
        db.prepare(`UPDATE ratings SET target_pubkey=? WHERE target_pubkey=?`).run(newP, oldP);
        db.prepare(`UPDATE ratings SET rater_pubkey=? WHERE rater_pubkey=?`).run(newP, oldP);
        db.prepare(`UPDATE abuse_reports SET reporter_pubkey=? WHERE reporter_pubkey=?`).run(newP, oldP);
        db.prepare(`UPDATE abuse_reports SET target_pubkey=? WHERE target_pubkey=?`).run(newP, oldP);
        
        // 7. Projects
        db.prepare(`UPDATE projects SET creator_pubkey=? WHERE creator_pubkey=?`).run(newP, oldP);
        
        // 8. Push Tokens & Prefs
        db.prepare(`UPDATE push_tokens SET public_key=? WHERE public_key=?`).run(newP, oldP);
        db.prepare(`UPDATE member_preferences SET public_key=? WHERE public_key=?`).run(newP, oldP);

        // 9. Mark old as migrated (already changed above, so wait. If we UPDATE members SET public_key=newP WHERE public_key=oldP, oldP is GONE).
        // Let's create a tombstone for oldP just in case.
        const migratedCallsign = 'migrated_' + oldP.substring(0, 8);
        db.prepare(`INSERT INTO members (public_key, callsign, status) VALUES (?, ?, 'migrated')`).run(oldP, migratedCallsign);

        // 10. Update request status
        db.prepare(`UPDATE recovery_requests SET status='executed', executed_at=? WHERE id=?`).run(new Date().toISOString(), requestId);
    })();
    return true;
}

export function getPendingRecoveryRequests(guardianPubkey: string): any[] {
    const wards = getMyWards(guardianPubkey).map(w => w.publicKey);
    if (wards.length === 0) return [];
    
    const placeholders = wards.map(() => '?').join(',');
    const rows = db.prepare(`
        SELECT r.*, m.callsign as old_callsign, m.avatar_url,
               (SELECT COUNT(*) FROM recovery_approvals WHERE request_id=r.id AND decision='approve') as approvals,
               (SELECT decision FROM recovery_approvals WHERE request_id=r.id AND guardian_pubkey=?) as my_decision
        FROM recovery_requests r
        JOIN members m ON r.old_pubkey = m.public_key
        WHERE r.old_pubkey IN (${placeholders}) AND r.status IN ('pending', 'approved')
    `).all(guardianPubkey, ...wards) as any[];

    return rows.map(r => ({
        id: r.id,
        oldPubkey: r.old_pubkey,
        newPubkey: r.new_pubkey,
        oldCallsign: r.old_callsign,
        avatarUrl: r.avatar_url,
        status: r.status,
        quorumRequired: r.quorum_required,
        approvals: r.approvals,
        myDecision: r.my_decision,
        createdAt: r.created_at,
        cooldownUntil: r.cooldown_until,
        expiresAt: r.expires_at
    }));
}

export function getRecoveryStatus(pubkey: string): any | null {
    const row = db.prepare(`
        SELECT r.*,
               (SELECT COUNT(*) FROM recovery_approvals WHERE request_id=r.id AND decision='approve') as approvals
        FROM recovery_requests r 
        WHERE (r.old_pubkey=? OR r.new_pubkey=?) AND r.status IN ('pending', 'approved')
        ORDER BY r.created_at DESC LIMIT 1
    `).get(pubkey, pubkey) as any;
    
    if (!row) return null;
    return {
        id: row.id,
        status: row.status,
        approvals: row.approvals,
        quorumRequired: row.quorum_required,
        createdAt: row.created_at,
        cooldownUntil: row.cooldown_until
    };
}

// ===================== ABUSE REPORTS =====================

export function submitReport(reporterPubkey: string, targetPubkey: string, reason: string, targetPostId?: string): AbuseReport | null {
    if (!getMember(reporterPubkey) || reporterPubkey === targetPubkey) return null;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(`INSERT INTO abuse_reports (id, reporter_pubkey, target_pubkey, target_post_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, reporterPubkey, targetPubkey, targetPostId || null, reason.slice(0, 500), createdAt);
    return { id, reporterPubkey, targetPubkey, targetPostId, reason: reason.slice(0, 500), createdAt };
}

export function getReports(): AbuseReport[] {
    const rows = db.prepare(`
        SELECT ar.*, 
               mr.callsign as reporter_callsign, 
               mt.callsign as target_callsign,
               p.title as post_title
        FROM abuse_reports ar
        LEFT JOIN members mr ON ar.reporter_pubkey = mr.public_key
        LEFT JOIN members mt ON ar.target_pubkey = mt.public_key
        LEFT JOIN posts p ON ar.target_post_id = p.id
        ORDER BY ar.created_at DESC
    `).all() as any[];
    return rows.map(r => ({ 
        id: r.id, reporterPubkey: r.reporter_pubkey, targetPubkey: r.target_pubkey, 
        targetPostId: r.target_post_id, reason: r.reason, createdAt: r.created_at,
        status: r.status || 'pending',
        reporterCallsign: r.reporter_callsign || r.reporter_pubkey.substring(0, 8),
        targetCallsign: r.target_callsign || r.target_pubkey.substring(0, 8),
        postTitle: r.post_title || null
    }));
}

export function getReportCount(): number {
    return (db.prepare("SELECT COUNT(*) as c FROM abuse_reports WHERE status = 'pending' OR status IS NULL").get() as any).c;
}

/**
 * Aggregated per-member stats for the Audit tree.
 * Returns one row per member with post counts, message counts, trade volume, and escrow cancellation counts.
 * Single-pass SQL — no per-member queries needed on the frontend.
 */
export function getMemberStats(): Record<string, { posts: number; messages: number; deals: number; volume: number; cancelled: number }> {
    const rows = db.prepare(`
        SELECT m.public_key,
            COALESCE(p.post_count, 0) as post_count,
            COALESCE(msg.msg_count, 0) as msg_count,
            COALESCE(d.deal_count, 0) as deal_count,
            COALESCE(d.volume, 0) as volume,
            COALESCE(d.cancelled_count, 0) as cancelled_count
        FROM members m
        LEFT JOIN (
            SELECT author_pubkey, COUNT(*) as post_count 
            FROM posts WHERE active = 1 
            GROUP BY author_pubkey
        ) p ON m.public_key = p.author_pubkey
        LEFT JOIN (
            SELECT author_pubkey, COUNT(*) as msg_count 
            FROM messages WHERE author_pubkey != 'SYSTEM' 
            GROUP BY author_pubkey
        ) msg ON m.public_key = msg.author_pubkey
        LEFT JOIN (
            SELECT pubkey,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as deal_count,
                SUM(CASE WHEN status = 'completed' THEN credits ELSE 0 END) as volume,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
            FROM (
                SELECT buyer_pubkey as pubkey, status, credits FROM marketplace_transactions
                UNION ALL
                SELECT seller_pubkey as pubkey, status, credits FROM marketplace_transactions
            ) combined
            GROUP BY pubkey
        ) d ON m.public_key = d.pubkey
    `).all() as any[];

    const stats: Record<string, { posts: number; messages: number; deals: number; volume: number; cancelled: number }> = {};
    for (const r of rows) {
        stats[r.public_key] = {
            posts: r.post_count,
            messages: r.msg_count,
            deals: r.deal_count,
            volume: Math.round(r.volume * 100) / 100,
            cancelled: r.cancelled_count
        };
    }
    return stats;
}

export function dismissReport(reportId: string): boolean {
    const res = db.prepare("UPDATE abuse_reports SET status = 'reviewed' WHERE id = ?").run(reportId);
    return res.changes > 0;
}

export function actionReport(reportId: string, deletePost: boolean = false): boolean {
    const report = db.prepare("SELECT * FROM abuse_reports WHERE id = ?").get(reportId) as any;
    if (!report) return false;
    
    db.prepare("UPDATE abuse_reports SET status = 'actioned' WHERE id = ?").run(reportId);
    
    if (deletePost && report.target_post_id) {
        adminDeletePost(report.target_post_id);
    }
    return true;
}

export function adminBulkDeletePosts(postIds: string[]): number {
    let deleted = 0;
    db.transaction(() => {
        for (const id of postIds) {
            try {
                adminDeletePost(id);
                deleted++;
            } catch (e) {
                console.error(`Failed to delete post ${id}:`, e);
            }
        }
    })();
    return deleted;
}

export function getPostCount(filter?: { type?: string; category?: string; status?: string; query?: string }): number {
    let query = `SELECT COUNT(*) as c FROM posts WHERE active = 1 AND status NOT IN ('cancelled')`;
    const params: any[] = [];
    if (filter?.type && filter.type !== 'all') { query += " AND type = ?"; params.push(filter.type); }
    if (filter?.category && filter.category !== 'all') { query += " AND category = ?"; params.push(filter.category); }
    if (filter?.status) { query += " AND status = ?"; params.push(filter.status); }
    return (db.prepare(query).get(...params) as any).c;
}

// ===================== COMMUNITY HEALTH =====================

export interface HealthFlag { type: 'wash_trading' | 'isolated_branch' | 'inactive_member' | 'invite_spam' | 'sybil_funnel'; severity: 'warning' | 'alert'; description: string; members: string[]; }
export interface CommunityHealth { nodeName: string; version: string; minAppVersion: string; currency: { type: string; value: string }; tree: any; activity: any; flags: HealthFlag[]; reportCount: number; }

export function getCommunityHealth(): CommunityHealth {
    const now = Date.now();
    const t = getThresholds();
    
    // Active vs Inactive member counts (excluding genesis admin account)
    let activeMemberCount = 0;
    let inactiveMemberCount = 0;
    try {
        activeMemberCount = (db.prepare(`
            SELECT COUNT(DISTINCT m.public_key) as c 
            FROM members m 
            WHERE m.status != 'pruned' AND m.invited_by != 'genesis' AND (
                m.joined_at > datetime('now', '-${t.inactiveMemberDays} days') OR
                m.public_key IN (
                    SELECT DISTINCT from_pubkey FROM transactions WHERE timestamp > datetime('now', '-${t.inactiveMemberDays} days')
                    UNION
                    SELECT DISTINCT to_pubkey FROM transactions WHERE timestamp > datetime('now', '-${t.inactiveMemberDays} days')
                )
            )
        `).get() as any).c;
        
        inactiveMemberCount = (db.prepare(`
            SELECT COUNT(DISTINCT m.public_key) as c 
            FROM members m 
            WHERE m.status != 'pruned' AND m.invited_by != 'genesis' AND
            m.joined_at <= datetime('now', '-${t.inactiveMemberDays} days') AND
            m.public_key NOT IN (
                SELECT DISTINCT from_pubkey FROM transactions WHERE timestamp > datetime('now', '-${t.inactiveMemberDays} days')
                UNION
                SELECT DISTINCT to_pubkey FROM transactions WHERE timestamp > datetime('now', '-${t.inactiveMemberDays} days')
            )
        `).get() as any).c;
    } catch (e) { console.error('Failed to calculate member activity stats:', e); }

    // ⚡ Bolt Optimization: Use SQL COUNT instead of array length to prevent O(N) memory allocation
    const totalMembers = (db.prepare("SELECT COUNT(*) as c FROM members WHERE status != 'pruned'").get() as any).c;
    
    // ========== HEALTH FLAG DETECTION ==========
    const flags: HealthFlag[] = [];
    
    // 1. Inactive Members: no transactions in N days, and must have joined > N days ago
    try {
        const inactiveRows = db.prepare(`
            SELECT m.public_key, m.callsign FROM members m 
            WHERE m.status = 'active' AND m.invited_by != 'genesis'
            AND m.joined_at <= datetime('now', '-${t.inactiveMemberDays} days')
            AND m.public_key NOT IN (
                SELECT DISTINCT from_pubkey FROM transactions WHERE timestamp > datetime('now', '-${t.inactiveMemberDays} days')
                UNION
                SELECT DISTINCT to_pubkey FROM transactions WHERE timestamp > datetime('now', '-${t.inactiveMemberDays} days')
            )
        `).all() as any[];
        if (inactiveRows.length > 0) {
            flags.push({
                type: 'inactive_member',
                severity: 'warning',
                description: `${inactiveRows.length} member${inactiveRows.length > 1 ? 's' : ''} with no activity for ${t.inactiveMemberDays}+ days`,
                members: inactiveRows.map(r => r.public_key)
            });
        }
    } catch (e) { console.error('Health flag check (inactive) failed:', e); }
    
    // 2. Wash Trading: reciprocal transactions between the same pair within time window
    try {
        const washRows = db.prepare(`
            SELECT t1.from_pubkey as a, t1.to_pubkey as b, COUNT(*) as cnt
            FROM transactions t1
            WHERE t1.timestamp > datetime('now', '-${t.washTradingWindowHours} hours')
            AND t1.from_pubkey NOT LIKE 'escrow_%' AND t1.to_pubkey NOT LIKE 'escrow_%'
            AND t1.from_pubkey != 'commons' AND t1.to_pubkey != 'commons'
            GROUP BY t1.from_pubkey, t1.to_pubkey
            HAVING cnt >= ${t.washTradingMinTxns}
        `).all() as any[];
        
        // Find reciprocal pairs (A→B AND B→A both above threshold)
        const pairs = new Set<string>();
        for (const row of washRows) {
            const reverse = washRows.find(r => r.a === row.b && r.b === row.a);
            if (reverse) {
                const key = [row.a, row.b].sort().join('|');
                if (!pairs.has(key)) {
                    pairs.add(key);
                    const callsignA = (db.prepare("SELECT callsign FROM members WHERE public_key=?").get(row.a) as any)?.callsign || row.a.substring(0, 8);
                    const callsignB = (db.prepare("SELECT callsign FROM members WHERE public_key=?").get(row.b) as any)?.callsign || row.b.substring(0, 8);
                    flags.push({
                        type: 'wash_trading',
                        severity: 'alert',
                        description: `${row.cnt + reverse.cnt} reciprocal transactions between ${callsignA} ↔ ${callsignB} in ${t.washTradingWindowHours}h`,
                        members: [row.a, row.b]
                    });
                }
            }
        }
    } catch (e) { console.error('Health flag check (wash trading) failed:', e); }

    // 3. Sybil Funnel: invitees purchasing from their inviter via marketplace
    try {
        // Primary: completed marketplace deals where buyer was invited by seller
        const funnelRows = db.prepare(`
            SELECT 
                seller.public_key as farmer_pubkey,
                seller.callsign as farmer_callsign,
                COUNT(DISTINCT mt.buyer_pubkey) as puppet_count,
                ROUND(SUM(mt.credits), 2) as total_funneled,
                GROUP_CONCAT(DISTINCT buyer.callsign) as puppet_names,
                GROUP_CONCAT(DISTINCT buyer.public_key) as puppet_keys
            FROM marketplace_transactions mt
            JOIN members buyer ON mt.buyer_pubkey = buyer.public_key
            JOIN members seller ON mt.seller_pubkey = seller.public_key
            WHERE buyer.invited_by = seller.public_key
              AND mt.status = 'completed'
              AND mt.created_at > datetime('now', ? || ' days')
            GROUP BY seller.public_key
            HAVING puppet_count >= ?
               AND total_funneled >= ?
        `).all(`-${t.sybilFunnelWindowDays}`, t.sybilFunnelMinInvitees, t.sybilFunnelMinAmount) as any[];

        // Secondary: direct transfers (for Resident+ accounts that graduated past Ghost)
        const directFunnelRows = db.prepare(`
            SELECT 
                inviter.public_key as farmer_pubkey,
                inviter.callsign as farmer_callsign,
                COUNT(DISTINCT txn.from_pubkey) as puppet_count,
                ROUND(SUM(txn.amount), 2) as total_funneled,
                GROUP_CONCAT(DISTINCT puppet.callsign) as puppet_names,
                GROUP_CONCAT(DISTINCT puppet.public_key) as puppet_keys
            FROM transactions txn
            JOIN members puppet ON txn.from_pubkey = puppet.public_key
            JOIN members inviter ON puppet.invited_by = inviter.public_key
            WHERE txn.to_pubkey = inviter.public_key
              AND txn.from_pubkey NOT LIKE 'escrow_%'
              AND txn.to_pubkey NOT LIKE 'escrow_%'
              AND txn.from_pubkey NOT LIKE 'project_%'
              AND txn.to_pubkey != 'commons'
              AND txn.from_pubkey != 'SYSTEM'
              AND txn.timestamp > datetime('now', ? || ' days')
            GROUP BY inviter.public_key
            HAVING puppet_count >= ?
               AND total_funneled >= ?
        `).all(`-${t.sybilFunnelWindowDays}`, t.sybilFunnelMinInvitees, t.sybilFunnelMinAmount) as any[];

        // Merge & deduplicate by farmer
        const seen = new Set<string>();
        for (const row of [...funnelRows, ...directFunnelRows]) {
            if (seen.has(row.farmer_pubkey)) continue;
            seen.add(row.farmer_pubkey);

            // Isolation check: do the puppets trade with ANYONE else?
            const puppetPubkeys = db.prepare(`
                SELECT public_key FROM members WHERE invited_by = ?
            `).all(row.farmer_pubkey) as any[];
            
            let isolatedPuppets = 0;
            for (const p of puppetPubkeys) {
                const marketPartners = db.prepare(`
                    SELECT COUNT(DISTINCT partner) as cnt FROM (
                        SELECT seller_pubkey as partner FROM marketplace_transactions
                        WHERE buyer_pubkey = ? AND seller_pubkey != ? AND status = 'completed'
                        UNION
                        SELECT buyer_pubkey as partner FROM marketplace_transactions
                        WHERE seller_pubkey = ? AND buyer_pubkey != ? AND status = 'completed'
                    )
                `).get(p.public_key, row.farmer_pubkey, p.public_key, row.farmer_pubkey) as any;

                const directPartners = db.prepare(`
                    SELECT COUNT(DISTINCT partner) as cnt FROM (
                        SELECT to_pubkey as partner FROM transactions
                        WHERE from_pubkey = ? AND to_pubkey != ?
                          AND to_pubkey NOT LIKE 'escrow_%' AND to_pubkey NOT LIKE 'project_%'
                          AND to_pubkey != 'commons' AND to_pubkey != 'SYSTEM'
                        UNION
                        SELECT from_pubkey as partner FROM transactions
                        WHERE to_pubkey = ? AND from_pubkey != ?
                          AND from_pubkey NOT LIKE 'escrow_%' AND from_pubkey NOT LIKE 'project_%'
                          AND from_pubkey != 'commons' AND from_pubkey != 'SYSTEM'
                    )
                `).get(p.public_key, row.farmer_pubkey, p.public_key, row.farmer_pubkey) as any;

                if ((marketPartners?.cnt || 0) + (directPartners?.cnt || 0) === 0) isolatedPuppets++;
            }

            flags.push({
                type: 'sybil_funnel',
                severity: 'alert',
                description: `Invite funnel: ${row.puppet_count} invitees of "${row.farmer_callsign}" sent ${row.total_funneled}B back (${isolatedPuppets} with 0 other partners)`,
                members: [row.farmer_pubkey, ...(row.puppet_keys?.split(',') || [])]
            });
        }
    } catch (e) { console.error('Health flag check (sybil funnel) failed:', e); }
    
    const config = getLocalConfig();
    const reportCount = getReportCount();
    
    return {
        nodeName: getDirectoryInfo()?.name || 'Local Discovery',
        version: '1.0.89',
        minAppVersion: '1.0.75',
        currency: { type: config.currencyType || 'image', value: config.currencyValue || 'bean' },
        tree: { totalMembers, maxDepth: 0, widestBranch: { callsign: 'db-optimized', children: 0 }, avgBranchSize: 0 },
        activity: {
            totalTransactions: (db.prepare(`SELECT COUNT(*) as c FROM transactions`).get() as any).c,
            totalPosts: (db.prepare(`SELECT COUNT(*) as c FROM posts WHERE status IN ('active', 'pending')`).get() as any).c,
            last7Days: (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE timestamp > datetime('now', '-7 days')`).get() as any).c,
            last30Days: (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE timestamp > datetime('now', '-30 days')`).get() as any).c,
            activeMemberCount,
            inactiveMemberCount,
            commonsBalance: Math.round(COMMONS_BALANCE * 100) / 100
        },
        flags,
        reportCount
    };
}

// ===================== ADMIN CONTROLS =====================

export function getAdminPubkey(): string {
    const row = db.prepare("SELECT public_key FROM members WHERE invited_by = 'genesis' LIMIT 1").get() as any;
    return row ? row.public_key : 'system';
}

export function adminSetUserStatus(publicKey: string, status: 'active' | 'disabled' | 'pruned') {
    db.prepare("UPDATE members SET status=? WHERE public_key=?").run(status, publicKey);
    broadcast({ type: 'profile_updated', publicKey });
}

export function adminDeletePost(postId: string) {
    db.transaction(() => {
        // Find existing pending transactions to refund escrow
        const pending = db.prepare("SELECT * FROM marketplace_transactions WHERE post_id=? AND status='pending'").all(postId) as any[];
        for (const tx of pending) {
            transfer(`escrow_${tx.id}`, tx.buyer_pubkey, tx.credits, `Escrow refund for removed post`, 'escrow');
            db.prepare("UPDATE marketplace_transactions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?").run(tx.id);
        }
        db.prepare("UPDATE marketplace_transactions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE post_id=? AND status='requested'").run(postId);
        db.prepare("UPDATE posts SET active=0, status='cancelled', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?").run(postId);
    })();
    broadcast({ type: 'post_removed', id: postId });
}

export function adminPruneUser(publicKey: string) {
    adminSetUserStatus(publicKey, 'pruned');
    db.transaction(() => {
        db.prepare("UPDATE posts SET status='cancelled', active=0 WHERE author_pubkey=? AND status IN ('active', 'pending')").run(publicKey);
    })();
    broadcast({ type: 'user_pruned', publicKey });
}

export function adminPruneBranch(rootPublicKey: string) {
    const prunings = new Set<string>();
    function pruneRec(pubkey: string) {
        if (prunings.has(pubkey)) return;
        prunings.add(pubkey);
        adminPruneUser(pubkey);
        const children = db.prepare("SELECT public_key FROM members WHERE invited_by=?").all(pubkey) as any[];
        children.forEach(c => pruneRec(c.public_key));
    }
    pruneRec(rootPublicKey);
}

export function adminBroadcastAnnouncement(title: string, body: string, severity: 'info'|'warning'|'critical') {
    broadcast({ type: 'system_announcement', title, body, severity });
}

export function adminSendMessage(targetPubkey: string, body: string) {
    const adminPubkey = getAdminPubkey();
    const conv = createConversation('dm', [adminPubkey, targetPubkey], adminPubkey);
    if (conv) sendMessage(conv.id, adminPubkey, Buffer.from(body, 'utf-8').toString('base64'), 'plaintext-v1');
}

export function migrateAdminConversations() {} // Deprecated, state is clean now.

// ===================== ACTIVITY =====================

export function recordActivity(publicKey: string) {
    db.prepare("UPDATE members SET last_active_at=? WHERE public_key=?").run(new Date().toISOString(), publicKey);
}

// getCommunityHealth, HealthFlag, and CommunityHealth defined above near reports section

// ===================== NODE CONFIG =====================

export function getNodeConfig(): NodeConfig {
    const row = db.prepare("SELECT value FROM node_config WHERE key='node_config'").get() as any;
    const config: any = row ? JSON.parse(row.value) : {};

    let migrated = false;
    if ('publishToDirectory' in config || 'password' in config) {
        migrated = true;
        const pub = config.publishToDirectory !== false;
        config.publishLocation = pub;
        config.publishMembers = pub;
        config.publishContacts = pub;
        config.publishHealth = pub;
        delete config.publishToDirectory;
        delete config.password;
    }

    const finalConfig: NodeConfig = {
        serviceRadius: config.serviceRadius,
        publishLocation: config.publishLocation !== false,
        publishMembers: config.publishMembers !== false,
        publishContacts: config.publishContacts !== false,
        publishHealth: config.publishHealth !== false,
        directoryPushIntervalHours: typeof config.directoryPushIntervalHours === 'number' ? config.directoryPushIntervalHours : 12,
        lastDirectoryPush: config.lastDirectoryPush
    };

    if (migrated) {
        db.prepare(`INSERT INTO node_config (key, value) VALUES ('node_config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(JSON.stringify(finalConfig));
    }

    return finalConfig;
}

export function updateNodeConfig(update: Partial<NodeConfig>): NodeConfig {
    const current = getNodeConfig();
    const next = { ...current, ...update };
    db.prepare(`INSERT INTO node_config (key, value) VALUES ('node_config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(JSON.stringify(next));
    return next;
}

export function getDirectoryInfo(): any {
    const config = getNodeConfig();
    if (!config.publishLocation && !config.publishMembers && !config.publishContacts && !config.publishHealth) {
        return null;
    }
    
    const localConfig = getLocalConfig();
    const info: any = {
        name: localConfig.callsign || process.env.BEANPOOL_NODE_NAME || process.env.CF_RECORD_NAME || 'BeanPool Node'
    };

    if (config.publishLocation) {
        info.serviceRadius = config.serviceRadius;
    } else {
        info.serviceRadius = null;
    }

    if (config.publishMembers) {
        info.memberCount = (db.prepare("SELECT COUNT(*) as c FROM members WHERE status != 'pruned'").get() as any).c;
    } else {
        info.memberCount = null;
    }

    if (config.publishContacts) {
        if (localConfig.communityName) info.name = localConfig.communityName;
        if (localConfig.contactEmail) info.contactEmail = localConfig.contactEmail;
        if (localConfig.contactPhone) info.contactPhone = localConfig.contactPhone;
    } else {
        info.contactEmail = null;
        info.contactPhone = null;
    }

    if (config.publishHealth) {
        info.version = '1.0.33';
        info.status = 'online';
    } else {
        info.version = null;
        info.status = null;
    }

    return info;
}

// ===================== AUDIT EXPORT =====================
export function exportLedgerAudit(): { balancesCsv: string; transactionsCsv: string } {
    const members = getAllMembers();
    const projects = getProjects();
    const commonsBalance = getCommonsBalance();
    
    let balancesCsv = 'Account,Callsign,Balance_Type,Balance\n';
    balancesCsv += `commons,Community Pool,System,${commonsBalance}\n`;
    
    for (const m of members) {
        const bal = getBalance(m.publicKey).balance;
        balancesCsv += `${m.publicKey},${m.callsign},Member,${bal}\n`;
    }
    
    for (const p of projects) {
        if (p.status === 'funded') {
            balancesCsv += `project_${p.id},Project: ${p.title.replace(/,/g, '')},Project_Funded,${p.requestedAmount}\n`;
        }
    }
    
    const pendingTxs = db.prepare("SELECT * FROM marketplace_transactions WHERE status='pending'").all() as any[];
    for (const tx of pendingTxs) {
        const buyer = members.find(m => m.publicKey === tx.buyer_pubkey);
        balancesCsv += `escrow_${tx.id},Escrow (Payer: ${buyer?.callsign || 'Unknown'}),Pending_Trade,${tx.credits}\n`;
    }
    
    let transactionsCsv = 'Timestamp,Transaction_ID,From_Account,To_Account,Amount,Memo\n';
    const txHistory = db.prepare("SELECT * FROM transactions ORDER BY timestamp ASC").all() as any[];
    for (const tx of txHistory) {
         const memoSafe = (tx.memo || '').replace(/,/g, ';').replace(/\n/g, ' ').replace(/\r/g, '');
         transactionsCsv += `${tx.timestamp},${tx.id},${tx.from_pubkey},${tx.to_pubkey},${tx.amount},${memoSafe}\n`;
    }
    
    return { balancesCsv, transactionsCsv };
}

// ===================== COMMUNITY COMMONS =====================

export function createProject(proposerPubkey: string, title: string, description: string, requestedAmount: number): CommunityProject | null {
    const member = getMember(proposerPubkey);
    if (!member || !title.trim() || requestedAmount <= 0) return null;

    const project: CommunityProject = {
        id: crypto.randomUUID(),
        title: title.trim().slice(0, 100),
        description: description.trim().slice(0, 500),
        proposerPubkey, proposerCallsign: member.callsign,
        requestedAmount: Math.round(requestedAmount * 100) / 100,
        status: 'proposed', votes: [], createdAt: new Date().toISOString()
    };
    
    // For simplicity, we store projects as JSON in node_config (since they are rare)
    // Or normally we'd make a table for them. Let's store in config to avoid more schema migrations for now.
    const projects = getAllProjects();
    projects.push(project);
    db.prepare(`INSERT INTO node_config (key, value) VALUES ('commons_projects', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(JSON.stringify(projects));
    
    broadcast({ type: 'project_created', project });
    return project;
}

export function updateProject(proposerPubkey: string, projectId: string, title: string, description: string, requestedAmount: number): boolean {
    if (!title.trim() || requestedAmount <= 0) return false;
    const projects = getAllProjects();
    const index = projects.findIndex(p => p.id === projectId);
    if (index === -1) return false;
    if (projects[index].proposerPubkey !== proposerPubkey) return false;
    if (projects[index].status !== 'proposed') return false;

    projects[index].title = title.trim().slice(0, 100);
    projects[index].description = description.trim().slice(0, 500);
    projects[index].requestedAmount = Math.round(requestedAmount * 100) / 100;
    
    db.prepare(`UPDATE node_config SET value=? WHERE key='commons_projects'`).run(JSON.stringify(projects));
    broadcast({ type: 'project_updated', project: projects[index] });
    return true;
}

export function deleteProject(proposerPubkey: string, projectId: string): boolean {
    const projects = getAllProjects();
    const index = projects.findIndex(p => p.id === projectId);
    if (index === -1) return false;
    if (projects[index].proposerPubkey !== proposerPubkey) return false;
    if (projects[index].status !== 'proposed') return false;

    projects.splice(index, 1);
    db.prepare(`UPDATE node_config SET value=? WHERE key='commons_projects'`).run(JSON.stringify(projects));
    broadcast({ type: 'project_deleted', projectId });
    return true;
}

export function voteForProject(voterPubkey: string, projectId: string, voteCount: number = 1): { success: boolean; creditsUsed?: number; error?: string } {
    if (!getMember(voterPubkey)) return { success: false, error: 'Not a member' };
    if (voteCount < 1 || !Number.isInteger(voteCount)) return { success: false, error: 'Vote count must be a positive integer' };

    const projects = getAllProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) return { success: false, error: 'Project not found' };

    const activeRound = getActiveRound();
    if (!activeRound || !activeRound.projectIds.includes(projectId)) return { success: false, error: 'No active voting round for this project' };

    // QV: Cost = N²
    const creditCost = voteCount * voteCount;

    // Derive governance credits from energyCycled (total beans transacted by this member)
    const credits = getGovernanceCredits(voterPubkey);
    if (creditCost > credits.availableCredits) {
        return { success: false, error: `Insufficient credits: ${voteCount} votes costs ${creditCost} credits, but you have ${credits.availableCredits.toFixed(0)} available` };
    }

    // Remove any existing votes from this voter in this round (they are re-allocating)
    for (const p of projects) {
        if (activeRound.projectIds.includes(p.id)) {
            p.votes = p.votes.filter(v => v.pubkey !== voterPubkey);
        }
    }
    project.votes.push({ pubkey: voterPubkey, weight: voteCount, creditsUsed: creditCost });
    
    db.prepare(`UPDATE node_config SET value=? WHERE key='commons_projects'`).run(JSON.stringify(projects));
    broadcast({ type: 'vote_cast', projectId, voterPubkey, voteCount, creditCost, totalVotes: project.votes.reduce((sum, v) => sum + (v.weight || 1), 0) });
    return { success: true, creditsUsed: creditCost };
}

/**
 * Returns governance credits for a member based on their energyCycled history.
 * Credits = total beans sent (energyCycled). Used credits are the sum of all QV costs in the active round.
 */
export function getGovernanceCredits(pubkey: string): { totalCredits: number; usedCredits: number; availableCredits: number } {
    // Total credits = total amount sent (energy cycled through this member)
    const row = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE from_pubkey = ?`).get(pubkey) as any;
    const totalCredits = Math.round((row?.total || 0) * 100) / 100;

    // Used credits = sum of creditsUsed in the active voting round
    let usedCredits = 0;
    const activeRound = getActiveRound();
    if (activeRound) {
        const projects = getAllProjects();
        for (const p of projects) {
            if (activeRound.projectIds.includes(p.id)) {
                for (const v of p.votes) {
                    if (v.pubkey === pubkey) {
                        usedCredits += v.creditsUsed || (v.weight * v.weight) || 1;
                    }
                }
            }
        }
    }

    return { totalCredits, usedCredits, availableCredits: Math.max(0, totalCredits - usedCredits) };
}

export function createVotingRound(adminPubkey: string, projectIds: string[], closesAt: string): VotingRound | null {
    const admin = getMember(adminPubkey);
    if (!admin || (admin.invitedBy !== 'genesis' && admin.invitedBy !== null && admin.invitedBy !== undefined) || getActiveRound()) return null;

    const projects = getAllProjects();
    for (const pid of projectIds) {
        const p = projects.find(pr => pr.id === pid && pr.status === 'proposed');
        if (p) p.status = 'active';
    }
    db.prepare(`UPDATE node_config SET value=? WHERE key='commons_projects'`).run(JSON.stringify(projects));

    const round: VotingRound = { id: crypto.randomUUID(), status: 'open', closesAt, projectIds, createdBy: adminPubkey, createdAt: new Date().toISOString() };
    const rounds = getVotingRounds();
    rounds.push(round);
    db.prepare(`INSERT INTO node_config (key, value) VALUES ('voting_rounds', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(JSON.stringify(rounds));
    
    broadcast({ type: 'voting_round_created', round });
    return round;
}

export function closeVotingRound(roundId: string): { success: boolean; winner?: CommunityProject; error?: string } {
    const rounds = getVotingRounds();
    const round = rounds.find(r => r.id === roundId && r.status === 'open');
    if (!round) return { success: false, error: 'Round not closed/found' };

    round.status = 'closed';
    db.prepare(`UPDATE node_config SET value=? WHERE key='voting_rounds'`).run(JSON.stringify(rounds));

    const projects = getAllProjects();
    const candidates = projects.filter(p => round.projectIds.includes(p.id)).sort((a, b) => b.votes.length - a.votes.length);
    const winner = candidates[0];

    if (winner && winner.votes.length > 0) {
        if (ledger.deductFromCommons(winner.requestedAmount)) {
            const account = ledger.getAccount(winner.proposerPubkey);
            account.balance += winner.requestedAmount;
            winner.status = 'funded';
            winner.fundedAt = new Date().toISOString();
        } else {
            winner.status = 'proposed';
        }
    }

    for (const c of candidates) if (c.id !== winner?.id && c.status === 'active') c.status = 'proposed';
    db.prepare(`UPDATE node_config SET value=? WHERE key='commons_projects'`).run(JSON.stringify(projects));

    broadcast({ type: 'voting_round_closed', roundId, winnerId: winner?.status === 'funded' ? winner.id : null });
    return { success: true, winner: winner?.status === 'funded' ? winner : undefined };
}

export function adminRejectProject(projectId: string): boolean {
    const projects = getAllProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) return false;
    project.status = 'rejected';
    db.prepare(`UPDATE node_config SET value=? WHERE key='commons_projects'`).run(JSON.stringify(projects));
    return true;
}

export function getProjects(): CommunityProject[] {
    return getAllProjects().filter(p => p.status !== 'rejected');
}

export function getAllProjects(): CommunityProject[] {
    const row = db.prepare("SELECT value FROM node_config WHERE key='commons_projects'").get() as any;
    return row ? JSON.parse(row.value) : [];
}

export function getVotingRounds(): VotingRound[] {
    const row = db.prepare("SELECT value FROM node_config WHERE key='voting_rounds'").get() as any;
    return row ? JSON.parse(row.value) : [];
}

export function getActiveRound(): VotingRound | null {
    const round = getVotingRounds().find(r => r.status === 'open');
    if (!round) return null;

    // Lazy auto-close: if past deadline, close and return null.
    // No background timer needed — any read of the active round triggers closure if overdue.
    if (round.closesAt && new Date(round.closesAt).getTime() <= Date.now()) {
        closeVotingRound(round.id);
        return null;
    }
    return round;
}

export function getCommonsBalance(): number {
    return Math.round(COMMONS_BALANCE * 100) / 100;
}

/**
 * Persist the in-memory COMMONS_BALANCE to SQLite so it survives restarts.
 * Called periodically (every 5 min) and after significant balance events.
 */
export function persistCommonsBalance(): void {
    const rounded = Math.round(COMMONS_BALANCE * 100) / 100;
    db.prepare("INSERT OR REPLACE INTO accounts (public_key, balance, last_demurrage_epoch) VALUES ('COMMONS_POOL', ?, 0)").run(rounded);
}

// ===================== PUSH NOTIFICATIONS =====================

export function registerPushToken(publicKey: string, token: string, platform: string = 'ios'): boolean {
    try {
        db.prepare(`INSERT OR REPLACE INTO push_tokens (public_key, token, platform) VALUES (?, ?, ?)`).run(publicKey, token, platform);
        console.log(`[Push] Registered token for ${publicKey.slice(0, 8)}: ${token.slice(0, 20)}...`);
        return true;
    } catch (e) {
        console.error('[Push] Failed to register token:', e);
        return false;
    }
}

export function removePushToken(publicKey: string, token?: string): boolean {
    try {
        if (token) {
            db.prepare(`DELETE FROM push_tokens WHERE public_key = ? AND token = ?`).run(publicKey, token);
        } else {
            // Remove all tokens for this user (logout from all devices)
            db.prepare(`DELETE FROM push_tokens WHERE public_key = ?`).run(publicKey);
        }
        console.log(`[Push] Removed token(s) for ${publicKey.slice(0, 8)}`);
        return true;
    } catch (e) {
        console.error('[Push] Failed to remove token:', e);
        return false;
    }
}

export function getPushTokens(publicKey: string): { token: string; platform: string }[] {
    return (db.prepare(`SELECT token, platform FROM push_tokens WHERE public_key = ?`).all(publicKey) as any[]);
}

// ===================== MEMBER PREFERENCES =====================

export function getMemberPreference(publicKey: string, prefKey: string): string {
    const row = db.prepare(`SELECT pref_value FROM member_preferences WHERE public_key = ? AND pref_key = ?`).get(publicKey, prefKey) as any;
    return row?.pref_value ?? 'true'; // Default to 'true' (enabled)
}

export function getMemberPreferences(publicKey: string): Record<string, string> {
    const rows = db.prepare(`SELECT pref_key, pref_value FROM member_preferences WHERE public_key = ?`).all(publicKey) as any[];
    const prefs: Record<string, string> = {
        notify_chat: 'true',
        notify_marketplace: 'true',
        notify_escrow: 'true',
    };
    for (const r of rows) prefs[r.pref_key] = r.pref_value;
    return prefs;
}

export function setMemberPreferences(publicKey: string, preferences: Record<string, boolean>): boolean {
    try {
        const stmt = db.prepare(`INSERT OR REPLACE INTO member_preferences (public_key, pref_key, pref_value) VALUES (?, ?, ?)`);
        const tx = db.transaction(() => {
            for (const [key, value] of Object.entries(preferences)) {
                stmt.run(publicKey, key, String(value));
            }
        });
        tx();
        console.log(`[Prefs] Updated preferences for ${publicKey.slice(0, 8)}:`, preferences);
        return true;
    } catch (e) {
        console.error('[Prefs] Failed to set preferences:', e);
        return false;
    }
}

// ===================== GENERIC PUSH DISPATCHER =====================

/**
 * Generic push notification dispatcher with category-based preference gating,
 * app icon badge counts, iOS threadId grouping, and Android channelId routing.
 * Fire-and-forget pattern.
 */
export function dispatchPushNotification(
    targetPubkeys: string[],
    actorPubkey: string,
    title: string,
    body: string,
    data: Record<string, any>,
    categoryId: 'chat' | 'marketplace' | 'escrow'
): void {
    // Filter out the actor and SYSTEM from targets
    const recipients = targetPubkeys.filter(pk => pk !== actorPubkey && pk !== 'SYSTEM');
    if (recipients.length === 0) return;

    const prefKey = `notify_${categoryId}`;
    
    // Map categoryId to Android channelId
    const channelMap: Record<string, string> = {
        chat: 'chat',
        marketplace: 'marketplace',
        escrow: 'escrow',
    };

    // Map categoryId to notification sound
    const soundMap: Record<string, string> = {
        chat: 'default',      // Softer sound for chat (uses system default for now)
        marketplace: 'default',
        escrow: 'default',
    };

    const allMessages: any[] = [];

    for (const pk of recipients) {
        // Check user's notification preference for this category
        const pref = getMemberPreference(pk, prefKey);
        if (pref === 'false') {
            console.log(`[Push] Skipped ${pk.slice(0, 8)} — ${prefKey} disabled`);
            continue;
        }

        const tokens = getPushTokens(pk);
        if (tokens.length === 0) continue;

        // Calculate total unread count for badge
        const unreadCounts = getUnreadCounts(pk);
        const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

        for (const { token, platform } of tokens) {
            const msg: any = {
                to: token,
                sound: soundMap[categoryId] || 'default',
                title,
                body,
                data,
                badge: totalUnread,
                categoryId,
            };

            // iOS: threadId for notification grouping on lock screen
            if (platform === 'ios' && data.conversationId) {
                msg._contentAvailable = true;
            }

            // Android: route to the correct notification channel
            if (platform === 'android') {
                msg.channelId = channelMap[categoryId] || 'default';
            }

            allMessages.push(msg);
        }
    }

    if (allMessages.length === 0) return;

    // Batch send to Expo (max 100 per request)
    const batches: typeof allMessages[] = [];
    for (let i = 0; i < allMessages.length; i += 100) {
        batches.push(allMessages.slice(i, i + 100));
    }

    for (const batch of batches) {
        fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
        }).then(res => {
            if (!res.ok) console.warn(`[Push] Expo API returned ${res.status}`);
            else console.log(`[Push] Sent ${batch.length} notification(s) for category=${categoryId}`);
        }).catch(err => {
            console.warn('[Push] Failed to send push notification:', err.message);
        });
    }
}

/**
 * Dispatches Expo Push Notifications for Escrow lifecycle events.
 * Delegates to the generic dispatchPushNotification with categoryId='escrow'.
 */
export function sendPushNotification(postId: string, type: SystemMessageType, meta: SystemMessageMetadata, participantPubkeys: string[]) {
    // Build notification payload based on event type
    const post = db.prepare("SELECT title FROM posts WHERE id = ?").get(postId) as any;
    const postTitle = post?.title || 'a post';
    const actorMember = meta.actorPubkey ? (getMember(meta.actorPubkey) as any) : null;
    const actorName = actorMember?.callsign || meta.actorPubkey?.slice(0, 8) || 'Someone';

    const notificationMap: Record<SystemMessageType, { title: string; body: string; data: any }> = {
        [SystemMessageType.ESCROW_CREATED]: {
            title: '🔒 Escrow Initialized',
            body: `An escrow has been created for "${postTitle}"`,
            data: { screen: 'post', postId }
        },
        [SystemMessageType.ESCROW_FUNDED]: {
            title: '🔒 Credits Locked in Escrow',
            body: `Ʀ${meta.amount} placed in escrow for "${postTitle}"`,
            data: { screen: 'post', postId }
        },
        [SystemMessageType.ESCROW_RELEASED]: {
            title: '✅ Credits Released!',
            body: `Payment of Ʀ${meta.amount} released for "${postTitle}"`,
            data: { screen: 'post', postId }
        },
        [SystemMessageType.ESCROW_CANCELLED]: {
            title: '❌ Escrow Cancelled',
            body: `Escrow cancelled for "${postTitle}". Funds refunded.`,
            data: { screen: 'post', postId }
        },
        [SystemMessageType.DISPUTE_OPENED]: {
            title: '⚠️ Dispute Opened',
            body: `A dispute has been opened for "${postTitle}"`,
            data: { screen: 'post', postId }
        },
        [SystemMessageType.REVIEW_LEFT]: {
            title: '⭐ New Review',
            body: `${actorName} left a review on "${postTitle}"`,
            data: { screen: 'post', postId }
        }
    };

    const notification = notificationMap[type];
    if (!notification) return;

    dispatchPushNotification(
        participantPubkeys,
        meta.actorPubkey,
        notification.title,
        notification.body,
        notification.data,
        'escrow'
    );
}
