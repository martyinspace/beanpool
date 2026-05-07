import crypto from 'node:crypto';
import { LedgerManager, COMMONS_BALANCE, calculateDynamicFloor, getTier, getGenesisEarnedCredit, PROTOCOL_CONSTANTS } from '@beanpool/core';
import type { TrustStats, TierInfo, GenesisInviteType } from '@beanpool/core';
import { getThresholds, getLocalConfig } from './local-config.js';
import { db, initSchema, migrateLegacyState } from './db/db.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
    lastActiveAt?: string;
    status?: 'active' | 'disabled' | 'pruned';
}

export interface Conversation {
    id: string;
    type: 'dm' | 'group';
    postId?: string;
    postTitle?: string;
    postStatus?: string;
    lastMsgType?: string;
    lastSysType?: string;
    name: string | null;
    participants: string[];
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

export interface CommunityProject {
    id: string;
    title: string;
    description: string;
    proposerPubkey: string;
    proposerCallsign: string;
    requestedAmount: number;
    status: 'proposed' | 'active' | 'funded' | 'rejected' | 'completed';
    votes: { pubkey: string; weight: 1 }[];
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

let ledger = new LedgerManager();
let wsClients: Set<any> = new Set();

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

    // One-time migration: move escrow funds from old post-keyed wallets to transaction-keyed wallets
    migrateEscrowWalletKeys();

    // FTS5: Backfill search keywords for existing posts that don't have them
    backfillSearchKeywords();

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

function broadcast(event: any): void {
    const msg = JSON.stringify(event);
    for (const ws of wsClients) {
        try { ws.send(msg); } catch { wsClients.delete(ws); }
    }
}

// ===================== DB HELPERS =====================

function rowToMember(row: any): Member {
    if (!row) return row;
    return {
        publicKey: row.public_key,
        callsign: row.callsign,
        joinedAt: row.joined_at,
        invitedBy: row.invited_by,
        inviteCode: row.invite_code,
        homeNodeUrl: row.home_node_url
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
        lastActiveAt: row.last_active_at
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
    const existing = db.prepare("SELECT * FROM members WHERE public_key = ?").get(publicKey) as any;
    if (existing) {
        db.prepare("UPDATE members SET callsign = ? WHERE public_key = ?").run(callsign, publicKey);
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
    function buildSubtree(parentPubkey: string): InviteTreeNode[] {
        return allMembers
            .filter(m => m.invitedBy === parentPubkey && m.publicKey !== parentPubkey)
            .map(m => ({
                publicKey: m.publicKey, callsign: m.callsign, joinedAt: m.joinedAt, inviteCode: m.inviteCode,
                children: buildSubtree(m.publicKey),
            }));
    }

    if (rootPubkey) {
        return buildSubtree(rootPubkey);
    }

    return allMembers
        .filter(m => (m.invitedBy === 'genesis' || m.publicKey === 'genesis') && m.publicKey !== 'SYSTEM' && !m.publicKey.startsWith('escrow_'))
        .map(m => ({
            publicKey: m.publicKey, callsign: m.callsign, joinedAt: m.joinedAt, inviteCode: m.inviteCode,
            children: buildSubtree(m.publicKey),
        }));
}

// ===================== PROFILES =====================

export function updateProfile(publicKey: string, update: {
    avatar?: string | null;
    bio?: string;
    contact?: { value: string; visibility: 'hidden' | 'trade_partners' | 'community' | 'friends' } | null;
}): MemberProfile | null {
    if (!getMember(publicKey)) return null;
    recordActivity(publicKey);
    
    const existing = db.prepare("SELECT * FROM members WHERE public_key = ?").get(publicKey) as any;
    const avatar = update.avatar !== undefined ? update.avatar : existing.avatar_url;
    const bio = update.bio !== undefined ? update.bio.slice(0, 200) : existing.bio;
    let contact_value = existing.contact_value;
    let contact_visibility = existing.contact_visibility;
    if (update.contact !== undefined) {
        contact_value = update.contact?.value || null;
        contact_visibility = update.contact?.visibility || null;
    }

    db.prepare(`UPDATE members SET avatar_url=?, bio=?, contact_value=?, contact_visibility=? WHERE public_key=?`)
      .run(avatar, bio, contact_value, contact_visibility, publicKey);
      
    broadcast({ type: 'profile_updated', publicKey });
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

export function getBalance(publicKey: string): { balance: number; floor: number; tier: TierInfo; commonsBalance: number } {
    const account = ledger.getAccount(publicKey);
    const { floor, tier } = getMemberTrustProfile(publicKey);
    return {
        balance: Math.round(account.balance * 100) / 100,
        floor,

        tier,
        commonsBalance: Math.round(COMMONS_BALANCE * 100) / 100,
    };
}

export function transfer(from: string, to: string, amount: number, memo: string, method?: 'direct' | 'escrow'): Transaction | null {
    if (amount <= 0) return null;
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
    db.prepare(`INSERT INTO transactions (id, from_pubkey, to_pubkey, amount, memo, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run(txn.id, txn.from, txn.to, txn.amount, txn.memo, txn.timestamp);

    // Sync ledger account balances to DB
    const fromAcc = ledger.getAccount(from);
    const toAcc = ledger.getAccount(to);
    db.prepare(`UPDATE accounts SET balance=?, last_demurrage_epoch=?, last_updated_at=? WHERE public_key=?`).run(fromAcc.balance, fromAcc.lastDemurrageEpoch, new Date().toISOString(), from);
    db.prepare(`UPDATE accounts SET balance=?, last_demurrage_epoch=?, last_updated_at=? WHERE public_key=?`).run(toAcc.balance, toAcc.lastDemurrageEpoch, new Date().toISOString(), to);

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

function rowToPost(row: any, photos: any[]): MarketplacePost {
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
        photos: photos.filter((p: any) => p.post_id === row.id).sort((a: any, b: any) => a.order_num - b.order_num).map((p: any) => p.photo_data),
        originNode: row.origin_node,
        authorEnergyCycled: row.author_energy_cycled ?? 0
    };
}

export function createPost(
    type: 'offer' | 'need', category: string, title: string, description: string, credits: number,
    priceType: 'fixed' | 'hourly' | 'daily' | 'weekly' | 'monthly' | string, authorPublicKey: string, lat?: number, lng?: number, photos?: string[], repeatable?: boolean, id?: string
): MarketplacePost | null {
    if (!getMember(authorPublicKey)) {
        return null;
    }

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

export function getPosts(filter?: { id?: string; type?: string; category?: string; status?: string; offset?: number; limit?: number; updatedAfter?: string; query?: string }): MarketplacePost[] {
    let query = `
        SELECT p.*, m.callsign as author_callsign, a.callsign as accepted_callsign,
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

    return rows.map(r => rowToPost(r, photos));
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

    return rows.map(r => {
        const coverImageRow = photos.find(p => p.post_id === r.post_id && p.order_num === 0) || photos.find(p => p.post_id === r.post_id);
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

    return rows.map(r => {
        const parts = db.prepare("SELECT public_key FROM conversation_participants WHERE conversation_id=?").all(r.id) as any[];
        return { 
            id: r.id, 
            type: r.type, 
            postId: r.post_id, 
            postTitle: r.post_title,
            postStatus: r.post_status,
            lastMsgType: r.last_msg_type,
            lastSysType: r.last_sys_type,
            name: r.name, 
            createdBy: r.created_by, 
            createdAt: r.created_at, 
            participants: parts.map(p => p.public_key) 
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

export interface SyncPayload { stateHash: string; members: Member[]; posts: MarketplacePost[]; nodeId: string; }

export function getStateHash(): string {
    const pKeys = db.prepare("SELECT public_key FROM members ORDER BY public_key").all() as any[];
    const pIds = db.prepare("SELECT id FROM posts WHERE active=1 ORDER BY id").all() as any[];
    const data = JSON.stringify({ m: pKeys.map(k => k.public_key), p: pIds.map(i => i.id) });
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

export function exportSyncState(nodeId: string): SyncPayload {
    return { stateHash: getStateHash(), nodeId, members: getAllMembers(), posts: getPosts() };
}

export function importRemoteState(remote: SyncPayload): { newMembers: number; newPosts: number } {
    let newMembers = 0, newPosts = 0;
    
    db.transaction(() => {
        for (const rm of remote.members) {
            const exists = db.prepare("SELECT 1 FROM members WHERE public_key=?").get(rm.publicKey);
            if (!exists) {
                db.prepare(`INSERT INTO members (public_key, callsign, joined_at, invited_by, invite_code, home_node_url) VALUES (?, ?, ?, ?, ?, ?)`).run(rm.publicKey, rm.callsign, rm.joinedAt, rm.invitedBy, rm.inviteCode, rm.homeNodeUrl || null);
                db.prepare(`INSERT INTO accounts (public_key, balance, last_demurrage_epoch) VALUES (?, 0, 0)`).run(rm.publicKey);
                newMembers++;
            }
        }
        for (const rp of remote.posts) {
            const exists = db.prepare("SELECT 1 FROM posts WHERE id=?").get(rp.id);
            if (!exists) {
                db.prepare(`INSERT INTO posts (id, type, category, title, description, credits, author_pubkey, created_at, active, status, repeatable, lat, lng, origin_node) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(rp.id, rp.type, rp.category, rp.title, rp.description, rp.credits, rp.authorPublicKey, rp.createdAt, rp.active ? 1 : 0, rp.status, rp.repeatable ? 1 : 0, rp.lat ?? null, rp.lng ?? null, rp.originNode || remote.nodeId);
                newPosts++;
            }
        }
    })();

    if (newMembers > 0 || newPosts > 0) {
        broadcast({ type: 'state_synced', newMembers, newPosts, from: remote.nodeId });
    }
    return { newMembers, newPosts };
}
// ===================== RATINGS =====================

export function addRating(raterPubkey: string, targetPubkey: string, stars: number, comment: string, transactionId: string): Rating | null {
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
    return res.changes > 0;
}

export function setGuardian(ownerPubkey: string, friendPubkey: string, isGuardian: boolean): boolean {
    const res = db.prepare("UPDATE friends SET is_guardian=? WHERE owner_pubkey=? AND friend_pubkey=?").run(isGuardian ? 1 : 0, ownerPubkey, friendPubkey);
    return res.changes > 0;
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

export interface HealthFlag { type: 'wash_trading' | 'isolated_branch' | 'inactive_member' | 'invite_spam'; severity: 'warning' | 'alert'; description: string; members: string[]; }
export interface CommunityHealth { nodeName: string; currency: { type: string; value: string }; tree: any; activity: any; flags: HealthFlag[]; reportCount: number; }

export function getCommunityHealth(): CommunityHealth {
    const now = Date.now();
    const t = getThresholds();
    
    // Active member count
    const activeMemberCount = (db.prepare(`SELECT COUNT(DISTINCT m.public_key) as c FROM members m JOIN transactions tx ON tx.timestamp > datetime('now', '-30 days') AND (m.public_key = tx.from_pubkey OR m.public_key = tx.to_pubkey) WHERE m.status != 'pruned'`).get() as any).c;
    const totalMembers = getMembers().length;
    
    // ========== HEALTH FLAG DETECTION ==========
    const flags: HealthFlag[] = [];
    
    // 1. Inactive Members: no transactions in N days
    try {
        const inactiveRows = db.prepare(`
            SELECT m.public_key, m.callsign FROM members m 
            WHERE m.status = 'active' AND m.invited_by != 'genesis'
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
                members: inactiveRows.map(r => r.callsign || r.public_key.substring(0, 8))
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
                        members: [callsignA, callsignB]
                    });
                }
            }
        }
    } catch (e) { console.error('Health flag check (wash trading) failed:', e); }
    
    const config = getLocalConfig();
    const reportCount = getReportCount();
    
    return {
        nodeName: getDirectoryInfo()?.name || 'Local Discovery',
        currency: { type: config.currencyType || 'image', value: config.currencyValue || 'bean' },
        tree: { totalMembers, maxDepth: 0, widestBranch: { callsign: 'db-optimized', children: 0 }, avgBranchSize: 0 },
        activity: {
            totalTransactions: (db.prepare(`SELECT COUNT(*) as c FROM transactions`).get() as any).c,
            last7Days: (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE timestamp > datetime('now', '-7 days')`).get() as any).c,
            last30Days: (db.prepare(`SELECT COUNT(*) as c FROM transactions WHERE timestamp > datetime('now', '-30 days')`).get() as any).c,
            activeMemberCount,
            inactiveMemberCount: totalMembers - activeMemberCount,
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
    let config: any = row ? JSON.parse(row.value) : {};

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

export function voteForProject(voterPubkey: string, projectId: string): { success: boolean; error?: string } {
    if (!getMember(voterPubkey)) return { success: false, error: 'Not a member' };

    const projects = getAllProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) return { success: false, error: 'Project not found' };

    const activeRound = getActiveRound();
    if (!activeRound || !activeRound.projectIds.includes(projectId)) return { success: false, error: 'No active voting round for this project' };

    for (const p of projects) {
        if (activeRound.projectIds.includes(p.id)) {
            p.votes = p.votes.filter(v => v.pubkey !== voterPubkey);
        }
    }
    project.votes.push({ pubkey: voterPubkey, weight: 1 });
    
    db.prepare(`UPDATE node_config SET value=? WHERE key='commons_projects'`).run(JSON.stringify(projects));
    broadcast({ type: 'vote_cast', projectId, voterPubkey, totalVotes: project.votes.length });
    return { success: true };
}

export function createVotingRound(adminPubkey: string, projectIds: string[], closesAt: string): VotingRound | null {
    const admin = getMember(adminPubkey);
    if (!admin || admin.invitedBy !== 'genesis' || getActiveRound()) return null;

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
    return getVotingRounds().find(r => r.status === 'open') || null;
}

export function getCommonsBalance(): number {
    return Math.round(COMMONS_BALANCE * 100) / 100;
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
