/**
 * API Client — Typed fetch wrappers for BeanPool Node APIs
 *
 * Base URL is same-origin (the PWA is served by the node).
 */

const BASE = '';  // Same-origin — PWA is served by the node

async function request<T>(method: string, path: string, body?: any): Promise<T> {
    const opts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${BASE}${path}`, opts);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
}

// ===================== COMMUNITY =====================

export interface CommunityInfo {
    memberCount: number;
    postCount: number;
    transactionCount: number;
    commonsBalance: number;
}

export interface Member {
    publicKey: string;
    callsign: string;
    joinedAt: string;
}

export async function getCommunityInfo(): Promise<CommunityInfo> {
    return request('GET', '/api/community/info');
}

export async function getMembers(): Promise<Member[]> {
    return request('GET', '/api/community/members');
}

export async function registerMember(publicKey: string, callsign: string): Promise<{ success: boolean; member: Member }> {
    return request('POST', '/api/community/register', { publicKey, callsign });
}

// ===================== LEDGER =====================

export interface BalanceInfo {
    balance: number;
    floor: number;
    commonsBalance: number;
    callsign: string;
}

export interface Transaction {
    id: string;
    from: string;
    to: string;
    amount: number;
    memo: string;
    timestamp: string;
}

export async function getBalance(publicKey: string): Promise<BalanceInfo> {
    return request('GET', `/api/ledger/balance/${encodeURIComponent(publicKey)}`);
}

export async function sendTransfer(from: string, to: string, amount: number, memo: string): Promise<{ success: boolean; transaction: Transaction }> {
    return request('POST', '/api/ledger/transfer', { from, to, amount, memo });
}

export async function getTransactions(publicKey?: string, limit = 50): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (publicKey) params.set('publicKey', publicKey);
    params.set('limit', String(limit));
    return request('GET', `/api/ledger/transactions?${params}`);
}

// ===================== MARKETPLACE =====================

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

export async function getMarketplacePosts(filter?: { type?: string; category?: string }): Promise<MarketplacePost[]> {
    const params = new URLSearchParams();
    if (filter?.type) params.set('type', filter.type);
    if (filter?.category) params.set('category', filter.category);
    return request('GET', `/api/marketplace/posts?${params}`);
}

export async function createMarketplacePost(post: {
    type: 'offer' | 'need';
    category: string;
    title: string;
    description: string;
    credits: number;
    authorPublicKey: string;
    lat?: number;
    lng?: number;
}): Promise<{ success: boolean; post: MarketplacePost }> {
    return request('POST', '/api/marketplace/posts', post);
}

export async function removeMarketplacePost(id: string, authorPublicKey: string): Promise<{ success: boolean }> {
    return request('POST', '/api/marketplace/posts/remove', { id, authorPublicKey });
}
