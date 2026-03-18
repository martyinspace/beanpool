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
    invitedBy: string;
    inviteCode: string;
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

// ===================== INVITES =====================

export interface InviteCode {
    code: string;
    createdBy: string;
    createdAt: string;
    usedBy: string | null;
    usedAt: string | null;
}

export async function generateInvite(publicKey: string): Promise<{ success: boolean; invite: InviteCode }> {
    return request('POST', '/api/invite/generate', { publicKey });
}

export async function redeemInvite(code: string, publicKey: string, callsign: string): Promise<{ success: boolean; member: Member }> {
    return request('POST', '/api/invite/redeem', { code, publicKey, callsign });
}

export async function getInviteTree(): Promise<any[]> {
    return request('GET', '/api/invite/tree');
}

export async function getCommunityHealth(): Promise<any> {
    return request('GET', '/api/community/health');
}

export async function getMyInvites(publicKey: string): Promise<{ invites: InviteCode[] }> {
    return request('GET', `/api/invite/mine/${encodeURIComponent(publicKey)}`);
}

// ===================== PROFILES =====================

export interface MemberProfile {
    publicKey: string;
    avatar: string | null;
    bio: string;
    contact: {
        value: string;
        visibility: 'hidden' | 'trade_partners' | 'community';
    } | null;
}

export async function updateMemberProfile(publicKey: string, update: {
    avatar?: string | null;
    bio?: string;
    contact?: { value: string; visibility: 'hidden' | 'trade_partners' | 'community' } | null;
}): Promise<{ success: boolean; profile: MemberProfile }> {
    return request('POST', '/api/profile/update', { publicKey, ...update });
}

export async function getMemberProfile(publicKey: string, requester?: string): Promise<MemberProfile> {
    const params = requester ? `?requester=${encodeURIComponent(requester)}` : '';
    return request('GET', `/api/profile/${encodeURIComponent(publicKey)}${params}`);
}

// ===================== MESSAGING =====================

export interface Conversation {
    id: string;
    type: 'dm' | 'group';
    name: string | null;
    participants: string[];
    createdBy: string;
    createdAt: string;
}

export interface ApiMessage {
    id: string;
    conversationId: string;
    authorPubkey: string;
    ciphertext: string;
    nonce: string;
    timestamp: string;
}

export async function createConversationApi(
    type: 'dm' | 'group',
    participants: string[],
    createdBy: string,
    name?: string,
): Promise<{ success: boolean; conversation: Conversation }> {
    return request('POST', '/api/messages/conversation', { type, participants, createdBy, name });
}

export async function sendMessageApi(
    conversationId: string,
    authorPubkey: string,
    ciphertext: string,
    nonce: string,
): Promise<{ success: boolean; message: ApiMessage }> {
    return request('POST', '/api/messages/send', { conversationId, authorPubkey, ciphertext, nonce });
}

export async function getConversations(publicKey: string): Promise<{ conversations: Conversation[] }> {
    return request('GET', `/api/messages/conversations/${encodeURIComponent(publicKey)}`);
}

export async function getConversationMessages(conversationId: string, limit = 50): Promise<{
    conversation: Conversation;
    messages: ApiMessage[];
}> {
    return request('GET', `/api/messages/${encodeURIComponent(conversationId)}?limit=${limit}`);
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
    photos?: string[];
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
    photos?: string[];
}): Promise<{ success: boolean; post: MarketplacePost }> {
    return request('POST', '/api/marketplace/posts', post);
}

export async function removeMarketplacePost(id: string, authorPublicKey: string): Promise<{ success: boolean }> {
    return request('POST', '/api/marketplace/posts/remove', { id, authorPublicKey });
}

// ===================== RATINGS =====================

export interface Rating {
    id: string;
    targetPubkey: string;
    raterPubkey: string;
    stars: number;
    comment: string;
    createdAt: string;
}

export async function submitRating(raterPubkey: string, targetPubkey: string, stars: number, comment: string): Promise<{ success: boolean; rating: Rating }> {
    return request('POST', '/api/ratings', { raterPubkey, targetPubkey, stars, comment });
}

export async function getMemberRatings(publicKey: string): Promise<{ ratings: Rating[]; average: number; count: number }> {
    return request('GET', `/api/ratings/${publicKey}`);
}

// ===================== REPORTS =====================

export async function reportAbuse(reporterPubkey: string, targetPubkey: string, reason: string, targetPostId?: string): Promise<{ success: boolean }> {
    return request('POST', '/api/reports', { reporterPubkey, targetPubkey, reason, targetPostId });
}
