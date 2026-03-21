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
    homeNodeUrl?: string;   // for federation visitors: their home node URL
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
    intendedFor?: string;
}

export async function generateInvite(publicKey: string, intendedFor?: string): Promise<{ success: boolean; invite: InviteCode }> {
    return request('POST', '/api/invite/generate', { publicKey, intendedFor });
}

export async function redeemInvite(code: string, publicKey: string, callsign: string): Promise<{ success: boolean; member: Member }> {
    return request('POST', '/api/invite/redeem', { code, publicKey, callsign });
}

export async function getInviteTree(root?: string): Promise<any[]> {
    return request('GET', root ? `/api/invite/tree?root=${encodeURIComponent(root)}` : '/api/invite/tree');
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
    unreadCount?: number;
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

export async function getConversations(publicKey: string): Promise<{ conversations: Conversation[]; totalUnread: number }> {
    return request('GET', `/api/messages/conversations/${encodeURIComponent(publicKey)}`);
}

export async function markConversationReadApi(pubkey: string, conversationId: string): Promise<void> {
    return request('POST', '/api/messages/mark-read', { pubkey, conversationId });
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
    status: 'pending' | 'completed' | 'cancelled';
    createdAt: string;
    completedAt?: string;
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
    repeatable?: boolean;
}): Promise<{ success: boolean; post: MarketplacePost }> {
    return request('POST', '/api/marketplace/posts', post);
}

export async function removeMarketplacePost(id: string, authorPublicKey: string): Promise<{ success: boolean }> {
    return request('POST', '/api/marketplace/posts/remove', { id, authorPublicKey });
}

export async function updateMarketplacePost(
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
    },
): Promise<{ success: boolean; post: MarketplacePost }> {
    return request('POST', '/api/marketplace/posts/update', { id, authorPublicKey, ...updates });
}

// ===================== MARKETPLACE TRANSACTIONS =====================

export async function acceptMarketplacePost(
    postId: string, buyerPublicKey: string
): Promise<{ success: boolean; transaction: MarketplaceTransaction }> {
    return request('POST', '/api/marketplace/posts/accept', { postId, buyerPublicKey });
}

export async function completeMarketplaceTransaction(
    transactionId: string, confirmerPublicKey: string
): Promise<{ success: boolean; transaction: MarketplaceTransaction }> {
    return request('POST', '/api/marketplace/transactions/complete', { transactionId, confirmerPublicKey });
}

export async function cancelMarketplaceTransaction(
    transactionId: string, cancellerPublicKey: string
): Promise<{ success: boolean; transaction: MarketplaceTransaction }> {
    return request('POST', '/api/marketplace/transactions/cancel', { transactionId, cancellerPublicKey });
}

export async function pauseMarketplacePost(
    postId: string, authorPublicKey: string
): Promise<{ success: boolean }> {
    return request('POST', '/api/marketplace/posts/pause', { postId, authorPublicKey });
}

export async function resumeMarketplacePost(
    postId: string, authorPublicKey: string
): Promise<{ success: boolean }> {
    return request('POST', '/api/marketplace/posts/resume', { postId, authorPublicKey });
}

export async function getMyMarketplaceTransactions(
    publicKey: string, status?: string
): Promise<MarketplaceTransaction[]> {
    const params = new URLSearchParams({ publicKey });
    if (status) params.set('status', status);
    return request('GET', `/api/marketplace/transactions?${params}`);
}

// ===================== RATINGS =====================

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

export async function submitRating(raterPubkey: string, targetPubkey: string, stars: number, comment: string, transactionId: string): Promise<{ success: boolean; rating: Rating }> {
    return request('POST', '/api/ratings', { raterPubkey, targetPubkey, stars, comment, transactionId });
}

export async function getMemberRatings(publicKey: string): Promise<{ ratings: Rating[]; average: number; count: number; asProvider: { average: number; count: number }; asReceiver: { average: number; count: number } }> {
    return request('GET', `/api/ratings/${publicKey}`);
}

// ===================== REPORTS =====================

export async function reportAbuse(reporterPubkey: string, targetPubkey: string, reason: string, targetPostId?: string): Promise<{ success: boolean }> {
    return request('POST', '/api/reports', { reporterPubkey, targetPubkey, reason, targetPostId });
}

// ===================== FRIENDS =====================

export interface FriendEntry {
    publicKey: string;
    callsign: string;
    addedAt: string;
    isGuardian: boolean;
}

export async function getFriends(publicKey: string): Promise<FriendEntry[]> {
    return request('GET', `/api/friends/${publicKey}`);
}

export async function addFriendApi(ownerPubkey: string, friendPubkey: string): Promise<{ success: boolean; friend: FriendEntry }> {
    return request('POST', '/api/friends/add', { ownerPubkey, friendPubkey });
}

export async function removeFriendApi(ownerPubkey: string, friendPubkey: string): Promise<{ success: boolean }> {
    return request('POST', '/api/friends/remove', { ownerPubkey, friendPubkey });
}

export async function setGuardianApi(ownerPubkey: string, friendPubkey: string, isGuardian: boolean): Promise<{ success: boolean }> {
    return request('POST', '/api/friends/guardian', { ownerPubkey, friendPubkey, isGuardian });
}

// ===================== MEMBERS =====================

export interface MemberSummary {
    publicKey: string;
    callsign: string;
    joinedAt: string;
}

export async function getAllMembers(): Promise<MemberSummary[]> {
    return request('GET', '/api/members');
}

// ===================== FEDERATION =====================

export interface NodeInfo {
    name: string;
    memberCount: number;
    postCount: number;
    peerNodes: { callsign: string; publicUrl: string | null }[];
}

/** Fetch node info from a remote node */
export async function getNodeInfo(baseUrl: string): Promise<NodeInfo> {
    const res = await fetch(`${baseUrl}/api/node/info`);
    if (!res.ok) throw new Error(`Failed to fetch node info from ${baseUrl}`);
    return res.json();
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Fetch marketplace posts from a remote node (cached in sessionStorage for 5 min) */
export async function getRemotePosts(baseUrl: string, filters?: { type?: string; category?: string }): Promise<MarketplacePost[]> {
    const cacheKey = `bp_remote_posts_${baseUrl}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL_MS) return data;
    }

    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.category) params.set('category', filters.category);
    const qs = params.toString() ? `?${params}` : '';

    const res = await fetch(`${baseUrl}/api/marketplace/posts${qs}`);
    if (!res.ok) throw new Error(`Failed to fetch posts from ${baseUrl}`);
    const data = await res.json();

    try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* sessionStorage might be full */ }

    return data;
}

/** Send a credit transfer to a remote node's ledger */
export async function sendRemoteTransfer(
    baseUrl: string, from: string, to: string, amount: number, memo: string
): Promise<{ success: boolean; transaction: Transaction }> {
    const res = await fetch(`${baseUrl}/api/ledger/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, amount, memo }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Transfer failed' }));
        throw new Error(err.error || 'Remote transfer failed');
    }
    return res.json();
}

/** Send a federation relay message — delivers to remote node AND stores locally */
export async function sendFederationMessage(
    targetNodeUrl: string,
    senderPublicKey: string,
    senderCallsign: string,
    recipientPublicKey: string,
    ciphertext: string,
    nonce: string,
): Promise<{ conversationId: string }> {
    const homeNodeUrl = window.location.origin;
    const payload = {
        senderPublicKey,
        senderCallsign,
        senderNodeUrl: homeNodeUrl,
        recipientPublicKey,
        ciphertext,
        nonce,
    };

    // 1. Deliver to the remote node
    const remoteRes = await fetch(`${targetNodeUrl}/api/federation/relay-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!remoteRes.ok) {
        const err = await remoteRes.json().catch(() => ({ error: 'Relay failed' }));
        throw new Error(err.error || 'Failed to relay message to remote node');
    }

    // 2. Store locally so the sender can see the conversation in their Chat tab
    const localRes = await fetch(`/api/federation/relay-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...payload,
            // Swap perspective: on our node, the "sender" is us (already a member),
            // the "recipient" is the remote user (will be registered as visitor)
            recipientPublicKey: recipientPublicKey,
        }),
    });
    if (!localRes.ok) {
        // Remote delivery succeeded but local copy failed — still usable
        console.warn('Failed to store local copy of federation message');
        return { conversationId: '' };
    }
    const localData = await localRes.json();
    return { conversationId: localData.conversationId };
}

/** Check balance on a remote node */
export async function getRemoteBalance(baseUrl: string, publicKey: string): Promise<BalanceInfo> {
    const res = await fetch(`${baseUrl}/api/ledger/balance/${encodeURIComponent(publicKey)}`);
    if (!res.ok) throw new Error(`Failed to fetch balance from ${baseUrl}`);
    return res.json();
}

// ===================== COMMUNITY COMMONS =====================

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

export async function getCommonsBalance(): Promise<{ balance: number }> {
    return request('GET', '/api/commons/balance');
}

export async function getCommonsProjects(): Promise<{ projects: CommunityProject[]; activeRound: VotingRound | null }> {
    return request('GET', '/api/commons/projects');
}

export async function proposeProject(proposerPubkey: string, title: string, description: string, requestedAmount: number): Promise<{ success: boolean; project: CommunityProject }> {
    return request('POST', '/api/commons/projects', { proposerPubkey, title, description, requestedAmount });
}

export async function voteForProject(voterPubkey: string, projectId: string): Promise<{ success: boolean }> {
    return request('POST', '/api/commons/vote', { voterPubkey, projectId });
}

export async function getVotingRounds(): Promise<{ rounds: VotingRound[]; activeRound: VotingRound | null }> {
    return request('GET', '/api/commons/rounds');
}

// ===================== NODE CONFIG =====================

export interface NodeConfig {
    serviceRadius?: { lat: number; lng: number; radiusKm: number };
    publishToDirectory?: boolean;
}

export async function getNodeConfig(): Promise<NodeConfig> {
    return request('GET', '/api/node/config');
}
