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

const DATA_DIR = process.env.BEANPOOL_DATA_DIR || path.join(process.cwd(), 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

// ===================== TYPES =====================

export interface Member {
    publicKey: string;
    callsign: string;
    joinedAt: string;
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
    lat?: number;
    lng?: number;
}

export interface Transaction {
    id: string;
    from: string;
    to: string;
    amount: number;
    memo: string;
    timestamp: string;
}

interface PersistedState {
    members: Member[];
    posts: MarketplacePost[];
    transactions: Transaction[];
    ledgerAccounts: { id: string; balance: number; lastDemurrageEpoch: number }[];
}

// ===================== STATE =====================

let ledger = new LedgerManager();
let members: Member[] = [];
let posts: MarketplacePost[] = [];
let transactions: Transaction[] = [];
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
            if (saved.ledgerAccounts?.length) {
                ledger.loadState(saved.ledgerAccounts);
            }
            console.log(`📒 Loaded state: ${members.length} members, ${posts.length} posts, ${transactions.length} txns`);
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
        transactions: transactions.slice(-1000), // Keep last 1000 txns
        ledgerAccounts: ledger.getAllAccounts(),
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

export function registerMember(publicKey: string, callsign: string): Member | null {
    // Check if already registered
    if (members.find(m => m.publicKey === publicKey)) {
        // Update callsign if changed
        const existing = members.find(m => m.publicKey === publicKey)!;
        existing.callsign = callsign;
        saveState();
        return existing;
    }

    const member: Member = {
        publicKey,
        callsign,
        joinedAt: new Date().toISOString(),
    };
    members.push(member);

    // Initialize ledger account with 0 balance
    ledger.initializeGenesisAccount(publicKey);

    saveState();
    broadcast({ type: 'member_joined', member });
    console.log(`👤 New member: ${callsign} (${publicKey.substring(0, 12)}...)`);
    return member;
}

export function getMembers(): Member[] {
    return members;
}

export function getMember(publicKey: string): Member | undefined {
    return members.find(m => m.publicKey === publicKey);
}

// ===================== LEDGER =====================

export function getBalance(publicKey: string): { balance: number; floor: number; commonsBalance: number } {
    const account = ledger.getAccount(publicKey);
    return {
        balance: Math.round(account.balance * 100) / 100,
        floor: -100,
        commonsBalance: Math.round(COMMONS_BALANCE * 100) / 100,
    };
}

export function transfer(from: string, to: string, amount: number, memo: string): Transaction | null {
    if (amount <= 0) return null;
    if (!members.find(m => m.publicKey === from)) return null;
    if (!members.find(m => m.publicKey === to)) return null;

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
): MarketplacePost | null {
    const author = getMember(authorPublicKey);
    if (!author) return null;

    const post: MarketplacePost = {
        id: crypto.randomUUID(),
        type,
        category,
        title,
        description,
        credits,
        authorPublicKey,
        authorCallsign: author.callsign,
        createdAt: new Date().toISOString(),
        active: true,
        ...(lat != null && lng != null ? { lat, lng } : {}),
    };
    posts.push(post);
    saveState();
    broadcast({ type: 'new_post', post });
    console.log(`📌 New ${type}: "${title}" by ${author.callsign}`);
    return post;
}

export function getPosts(filter?: { type?: string; category?: string }): MarketplacePost[] {
    let result = posts.filter(p => p.active);
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
    saveState();
    broadcast({ type: 'post_removed', id });
    return true;
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
