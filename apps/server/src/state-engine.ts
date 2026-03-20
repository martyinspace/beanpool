/**
 * State Engine — In-Memory Ledger + Marketplace + Member Registry
 *
 * Wraps @beanpool/core's LedgerManager with:
 *  - Member registry (pubkey → callsign mapping)
 *  - Marketplace posts (needs & offers)
 *  - Transaction log
 *  - JSON disk persistence (auto-saves on mutation)
 *  - WebSocket broadcast on state changes
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LedgerManager, COMMONS_BALANCE } from '@beanpool/core';
import { getThresholds } from './local-config.js';

const DATA_DIR = process.env.BEANPOOL_DATA_DIR || path.join(process.cwd(), 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

// ===================== TYPES =====================

export interface Member {
    publicKey: string;
    callsign: string;
    joinedAt: string;
    invitedBy: string;      // pubkey of inviter ('genesis' for node admin)
    inviteCode: string;     // the specific invite code used to join
    homeNodeUrl?: string;   // for federation visitors: their home node URL
}

export interface InviteCode {
    code: string;           // short shareable code like "BP-7k3x-9m2w"
    createdBy: string;      // inviter's publicKey
    createdAt: string;
    usedBy: string | null;  // null = unused, pubkey = claimed
    usedAt: string | null;
    intendedFor?: string;   // optionally tracking who this invite was generated for
}

export interface MarketplacePost {
    id: string;
    type: 'offer' | 'need';
    category: string;
    title: string;
    description: string;
    credits: number;
    authorPublicKey: string;
    authorCallsign: string;
    createdAt: string;
    active: boolean;
    status: 'active' | 'pending' | 'paused' | 'completed' | 'cancelled';
    repeatable: boolean;          // true = ongoing service, stays active after accept
    acceptedBy?: string;          // publicKey of acceptor (one-time posts only)
    acceptedAt?: string;
    completedAt?: string;
    lat?: number;
    lng?: number;
    photos?: string[];            // up to 3 base64 data URLs
    originNode?: string;          // ID of the node where this post was created
}

export interface MarketplaceTransaction {
    id: string;
    postId: string;
    postTitle: string;
    buyerPublicKey: string;       // the person who clicked 'Accept'
    buyerCallsign: string;
    sellerPublicKey: string;      // the post author
    sellerCallsign: string;
    credits: number;
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
    avatar: string | null;       // base64 thumbnail (max ~50KB)
    bio: string;
    contact: {
        value: string;           // phone, email, WhatsApp handle
        visibility: 'hidden' | 'trade_partners' | 'community';
    } | null;
    lastActiveAt?: string;
    status?: 'active' | 'disabled';
}

export interface Conversation {
    id: string;
    type: 'dm' | 'group';
    name: string | null;             // null for DMs, "Node Operators" for groups
    participants: string[];          // pubkeys
    createdBy: string;
    createdAt: string;
}

export interface Message {
    id: string;
    conversationId: string;
    authorPubkey: string;
    ciphertext: string;              // E2E encrypted content (opaque to server)
    nonce: string;                   // unique per message
    timestamp: string;
}

export interface Rating {
    id: string;
    targetPubkey: string;       // who is being rated
    raterPubkey: string;        // who left the rating
    stars: number;              // 1-5
    comment: string;
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

interface PersistedState {
    members: Member[];
    posts: MarketplacePost[];
    transactions: Transaction[];
    marketplaceTransactions: MarketplaceTransaction[];
    inviteCodes: InviteCode[];
    profiles: Record<string, MemberProfile>;
    conversations: Conversation[];
    messages: Message[];
    ledgerAccounts: { id: string; balance: number; lastDemurrageEpoch: number }[];
    ratings: Rating[];
    reports: AbuseReport[];
    friends: Record<string, FriendEntry[]>;
}

// ===================== STATE =====================

let ledger = new LedgerManager();
let members: Member[] = [];
let posts: MarketplacePost[] = [];
let transactions: Transaction[] = [];
let marketplaceTransactions: MarketplaceTransaction[] = [];
let inviteCodes: InviteCode[] = [];
let profiles: Record<string, MemberProfile> = {};
let conversations: Conversation[] = [];
let messages: Message[] = [];
let ratings: Rating[] = [];
let reports: AbuseReport[] = [];
let friends: Record<string, FriendEntry[]> = {};
let wsClients: Set<any> = new Set();

// ===================== INIT =====================

export function initStateEngine(): void {
    // Load from disk if state file exists
    if (fs.existsSync(STATE_PATH)) {
        try {
            const raw = fs.readFileSync(STATE_PATH, 'utf-8');
            const saved: PersistedState = JSON.parse(raw);
            members = saved.members || [];
            posts = saved.posts || [];
            transactions = saved.transactions || [];
            marketplaceTransactions = (saved as any).marketplaceTransactions || [];
            inviteCodes = saved.inviteCodes || [];
            profiles = saved.profiles || {};
            conversations = (saved as any).conversations || [];
            messages = (saved as any).messages || [];
            ratings = (saved as any).ratings || [];
            reports = (saved as any).reports || [];
            friends = (saved as any).friends || [];
            // Migrate legacy posts without status/repeatable fields
            for (const p of posts) {
                if (!p.status) p.status = p.active ? 'active' : 'cancelled';
                if (p.repeatable === undefined) p.repeatable = false;
            }
            // Migrate legacy members without invitedBy field
            for (const m of members) {
                if (!m.invitedBy) m.invitedBy = 'genesis';
                if (!m.inviteCode) m.inviteCode = 'legacy';
            }
            if (saved.ledgerAccounts?.length) {
                ledger.loadState(saved.ledgerAccounts);
            }
            console.log(`📒 Loaded state: ${members.length} members, ${posts.length} posts, ${Object.keys(profiles).length} profiles`);
        } catch (e: any) {
            console.warn(`⚠️  Failed to load state.json:`, e.message);
        }
    } else {
        console.log('📒 No state file — starting fresh');
    }
}

function saveState(): void {
    const state: PersistedState = {
        members,
        posts,
        transactions: transactions.slice(-1000),
        marketplaceTransactions: marketplaceTransactions.slice(-5000),
        inviteCodes: inviteCodes.slice(-5000),
        profiles,
        conversations,
        messages: messages.slice(-10000),
        ledgerAccounts: ledger.getAllAccounts(),
        ratings,
        reports,
        friends,
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ===================== WEBSOCKET =====================

export function addWsClient(ws: any): void {
    wsClients.add(ws);
    // Send current state snapshot on connect
    try {
        ws.send(JSON.stringify({
            type: 'state_snapshot',
            memberCount: members.length,
            postCount: posts.length,
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

// ===================== MEMBERS =====================

/**
 * Seed the node admin as the genesis member (first boot only).
 * Call this from index.ts after initStateEngine().
 */
export function seedGenesisMember(adminPublicKey: string, callsign: string): Member {
    const existing = members.find(m => m.publicKey === adminPublicKey);
    if (existing) {
        existing.invitedBy = 'genesis';
        existing.inviteCode = 'genesis';
        saveState();
        return existing;
    }
    const member: Member = {
        publicKey: adminPublicKey,
        callsign,
        joinedAt: new Date().toISOString(),
        invitedBy: 'genesis',
        inviteCode: 'genesis',
    };
    members.push(member);
    ledger.initializeGenesisAccount(adminPublicKey);
    saveState();
    console.log(`👑 Genesis member seeded: ${callsign}`);
    return member;
}

/**
 * Register a member (internal). Use redeemInvite() for public-facing registration.
 */
function registerMemberInternal(publicKey: string, callsign: string, invitedBy: string, inviteCode: string): Member | null {
    if (members.find(m => m.publicKey === publicKey)) {
        const existing = members.find(m => m.publicKey === publicKey)!;
        existing.callsign = callsign;
        saveState();
        return existing;
    }

    const member: Member = {
        publicKey,
        callsign,
        joinedAt: new Date().toISOString(),
        invitedBy,
        inviteCode,
    };
    members.push(member);
    ledger.initializeGenesisAccount(publicKey);
    saveState();
    broadcast({ type: 'member_joined', member });
    console.log(`👤 New member: ${callsign} invited by ${invitedBy.substring(0, 12)}...`);
    return member;
}

// Keep backward-compatible registerMember for anonymous posts
export function registerMember(publicKey: string, callsign: string): Member | null {
    return registerMemberInternal(publicKey, callsign, 'genesis', 'legacy');
}

/**
 * Auto-register a visitor from a peer node for federation trading.
 * Visitors get a minimal member entry so the ledger can track their balance.
 * Their mutual credit starts at 0 and can go negative (down to -100Ʀ).
 */
export function registerVisitor(publicKey: string, callsign?: string, homeNodeUrl?: string): void {
    const existing = members.find(m => m.publicKey === publicKey);
    if (existing) {
        let changed = false;
        // Update callsign if a better one is provided and current is auto-generated
        if (callsign && existing.callsign.startsWith('Visitor-')) {
            existing.callsign = callsign;
            changed = true;
        }
        // Update homeNodeUrl if provided and not already set
        if (homeNodeUrl && !existing.homeNodeUrl) {
            existing.homeNodeUrl = homeNodeUrl;
            changed = true;
        }
        if (changed) saveState();
        return;
    }
    const member: Member = {
        publicKey,
        callsign: callsign || `Visitor-${publicKey.substring(0, 8)}`,
        joinedAt: new Date().toISOString(),
        invitedBy: 'federation',
        inviteCode: 'visitor',
        homeNodeUrl: homeNodeUrl || undefined,
    };
    members.push(member);
    ledger.initializeGenesisAccount(publicKey);
    saveState();
    console.log(`🌐 Visitor registered: ${member.callsign} (federation${homeNodeUrl ? ` from ${homeNodeUrl}` : ''})`);
}

export function getMembers(): Member[] {
    return members;
}

export function getMember(publicKey: string): Member | undefined {
    return members.find(m => m.publicKey === publicKey);
}

// ===================== INVITE CODES =====================

function generateShortCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusing chars
    let code = 'BP-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    code += '-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

export function generateInvite(inviterPubkey: string, intendedFor?: string): InviteCode | null {
    // Only registered members can generate invites
    if (!members.find(m => m.publicKey === inviterPubkey)) return null;

    const invite: InviteCode = {
        code: generateShortCode(),
        createdBy: inviterPubkey,
        createdAt: new Date().toISOString(),
        usedBy: null,
        usedAt: null,
        intendedFor,
    };
    inviteCodes.push(invite);
    saveState();
    const inviter = getMember(inviterPubkey);
    console.log(`🎟️  Invite generated: ${invite.code} by ${inviter?.callsign || inviterPubkey.substring(0, 12)}`);
    return invite;
}

export function redeemInvite(code: string, publicKey: string, callsign: string): { success: boolean; error?: string; member?: Member } {
    const invite = inviteCodes.find(i => i.code.toUpperCase() === code.toUpperCase());
    if (!invite) return { success: false, error: 'Invalid invite code' };
    if (invite.usedBy) return { success: false, error: 'This invite has already been used' };

    // Check if pubkey is already registered
    const existing = members.find(m => m.publicKey === publicKey);
    if (existing) return { success: false, error: 'You are already a member' };

    // Mark invite as used
    invite.usedBy = publicKey;
    invite.usedAt = new Date().toISOString();

    // Register the new member under the inviter's branch
    const member = registerMemberInternal(publicKey, callsign, invite.createdBy, code);
    if (!member) return { success: false, error: 'Registration failed' };

    return { success: true, member };
}

export function getInvitesByMember(pubkey: string): InviteCode[] {
    return inviteCodes.filter(i => i.createdBy === pubkey);
}

export interface InviteTreeNode {
    publicKey: string;
    callsign: string;
    joinedAt: string;
    inviteCode: string;
    children: InviteTreeNode[];
}

export function getInviteTree(rootPubkey?: string): InviteTreeNode[] {
    // Build tree from members list using invitedBy pointers
    function buildSubtree(parentPubkey: string): InviteTreeNode[] {
        return members
            .filter(m => m.invitedBy === parentPubkey && m.publicKey !== parentPubkey)
            .map(m => ({
                publicKey: m.publicKey,
                callsign: m.callsign,
                joinedAt: m.joinedAt,
                inviteCode: m.inviteCode,
                children: buildSubtree(m.publicKey),
            }));
    }

    if (rootPubkey) {
        // Find the root member to get their basic details if we want them as the top node,
        // or just return their children if the UI expects an array of top-level children.
        // Returning the children of the root to match previous behavior for genesis
        return buildSubtree(rootPubkey);
    }

    // Default to full tree (members invited by 'genesis' and genesis itself)
    return members
        .filter(m => m.invitedBy === 'genesis' || m.publicKey === 'genesis')
        .map(m => ({
            publicKey: m.publicKey,
            callsign: m.callsign,
            joinedAt: m.joinedAt,
            inviteCode: m.inviteCode,
            children: buildSubtree(m.publicKey),
        }));
}

// ===================== PROFILES =====================

export function updateProfile(publicKey: string, update: {
    avatar?: string | null;
    bio?: string;
    contact?: { value: string; visibility: 'hidden' | 'trade_partners' | 'community' } | null;
}): MemberProfile | null {
    if (!members.find(m => m.publicKey === publicKey)) return null;

    const existing = profiles[publicKey] || {
        publicKey,
        avatar: null,
        bio: '',
        contact: null,
    };

    if (update.avatar !== undefined) existing.avatar = update.avatar;
    if (update.bio !== undefined) existing.bio = update.bio.slice(0, 200);
    if (update.contact !== undefined) existing.contact = update.contact;

    profiles[publicKey] = existing;
    saveState();
    broadcast({ type: 'profile_updated', publicKey });
    console.log(`📝 Profile updated: ${getMember(publicKey)?.callsign || publicKey.substring(0, 12)}`);
    return existing;
}

export function getProfile(publicKey: string, requesterPubkey?: string): MemberProfile | null {
    const profile = profiles[publicKey];
    if (!profile) {
        // Return shell profile for members without one
        const member = members.find(m => m.publicKey === publicKey);
        if (!member) return null;
        return { publicKey, avatar: null, bio: '', contact: null };
    }

    // Filter contact visibility
    if (profile.contact) {
        if (profile.contact.visibility === 'hidden' && requesterPubkey !== publicKey) {
            return { ...profile, contact: null };
        }
        // 'trade_partners' filtering will be handled when trade system exists
        // For now, treat 'trade_partners' same as 'community' (visible)
    }
    return profile;
}

export function getProfiles(): Record<string, MemberProfile> {
    // Return profiles with contact info filtered (hidden contacts removed)
    const filtered: Record<string, MemberProfile> = {};
    for (const [key, profile] of Object.entries(profiles)) {
        filtered[key] = {
            ...profile,
            contact: profile.contact?.visibility === 'community' ? profile.contact : null,
        };
    }
    return filtered;
}

// ===================== LEDGER =====================

export function getBalance(publicKey: string): { balance: number; floor: number; commonsBalance: number } {
    const account = ledger.getAccount(publicKey);
    const t = getThresholds();
    return {
        balance: Math.round(account.balance * 100) / 100,
        floor: t.creditFloor,
        commonsBalance: Math.round(COMMONS_BALANCE * 100) / 100,
    };
}

export function transfer(from: string, to: string, amount: number, memo: string): Transaction | null {
    if (amount <= 0) return null;

    // Auto-register unknown publicKeys as visitors (federation support)
    // This allows cross-node trades where the visitor doesn't have a local account
    if (!members.find(m => m.publicKey === from)) {
        registerVisitor(from);
    }
    if (!members.find(m => m.publicKey === to)) {
        registerVisitor(to);
    }

    const success = ledger.transfer(from, to, amount);
    if (!success) return null;

    const txn: Transaction = {
        id: crypto.randomUUID(),
        from,
        to,
        amount,
        memo: memo || '',
        timestamp: new Date().toISOString(),
    };
    transactions.push(txn);
    saveState();

    const fromMember = getMember(from);
    const toMember = getMember(to);
    broadcast({
        type: 'transaction',
        txn: {
            ...txn,
            fromCallsign: fromMember?.callsign || 'Unknown',
            toCallsign: toMember?.callsign || 'Unknown',
        },
    });
    console.log(`💸 ${fromMember?.callsign} → ${toMember?.callsign}: ${amount}Ʀ (${memo || 'no memo'})`);
    return txn;
}

export function getTransactions(publicKey?: string, limit = 50): Transaction[] {
    let txns = transactions;
    if (publicKey) {
        txns = txns.filter(t => t.from === publicKey || t.to === publicKey);
    }
    return txns.slice(-limit).reverse(); // Most recent first
}

// ===================== MARKETPLACE =====================

export function createPost(
    type: 'offer' | 'need',
    category: string,
    title: string,
    description: string,
    credits: number,
    authorPublicKey: string,
    lat?: number,
    lng?: number,
    photos?: string[],
    repeatable?: boolean,
): MarketplacePost | null {
    const author = getMember(authorPublicKey);
    // Allow posts even without registered member — use fallback callsign
    const callsign = author?.callsign || 'Anonymous';

    const post: MarketplacePost = {
        id: crypto.randomUUID(),
        type,
        category,
        title,
        description,
        credits,
        authorPublicKey,
        authorCallsign: callsign,
        createdAt: new Date().toISOString(),
        active: true,
        status: 'active',
        repeatable: repeatable || false,
        ...(lat != null && lng != null ? { lat, lng } : {}),
        ...(photos && photos.length > 0 ? { photos: photos.slice(0, 3) } : {}),
    };
    posts.push(post);
    saveState();
    broadcast({ type: 'new_post', post });
    console.log(`📌 New ${type}: "${title}" by ${callsign}${repeatable ? ' [repeatable]' : ''}`);
    return post;
}

export function getPosts(filter?: { type?: string; category?: string }): MarketplacePost[] {
    // Show active and pending posts (pending shows with badge)
    let result = posts.filter(p => p.active && (p.status === 'active' || p.status === 'pending'));
    if (filter?.type && filter.type !== 'all') {
        result = result.filter(p => p.type === filter.type);
    }
    if (filter?.category && filter.category !== 'all') {
        result = result.filter(p => p.category === filter.category);
    }
    return result.reverse(); // Most recent first
}

export function removePost(id: string, authorPublicKey: string): boolean {
    const post = posts.find(p => p.id === id && p.authorPublicKey === authorPublicKey);
    if (!post) return false;
    post.active = false;
    post.status = 'cancelled';
    saveState();
    broadcast({ type: 'post_removed', id });
    return true;
}

export function updatePost(
    id: string,
    authorPublicKey: string,
    updates: {
        type?: 'offer' | 'need';
        category?: string;
        title?: string;
        description?: string;
        credits?: number;
        lat?: number;
        lng?: number;
        photos?: string[];
        repeatable?: boolean;
    },
): MarketplacePost | null {
    const post = posts.find(p => p.id === id && p.authorPublicKey === authorPublicKey && p.active);
    if (!post) return null;

    if (updates.type) post.type = updates.type;
    if (updates.category) post.category = updates.category;
    if (updates.title) post.title = updates.title;
    if (updates.description !== undefined) post.description = updates.description;
    if (updates.credits !== undefined) post.credits = Number(updates.credits) || 0;
    if (updates.lat !== undefined) post.lat = updates.lat;
    if (updates.lng !== undefined) post.lng = updates.lng;
    if (updates.photos !== undefined) post.photos = updates.photos.slice(0, 3);
    if (updates.repeatable !== undefined) post.repeatable = updates.repeatable;

    saveState();
    broadcast({ type: 'post_updated', post });
    console.log(`✏️ Updated post: "${post.title}" by ${post.authorCallsign}`);
    return post;
}

// ===================== MARKETPLACE TRANSACTIONS =====================

/**
 * Accept a marketplace post. Creates a MarketplaceTransaction.
 * For one-time posts: sets post to 'pending'.
 * For repeatable posts: post stays 'active'.
 */
export function acceptPost(
    postId: string,
    buyerPublicKey: string,
): MarketplaceTransaction | null {
    const post = posts.find(p => p.id === postId && p.active && p.status === 'active');
    if (!post) return null;

    // Can't accept your own post
    if (post.authorPublicKey === buyerPublicKey) return null;

    const buyer = getMember(buyerPublicKey);
    const buyerCallsign = buyer?.callsign || 'Anonymous';

    const isOffer = post.type === 'offer';
    const tx: MarketplaceTransaction = {
        id: crypto.randomUUID(),
        postId: post.id,
        postTitle: post.title,
        buyerPublicKey,
        buyerCallsign,
        sellerPublicKey: post.authorPublicKey,
        sellerCallsign: post.authorCallsign,
        credits: post.credits,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };

    marketplaceTransactions.push(tx);

    // For one-time posts, mark as pending
    if (!post.repeatable) {
        post.status = 'pending';
        post.acceptedBy = buyerPublicKey;
        post.acceptedAt = new Date().toISOString();
    }

    saveState();
    broadcast({ type: 'post_accepted', postId: post.id, transaction: tx });
    console.log(`🤝 ${buyerCallsign} accepted "${post.title}" by ${post.authorCallsign}`);
    return tx;
}

/**
 * Complete (confirm) a marketplace transaction. Transfers credits.
 * Only the poster (seller) can confirm.
 */
export function completePostTransaction(
    transactionId: string,
    confirmerPublicKey: string,
): MarketplaceTransaction | null {
    const tx = marketplaceTransactions.find(t => t.id === transactionId && t.status === 'pending');
    if (!tx) return null;

    // Only the post author (seller) can confirm
    if (tx.sellerPublicKey !== confirmerPublicKey) return null;

    const post = posts.find(p => p.id === tx.postId);

    // Transfer credits if amount > 0
    if (tx.credits > 0 && post) {
        const isOffer = post.type === 'offer';
        const from = isOffer ? tx.buyerPublicKey : tx.sellerPublicKey;
        const to = isOffer ? tx.sellerPublicKey : tx.buyerPublicKey;
        const memo = `Completed: ${tx.postTitle}`;
        
        // Use the ledger to transfer
        const success = ledger.transfer(from, to, tx.credits);
        if (!success) return null;
        
        const txRecord: Transaction = {
            id: crypto.randomUUID(),
            from, to,
            amount: tx.credits,
            memo,
            timestamp: new Date().toISOString(),
        };
        transactions.push(txRecord);
    }

    tx.status = 'completed';
    tx.completedAt = new Date().toISOString();

    // For one-time posts, mark as completed
    if (post && !post.repeatable) {
        post.status = 'completed';
        post.active = false;
        post.completedAt = new Date().toISOString();
    }

    saveState();
    broadcast({ type: 'transaction_completed', transaction: tx });
    console.log(`✅ Transaction completed: "${tx.postTitle}" (${tx.credits}🫘)`);
    return tx;
}

/**
 * Cancel a pending marketplace transaction.
 * Either the buyer or the seller can cancel.
 */
export function cancelPostTransaction(
    transactionId: string,
    cancellerPublicKey: string,
): MarketplaceTransaction | null {
    const tx = marketplaceTransactions.find(t => t.id === transactionId && t.status === 'pending');
    if (!tx) return null;

    // Either buyer or seller can cancel
    if (tx.buyerPublicKey !== cancellerPublicKey && tx.sellerPublicKey !== cancellerPublicKey) return null;

    tx.status = 'cancelled';

    // For one-time posts, restore to active
    const post = posts.find(p => p.id === tx.postId);
    if (post && !post.repeatable && post.status === 'pending') {
        post.status = 'active';
        delete post.acceptedBy;
        delete post.acceptedAt;
    }

    saveState();
    broadcast({ type: 'transaction_cancelled', transaction: tx });
    console.log(`❌ Transaction cancelled: "${tx.postTitle}"`);
    return tx;
}

/**
 * Pause a repeatable post. Only the author can pause.
 */
export function pausePost(postId: string, authorPublicKey: string): boolean {
    const post = posts.find(p => p.id === postId && p.authorPublicKey === authorPublicKey && p.status === 'active');
    if (!post) return false;
    post.status = 'paused';
    saveState();
    broadcast({ type: 'post_updated', post });
    return true;
}

/**
 * Resume a paused post. Only the author can resume.
 */
export function resumePost(postId: string, authorPublicKey: string): boolean {
    const post = posts.find(p => p.id === postId && p.authorPublicKey === authorPublicKey && p.status === 'paused');
    if (!post) return false;
    post.status = 'active';
    saveState();
    broadcast({ type: 'post_updated', post });
    return true;
}

/**
 * Get marketplace transactions for a user (as buyer or seller).
 */
export function getMarketplaceTransactions(
    publicKey: string,
    filter?: { status?: string },
): MarketplaceTransaction[] {
    let result = marketplaceTransactions.filter(
        t => t.buyerPublicKey === publicKey || t.sellerPublicKey === publicKey
    );
    if (filter?.status) {
        result = result.filter(t => t.status === filter.status);
    }
    return result.reverse(); // Most recent first
}

// ===================== COMMUNITY INFO =====================

export function getCommunityInfo(): {
    memberCount: number;
    postCount: number;
    transactionCount: number;
    commonsBalance: number;
} {
    return {
        memberCount: members.length,
        postCount: posts.filter(p => p.active).length,
        transactionCount: transactions.length,
        commonsBalance: Math.round(COMMONS_BALANCE * 100) / 100,
    };
}

// ===================== MESSAGING =====================

export function createConversation(
    type: 'dm' | 'group',
    participants: string[],
    createdBy: string,
    name?: string,
): Conversation | null {
    // Auto-register unknown participants as visitors (federation support)
    for (const p of participants) {
        if (!members.find(m => m.publicKey === p)) {
            registerVisitor(p);
        }
    }

    // For DMs, check if conversation already exists
    if (type === 'dm' && participants.length === 2) {
        const existing = conversations.find(c =>
            c.type === 'dm' &&
            c.participants.length === 2 &&
            c.participants.includes(participants[0]) &&
            c.participants.includes(participants[1])
        );
        if (existing) return existing;
    }

    const conv: Conversation = {
        id: crypto.randomUUID(),
        type,
        name: type === 'group' ? (name || 'Group Chat') : null,
        participants,
        createdBy,
        createdAt: new Date().toISOString(),
    };
    conversations.push(conv);
    saveState();
    broadcast({ type: 'conversation_created', conversation: conv });
    console.log(`💬 ${type === 'dm' ? 'DM' : 'Group'} created: ${conv.id.substring(0, 8)} (${participants.length} members)`);
    return conv;
}

export function sendMessage(
    conversationId: string,
    authorPubkey: string,
    ciphertext: string,
    nonce: string,
): Message | null {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv) return null;
    if (!conv.participants.includes(authorPubkey)) return null;

    const msg: Message = {
        id: crypto.randomUUID(),
        conversationId,
        authorPubkey,
        ciphertext,
        nonce,
        timestamp: new Date().toISOString(),
    };
    messages.push(msg);
    saveState();

    // Broadcast to WebSocket clients who are participants
    broadcast({
        type: 'new_message',
        conversationId,
        message: msg,
        participants: conv.participants,
    });
    return msg;
}

export function getConversationsByMember(pubkey: string): Conversation[] {
    return conversations
        .filter(c => c.participants.includes(pubkey))
        .sort((a, b) => {
            // Sort by most recent message in conversation
            const aLast = messages.filter(m => m.conversationId === a.id).pop();
            const bLast = messages.filter(m => m.conversationId === b.id).pop();
            const aTime = aLast?.timestamp || a.createdAt;
            const bTime = bLast?.timestamp || b.createdAt;
            return bTime.localeCompare(aTime);
        });
}

export function getConversationMessages(conversationId: string, limit = 50): Message[] {
    return messages
        .filter(m => m.conversationId === conversationId)
        .slice(-limit);
}

export function getConversation(id: string): Conversation | undefined {
    return conversations.find(c => c.id === id);
}

// ===================== STATE SYNC =====================

export interface SyncPayload {
    stateHash: string;
    members: Member[];
    posts: MarketplacePost[];
    nodeId: string;
}

/**
 * Compute a hash of the current state for quick comparison.
 * If two nodes have the same hash, no sync needed.
 */
export function getStateHash(): string {
    const data = JSON.stringify({
        m: members.map(m => m.publicKey).sort(),
        p: posts.filter(p => p.active).map(p => p.id).sort(),
    });
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Export the current state for sharing with connected nodes.
 */
export function exportSyncState(nodeId: string): SyncPayload {
    return {
        stateHash: getStateHash(),
        nodeId,
        members: members.map(m => ({ ...m })),
        posts: posts.filter(p => p.active).map(p => ({ ...p })),
    };
}

/**
 * Import state from a remote node, merging with dedup.
 * Returns the number of new items imported.
 */
export function importRemoteState(remote: SyncPayload): { newMembers: number; newPosts: number } {
    let newMembers = 0;
    let newPosts = 0;

    // Import members we don't have
    for (const rm of remote.members) {
        if (!members.find(m => m.publicKey === rm.publicKey)) {
            members.push({ ...rm });
            newMembers++;
        }
    }

    // Import posts we don't have (by ID)
    for (const rp of remote.posts) {
        if (!posts.find(p => p.id === rp.id)) {
            posts.push({
                ...rp,
                originNode: rp.originNode || remote.nodeId,
            });
            newPosts++;
        }
    }

    if (newMembers > 0 || newPosts > 0) {
        saveState();
        broadcast({ type: 'state_synced', newMembers, newPosts, from: remote.nodeId });
        console.log(`🔄 Sync import: +${newMembers} members, +${newPosts} posts from ${remote.nodeId}`);
    }

    return { newMembers, newPosts };
}

// ===================== COMMUNITY HEALTH =====================

export interface HealthFlag {
    type: 'wash_trading' | 'isolated_branch' | 'inactive_member';
    severity: 'warning' | 'alert';
    description: string;
    members: string[];
}

export interface CommunityHealth {
    tree: {
        totalMembers: number;
        maxDepth: number;
        widestBranch: { callsign: string; children: number };
        avgBranchSize: number;
    };
    activity: {
        totalTransactions: number;
        last7Days: number;
        last30Days: number;
        activeMemberCount: number;
        inactiveMemberCount: number;
        commonsBalance: number;
    };
    flags: HealthFlag[];
}

export function getCommunityHealth(): CommunityHealth {
    const now = Date.now();
    const t = getThresholds();
    const THIRTY_DAYS = t.inactiveMemberDays * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const WASH_WINDOW = t.washTradingWindowHours * 60 * 60 * 1000;

    // --- Tree stats ---
    const tree = getInviteTree();
    function getDepth(nodes: InviteTreeNode[]): number {
        if (nodes.length === 0) return 0;
        return 1 + Math.max(...nodes.map(n => getDepth(n.children)));
    }
    function countChildren(node: InviteTreeNode): number {
        return node.children.length + node.children.reduce((s, c) => s + countChildren(c), 0);
    }

    const maxDepth = getDepth(tree);
    let widestBranch = { callsign: 'none', children: 0 };
    for (const root of tree) {
        const total = countChildren(root);
        if (total > widestBranch.children) {
            widestBranch = { callsign: root.callsign, children: total };
        }
    }
    const avgBranchSize = tree.length > 0
        ? Math.round((members.length / tree.length) * 10) / 10
        : 0;

    // --- Activity stats ---
    const last7 = transactions.filter(t => now - new Date(t.timestamp).getTime() < SEVEN_DAYS);
    const last30 = transactions.filter(t => now - new Date(t.timestamp).getTime() < THIRTY_DAYS);

    const activeMembers = new Set<string>();
    for (const t of last30) {
        activeMembers.add(t.from);
        activeMembers.add(t.to);
    }

    // --- Flags ---
    const flags: HealthFlag[] = [];

    // 1. Wash trading: A→B and B→A within 24h, more than 2 round-trips
    const pairMap = new Map<string, number>();
    for (const t of transactions) {
        const age = now - new Date(t.timestamp).getTime();
        if (age > WASH_WINDOW) continue;
        const pair = [t.from, t.to].sort().join('|');
        pairMap.set(pair, (pairMap.get(pair) || 0) + 1);
    }
    for (const [pair, count] of pairMap) {
        if (count >= t.washTradingMinTxns) {
            const [a, b] = pair.split('|');
            const memberA = getMember(a);
            const memberB = getMember(b);
            flags.push({
                type: 'wash_trading',
                severity: 'alert',
                description: `${memberA?.callsign || a.substring(0, 8)} ↔ ${memberB?.callsign || b.substring(0, 8)}: ${count} transactions in 24h`,
                members: [a, b],
            });
        }
    }

    // 2. Inactive members: no transactions in 30 days
    for (const m of members) {
        if (!activeMembers.has(m.publicKey)) {
            const joinAge = now - new Date(m.joinedAt).getTime();
            if (joinAge > THIRTY_DAYS) {
                flags.push({
                    type: 'inactive_member',
                    severity: 'warning',
                    description: `${m.callsign} — no activity in 30+ days`,
                    members: [m.publicKey],
                });
            }
        }
    }

    // 3. Isolated branches: subtree where all transactions are internal
    for (const root of tree) {
        if (root.children.length === 0) continue;
        const branchMembers = new Set<string>();
        function collectMembers(node: InviteTreeNode) {
            branchMembers.add(node.publicKey);
            node.children.forEach(collectMembers);
        }
        collectMembers(root);
        if (branchMembers.size < 2) continue;

        const branchTxns = transactions.filter(
            t => branchMembers.has(t.from) || branchMembers.has(t.to)
        );
        if (branchTxns.length < t.isolatedBranchMinTxns) continue;

        const allInternal = branchTxns.every(
            t => branchMembers.has(t.from) && branchMembers.has(t.to)
        );
        if (allInternal) {
            flags.push({
                type: 'isolated_branch',
                severity: 'warning',
                description: `${root.callsign}'s branch (${branchMembers.size} members) only trades internally`,
                members: Array.from(branchMembers),
            });
        }
    }

    return {
        tree: {
            totalMembers: members.length,
            maxDepth,
            widestBranch,
            avgBranchSize,
        },
        activity: {
            totalTransactions: transactions.length,
            last7Days: last7.length,
            last30Days: last30.length,
            activeMemberCount: activeMembers.size,
            inactiveMemberCount: members.length - activeMembers.size,
            commonsBalance: Math.round(COMMONS_BALANCE * 100) / 100,
        },
        flags,
    };
}

// ===================== RATINGS =====================

export function addRating(raterPubkey: string, targetPubkey: string, stars: number, comment: string): Rating | null {
    if (!members.find(m => m.publicKey === raterPubkey)) return null;
    if (!members.find(m => m.publicKey === targetPubkey)) return null;
    if (raterPubkey === targetPubkey) return null;
    if (stars < 1 || stars > 5) return null;

    // Update existing rating if already rated
    const existing = ratings.find(r => r.raterPubkey === raterPubkey && r.targetPubkey === targetPubkey);
    if (existing) {
        existing.stars = stars;
        existing.comment = comment.slice(0, 200);
        existing.createdAt = new Date().toISOString();
        saveState();
        return existing;
    }

    const rating: Rating = {
        id: crypto.randomUUID(),
        targetPubkey,
        raterPubkey,
        stars,
        comment: comment.slice(0, 200),
        createdAt: new Date().toISOString(),
    };
    ratings.push(rating);
    saveState();
    const rater = getMember(raterPubkey);
    const target = getMember(targetPubkey);
    console.log(`⭐ ${rater?.callsign || raterPubkey.substring(0, 12)} rated ${target?.callsign || targetPubkey.substring(0, 12)}: ${stars}/5`);
    return rating;
}

export function getRatings(targetPubkey: string): Rating[] {
    return ratings.filter(r => r.targetPubkey === targetPubkey);
}

export function getAverageRating(targetPubkey: string): { average: number; count: number } {
    const userRatings = ratings.filter(r => r.targetPubkey === targetPubkey);
    if (userRatings.length === 0) return { average: 0, count: 0 };
    const sum = userRatings.reduce((acc, r) => acc + r.stars, 0);
    return { average: Math.round((sum / userRatings.length) * 10) / 10, count: userRatings.length };
}

// ===================== ABUSE REPORTS =====================

export function submitReport(reporterPubkey: string, targetPubkey: string, reason: string, targetPostId?: string): AbuseReport | null {
    if (!members.find(m => m.publicKey === reporterPubkey)) return null;
    if (reporterPubkey === targetPubkey) return null;

    const report: AbuseReport = {
        id: crypto.randomUUID(),
        reporterPubkey,
        targetPubkey,
        targetPostId,
        reason: reason.slice(0, 500),
        createdAt: new Date().toISOString(),
    };
    reports.push(report);
    saveState();
    const reporter = getMember(reporterPubkey);
    console.log(`🚩 Report by ${reporter?.callsign || reporterPubkey.substring(0, 12)}: "${reason.substring(0, 50)}"`);
    return report;
}

export function getReports(): AbuseReport[] {
    return [...reports].reverse();
}

// ===================== FRIENDS =====================

export function getFriends(pubkey: string): FriendEntry[] {
    return friends[pubkey] || [];
}

export function addFriend(ownerPubkey: string, friendPubkey: string): FriendEntry | null {
    if (!members.find(m => m.publicKey === ownerPubkey)) return null;
    const friendMember = members.find(m => m.publicKey === friendPubkey);
    if (!friendMember) return null;
    if (ownerPubkey === friendPubkey) return null;

    if (!friends[ownerPubkey]) friends[ownerPubkey] = [];

    // Already friends?
    if (friends[ownerPubkey].find(f => f.publicKey === friendPubkey)) {
        return friends[ownerPubkey].find(f => f.publicKey === friendPubkey)!;
    }

    const entry: FriendEntry = {
        publicKey: friendPubkey,
        callsign: friendMember.callsign,
        addedAt: new Date().toISOString(),
        isGuardian: false,
    };
    friends[ownerPubkey].push(entry);
    saveState();
    console.log(`👥 ${getMember(ownerPubkey)?.callsign} added ${friendMember.callsign} as friend`);
    return entry;
}

export function removeFriend(ownerPubkey: string, friendPubkey: string): boolean {
    if (!friends[ownerPubkey]) return false;
    const idx = friends[ownerPubkey].findIndex(f => f.publicKey === friendPubkey);
    if (idx === -1) return false;
    friends[ownerPubkey].splice(idx, 1);
    saveState();
    return true;
}

export function setGuardian(ownerPubkey: string, friendPubkey: string, isGuardian: boolean): boolean {
    if (!friends[ownerPubkey]) return false;
    const friend = friends[ownerPubkey].find(f => f.publicKey === friendPubkey);
    if (!friend) return false;
    friend.isGuardian = isGuardian;
    saveState();
    return true;
}

// ===================== ADMIN CONTROLS =====================

export function adminSetUserStatus(publicKey: string, status: 'active' | 'disabled') {
    if (profiles[publicKey]) {
        profiles[publicKey].status = status;
        saveState();
        broadcast({ type: 'profile_updated', publicKey });
    }
}

export function adminDeletePost(postId: string) {
    const idx = posts.findIndex(p => p.id === postId);
    if (idx !== -1) {
        posts.splice(idx, 1);
        saveState();
        broadcast({ type: 'post_removed', id: postId });
    }
}

export function adminPruneUser(publicKey: string) {
    adminSetUserStatus(publicKey, 'disabled');
    let modified = false;
    for (const post of posts) {
        if (post.authorPublicKey === publicKey && post.status === 'active') {
            post.status = 'cancelled';
            post.active = false;
            modified = true;
        }
    }
    if (modified) {
        saveState();
    }
    broadcast({ type: 'user_pruned', publicKey });
}

export function adminPruneBranch(rootPublicKey: string) {
    const prunings = new Set<string>();

    function pruneRec(pubkey: string) {
        if (prunings.has(pubkey)) return;
        prunings.add(pubkey);
        adminPruneUser(pubkey);
        
        const invitees = members.filter(m => m.invitedBy === pubkey).map(m => m.publicKey);
        for (const pk of invitees) {
            pruneRec(pk);
        }
    }
    pruneRec(rootPublicKey);
}

export function adminBroadcastAnnouncement(title: string, body: string, severity: 'info'|'warning'|'critical') {
    broadcast({ type: 'system_announcement', title, body, severity });
}

export function adminSendWarning(targetPubkey: string, body: string) {
    const convId = 'sys_warn_' + targetPubkey;
    let conv = conversations.find(c => c.id === convId);
    if (!conv) {
        conv = {
            id: convId,
            type: 'dm',
            name: '⚠️ System Warnings',
            participants: ['system', targetPubkey],
            createdBy: 'system',
            createdAt: new Date().toISOString()
        };
        conversations.push(conv);
    }
    
    const msg: Message = {
        id: crypto.randomUUID(),
        conversationId: convId,
        authorPubkey: 'system',
        ciphertext: body, // Plaintext system message instead of NaCl box
        nonce: 'system',
        timestamp: new Date().toISOString(),
    };
    messages.push(msg);
    saveState();

    broadcast({
        type: 'new_message',
        conversationId: convId,
        message: msg,
        participants: conv.participants,
    });
}
