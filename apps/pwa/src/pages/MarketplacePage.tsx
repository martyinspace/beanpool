/**
 * MarketplacePage — Browse & Post Needs & Offers
 *
 * Fetches real posts from the BeanPool Node API.
 * Users can create new posts and filter by type/category.
 * Tapping a post opens a full detail view.
 */

import { useState, useEffect, useCallback } from 'react';
import { MARKETPLACE_CATEGORIES, POST_TYPE_COLORS, type PostType } from '../lib/marketplace';
import { MarketplaceCard } from '../components/MarketplaceCard';
import { RadiusPickerPage } from '../components/RadiusPickerPage';
import { haversineDistance, loadRadiusSettings, saveRadiusSettings, clearRadiusSettings, type RadiusSettings } from '../lib/geo';
import { loadEnabledPeers, togglePeer } from '../lib/peer-prefs';
import {
    getMarketplacePosts, removeMarketplacePost, updateMarketplacePost,
    getMemberProfile, createConversationApi, sendTransfer,
    submitRating, getMemberRatings, reportAbuse,
    getNodeInfo, getRemotePosts, sendRemoteTransfer, sendFederationMessage,
    acceptMarketplacePost, completeMarketplaceTransaction,
    cancelMarketplaceTransaction, getMyMarketplaceTransactions, getNodeConfig,
    requestMarketplacePost, approveMarketplaceRequest, rejectMarketplaceRequest, cancelMarketplaceRequest,
    type MarketplacePost, type MemberProfile, type NodeInfo, type MarketplaceTransaction, type NodeConfig,
} from '../lib/api';
import { type BeanPoolIdentity } from '../lib/identity';

interface Props {
    identity: BeanPoolIdentity | null;
    marketClickCount?: number;
    openPostId?: string | null;
    onPostOpened?: () => void;
    onNavigate?: (tab: string, conversationId?: string) => void;
}

export function MarketplacePage({ identity, marketClickCount = 0, openPostId, onPostOpened, onNavigate }: Props) {
    const [posts, setPosts] = useState<MarketplacePost[]>([]);
    const [typeFilter, setTypeFilter] = useState<PostType | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
    const [loading, setLoading] = useState(true);
    const [showMine, setShowMine] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Federation — multi-toggle (home always on, peers toggled independently)
    const [peerNodes, setPeerNodes] = useState<{ callsign: string; publicUrl: string }[]>([]);
    const [enabledPeers, setEnabledPeers] = useState<Set<string>>(() => loadEnabledPeers());

    // Radius filter
    const [radiusSettings, setRadiusSettings] = useState<RadiusSettings | null>(() => loadRadiusSettings());
    const [showRadiusPicker, setShowRadiusPicker] = useState(false);
    const [nodeConfig, setNodeConfig] = useState<NodeConfig | null>(null);

    // Fetch config once on mount
    useEffect(() => {
        getNodeConfig().then(setNodeConfig).catch(console.error);
    }, []);

    // Layout configuration
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [showFilters, setShowFilters] = useState(false);

    // Detail view
    const [selectedPost, setSelectedPost] = useState<MarketplacePost | null>(null);

    // Reset detail view when bottom tab is double-tapped
    useEffect(() => {
        if (marketClickCount > 0) {
            setSelectedPost(null);
        }
    }, [marketClickCount]);

    // Handle deep-link from Map pins
    useEffect(() => {
        if (openPostId && posts.length > 0) {
            const found = posts.find(p => p.id === openPostId);
            if (found) {
                setSelectedPost(found);
                onPostOpened?.();
            }
        }
    }, [openPostId, posts, onPostOpened]);

    const [authorProfile, setAuthorProfile] = useState<MemberProfile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [messaging, setMessaging] = useState(false);

    // Ratings
    const [authorAvgRating, setAuthorAvgRating] = useState<{ average: number; count: number; asProvider?: { average: number; count: number }; asReceiver?: { average: number; count: number } }>({ average: 0, count: 0 });
    const [myRating, setMyRating] = useState(0);
    const [ratingComment, setRatingComment] = useState('');
    const [showRatingForm, setShowRatingForm] = useState(false);
    const [submittingRating, setSubmittingRating] = useState(false);

    // Report
    const [showReportForm, setShowReportForm] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [submittingReport, setSubmittingReport] = useState(false);

    // Accept/Fulfill
    const [accepting, setAccepting] = useState(false);

    // Edit mode
    const [editMode, setEditMode] = useState(false);
    const [editType, setEditType] = useState<'offer' | 'need'>('offer');
    const [editCategory, setEditCategory] = useState('other');
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editCredits, setEditCredits] = useState(0);
    const [editPhotos, setEditPhotos] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Accept & Complete Inline Forms
    const [showAcceptConfirm, setShowAcceptConfirm] = useState(false);
    const [acceptHours, setAcceptHours] = useState('1');
    const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
    const [completeHours, setCompleteHours] = useState('');

    // Requests Dashboard
    const [requests, setRequests] = useState<MarketplaceTransaction[]>([]);

    // Active Deals Segment Toggle
    const [activeTab, setActiveTab] = useState<'feed' | 'deals'>('feed');
    // ALL of the user's posts or accepted fulfillments, sorted by urgency
    const myMarketPosts = posts.filter(p => 
        identity && 
        (p.authorPublicKey === identity.publicKey || (p as any).acceptedBy === identity.publicKey)
    ).sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Global requests waiting for the current user's approval
    const [globalRequests, setGlobalRequests] = useState<MarketplaceTransaction[]>([]);

    const pendingDealsCount = posts.filter(p => 
        p.status === 'pending' && 
        identity && 
        (p.authorPublicKey === identity.publicKey || (p as any).acceptedBy === identity.publicKey)
    ).length + globalRequests.length;

    // Author ratings cache for tiles
    const [authorRatingsCache, setAuthorRatingsCache] = useState<Record<string, { average: number; count: number }>>({}); 

    const refresh = useCallback(async () => {
        try {
            const filter: any = {};
            if (typeFilter !== 'all') filter.type = typeFilter;
            if (categoryFilter !== 'all') filter.category = categoryFilter;

            // Always fetch home node + global requests
            const [homeData, myTxs] = await Promise.all([
                getMarketplacePosts(filter),
                identity ? getMyMarketplaceTransactions(identity.publicKey).catch(() => []) : Promise.resolve([])
            ]);
            
            setGlobalRequests(myTxs.filter(t => t.buyerPublicKey === identity?.publicKey && t.status === 'requested'));

            let allPosts: MarketplacePost[] = [...homeData];

            // Fetch from all enabled peer nodes in parallel
            if (enabledPeers.size > 0) {
                const peerResults = await Promise.allSettled(
                    [...enabledPeers].map(async (peerUrl) => {
                        const data = await getRemotePosts(peerUrl, filter);
                        return data.map(p => ({ ...p, _remoteNode: peerUrl }));
                    })
                );
                for (const result of peerResults) {
                    if (result.status === 'fulfilled') allPosts = allPosts.concat(result.value);
                }
            }

            setPosts(allPosts);
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [typeFilter, categoryFilter, enabledPeers]);

    // Fetch peer nodes on mount
    useEffect(() => {
        getNodeInfo('').then(info => {
            const peers = info.peerNodes
                .filter((p): p is { callsign: string; publicUrl: string } => !!p.publicUrl);
            setPeerNodes(peers);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 15_000);
        return () => clearInterval(interval);
    }, [refresh]);

    // Fetch ratings for all unique post authors
    useEffect(() => {
        if (posts.length === 0) return;
        const uniqueAuthors = [...new Set(posts.map(p => p.authorPublicKey))];
        Promise.all(
            uniqueAuthors.map(pk =>
                getMemberRatings(pk)
                    .then(r => [pk, { average: r.average, count: r.count }] as const)
                    .catch(() => [pk, { average: 0, count: 0 }] as const)
            )
        ).then(results => {
            const cache: Record<string, { average: number; count: number }> = {};
            for (const [pk, rating] of results) cache[pk] = rating;
            setAuthorRatingsCache(cache);
        });
    }, [posts]);

    // Load author profile + ratings when detail view opens
    useEffect(() => {
        if (!selectedPost) return;
        setLoadingProfile(true);
        setAuthorProfile(null);
        setAuthorAvgRating({ average: 0, count: 0 });
        setMyRating(0);
        setRatingComment('');
        setShowRatingForm(false);
        setShowReportForm(false);
        setReportReason('');
        getMemberProfile(selectedPost.authorPublicKey, identity?.publicKey)
            .then(p => setAuthorProfile(p))
            .catch(() => setAuthorProfile(null))
            .finally(() => setLoadingProfile(false));
        getMemberRatings(selectedPost.authorPublicKey)
            .then(r => setAuthorAvgRating({ average: r.average, count: r.count, asProvider: r.asProvider, asReceiver: r.asReceiver }))
            .catch(() => {});
        
        // Fetch requests if this is a Need
        if (selectedPost.type === 'need') {
            getMyMarketplaceTransactions(identity?.publicKey || '')
                .then(txs => {
                    setRequests(txs.filter(t => t.postId === selectedPost.id && t.status === 'requested'));
                })
                .catch(() => setRequests([]));
        } else {
            setRequests([]);
        }
    }, [selectedPost?.id, identity?.publicKey]);

    async function handleMessageAuthor() {
        if (!identity || !selectedPost) return;
        setMessaging(true);
        try {
            const remoteNode = (selectedPost as any)._remoteNode;
            if (remoteNode) {
                // Remote post — relay via federation
                const result = await sendFederationMessage(
                    remoteNode,
                    identity.publicKey,
                    identity.callsign || 'Anonymous',
                    selectedPost.authorPublicKey,
                    `Hi! I'm interested in your post: "${selectedPost.title}"`,
                    'plaintext',  // nonce placeholder for unencrypted federation msgs
                );
                if (result.conversationId && onNavigate) {
                    onNavigate('messages', result.conversationId);
                }
            } else {
                // Local post — existing flow
                const result = await createConversationApi(
                    'dm',
                    [identity.publicKey, selectedPost.authorPublicKey],
                    identity.publicKey,
                );
                if (onNavigate) onNavigate('messages', result.conversation.id);
            }
        } catch (e: any) {
            setError(e.message || 'Failed to start conversation');
        } finally {
            setMessaging(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.5rem', background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)', borderRadius: '8px', color: 'var(--text-primary)',
        fontSize: '0.85rem', marginBottom: '0.5rem', fontFamily: 'inherit',
        boxSizing: 'border-box',
    };

    // =================== DETAIL VIEW ===================
    if (selectedPost) {
        const cat = MARKETPLACE_CATEGORIES.find(c => c.id === selectedPost.category);
        const typeColor = POST_TYPE_COLORS[selectedPost.type];
        const postedDate = new Date(selectedPost.createdAt);
        const ago = getTimeAgo(postedDate);
        const isOwnPost = identity?.publicKey === selectedPost.authorPublicKey;
        
        // --- Escrow Roles ---
        const isAcceptedByMe = identity?.publicKey === (selectedPost as any).acceptedBy;
        const isPayer = (selectedPost.type === 'offer' && isAcceptedByMe) || (selectedPost.type === 'need' && isOwnPost);
        const isPayee = (selectedPost.type === 'offer' && isOwnPost) || (selectedPost.type === 'need' && isAcceptedByMe);
        const targetPeerCallsign = isOwnPost 
            ? (selectedPost.acceptedByCallsign || 'Peer') 
            : selectedPost.authorCallsign;

        return (
            <div className="p-4 max-w-lg mx-auto pb-24">
                {/* Post card */}
                <div className="bg-white dark:bg-nature-950 rounded-2xl border border-nature-200 dark:border-nature-800 shadow-soft overflow-hidden mb-4">
                    {/* Type + category header */}
                    <div 
                        className="flex justify-between items-center px-4 py-3 border-b"
                        style={{ backgroundColor: `${typeColor}15`, borderBottomColor: `${typeColor}30` }}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">{cat?.emoji ?? '🌐'}</span>
                            <span 
                                className="text-xs font-black uppercase tracking-wider"
                                style={{ color: typeColor }}
                            >
                                {selectedPost.type === 'offer' ? '🔵 Offer' : '🟠 Need'} <span className="text-nature-400 font-medium">·</span> {cat?.label ?? selectedPost.category}
                            </span>
                        </div>
                        <span className="text-xs font-semibold text-nature-500">{ago}</span>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                        <h2 className="text-xl font-bold text-nature-950 dark:text-white mb-3 leading-tight">
                            {selectedPost.title}
                        </h2>

                        {selectedPost.description && (
                            <p className="text-base text-nature-600 leading-relaxed mb-5 whitespace-pre-wrap">
                                {selectedPost.description}
                            </p>
                        )}

                        {/* Photos */}
                        {selectedPost.photos && selectedPost.photos.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto mb-5 pb-2 snap-x">
                                {selectedPost.photos.map((photo, i) => (
                                    <img
                                        key={i}
                                        src={photo}
                                        alt={`photo ${i+1}`}
                                        className="h-40 w-auto rounded-xl object-cover border border-nature-200 shrink-0 snap-start shadow-sm"
                                    />
                                ))}
                            </div>
                        )}

                        {/* Credits */}
                        <div className="bg-oat-50 dark:bg-nature-900 rounded-xl p-4 text-center border border-nature-100 dark:border-nature-800 shadow-inner block">
                            <span className="text-xs font-bold text-nature-500 dark:text-nature-400 uppercase tracking-widest block mb-1">
                                {selectedPost.type === 'offer' ? 'Asking Price' : 'Willing to Pay'}
                            </span>
                            <div className="text-3xl font-bold text-nature-900 dark:text-white font-mono tracking-tight">
                                {selectedPost.credits}<span className="text-xl text-nature-400 ml-1 font-sans font-medium">{
                                    { fixed: 'B', hourly: 'B/Hr', daily: 'B/Dy', weekly: 'B/Wk', monthly: 'B/Mo' }[selectedPost.priceType] || 'B'
                                }</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Author section */}
                <div className="bg-white dark:bg-nature-950 rounded-2xl border border-nature-200 dark:border-nature-800 p-4 shadow-sm mb-4">
                    <p className="text-[0.65rem] text-nature-400 dark:text-nature-500 font-bold uppercase tracking-widest mb-3">
                        Posted by
                    </p>
                    <div className="flex items-start gap-4">
                        {/* Avatar */}
                        {loadingProfile ? (
                            <div className="w-14 h-14 rounded-full bg-nature-100 animate-pulse shrink-0" />
                        ) : authorProfile?.avatar ? (
                            <img
                                src={authorProfile.avatar}
                                alt="avatar"
                                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm shrink-0"
                            />
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-terra-100 border-2 border-white shadow-sm flex items-center justify-center text-terra-600 font-bold text-xl shrink-0">
                                {selectedPost.authorCallsign.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-lg text-nature-950 dark:text-white mb-0.5 truncate flex items-center gap-1.5">
                                <span className="text-base text-amber-600">🤝</span> {selectedPost.authorCallsign}
                            </p>
                            {/* Star rating */}
                            <p className="text-amber-500 text-sm mb-1.5 flex items-center flex-wrap gap-1">
                                {'★'.repeat(Math.round(authorAvgRating.average))}{'☆'.repeat(5 - Math.round(authorAvgRating.average))}
                                <span className="text-nature-500 text-xs ml-1 font-medium">
                                    {authorAvgRating.count > 0 ? (
                                        <>
                                            {`${authorAvgRating.average.toFixed(1)} (${authorAvgRating.count})`}
                                            {authorAvgRating.asProvider && authorAvgRating.asProvider.count > 0 && (
                                                <span className="ml-2 text-[0.65rem] bg-amber-50 px-1.5 py-0.5 rounded text-amber-700">
                                                    📤 {authorAvgRating.asProvider.average.toFixed(1)}
                                                </span>
                                            )}
                                            {authorAvgRating.asReceiver && authorAvgRating.asReceiver.count > 0 && (
                                                <span className="ml-1 text-[0.65rem] bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-700">
                                                    📥 {authorAvgRating.asReceiver.average.toFixed(1)}
                                                </span>
                                            )}
                                        </>
                                    ) : 'No ratings yet'}
                                </span>
                            </p>
                            {authorProfile?.bio && (
                                <p className="text-sm text-nature-600 leading-snug mb-0">
                                    {authorProfile.bio}
                                </p>
                            )}
                            {authorProfile?.contact && authorProfile.contact.visibility !== 'hidden' && (
                                <p className="text-xs text-nature-500 mt-2 font-medium bg-oat-50 px-2 py-1 rounded-lg inline-block border border-nature-100">
                                    📧 {authorProfile.contact.value}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                 {/* Action buttons */}
                 
                 {/* 1. Pending Escrow State (Applies to both Payer and Payee) */}
                 {selectedPost.status === 'pending' && (isPayer || isPayee) && (
                     <div className="flex flex-col gap-2 mt-4">
                         {isPayer ? (
                             <>
                                 <p className="text-emerald-600 dark:text-emerald-400 text-sm font-bold text-center mb-1">
                                     ✅ Action Required: Release Credits
                                 </p>
                                 <p className="text-xs text-nature-500 text-center mb-2 px-4 shadow-sm">
                                     You are the Payer. Once {targetPeerCallsign} has fulfilled the terms, release the escrow to complete the transaction.
                                 </p>
                                 
                                 {showCompleteConfirm ? (
                                     <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 shadow-inner mt-2">
                                         <p className="font-bold text-emerald-900 dark:text-emerald-400 mb-2 text-center text-sm">
                                             Finalize Transaction
                                         </p>
                                         
                                         {selectedPost.priceType !== 'fixed' && (
                                             <div className="mb-3">
                                                 <label className="block text-xs font-bold text-emerald-700 dark:text-emerald-500 mb-1 uppercase tracking-wider">
                                                     ACTUAL { { hourly: 'HOURS', daily: 'DAYS', weekly: 'WEEKS', monthly: 'MONTHS' }[selectedPost.priceType] || 'UNITS' } WORKED
                                                 </label>
                                                 <input
                                                     type="number"
                                                     value={completeHours}
                                                     onChange={(e) => setCompleteHours(e.target.value)}
                                                     min="0.5"
                                                     step="0.5"
                                                     placeholder="e.g. 2.5"
                                                     className="w-full bg-white dark:bg-nature-900 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-nature-900 dark:text-white font-mono text-center focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                                                 />
                                             </div>
                                         )}
                                         
                                         <div className="text-center mb-4 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-white dark:bg-nature-900 py-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900 shadow-sm">
                                             {(() => {
                                                 const hrs = Number(completeHours) || 0;
                                                 const tot = selectedPost.priceType !== 'fixed' ? selectedPost.credits * hrs : selectedPost.credits;
                                                 return `Transferring ${tot} B to ${targetPeerCallsign}`;
                                             })()}
                                         </div>
                                         
                                         <div className="flex gap-2">
                                             <button
                                                 onClick={() => setShowCompleteConfirm(false)}
                                                 disabled={accepting}
                                                 className="flex-1 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors text-sm"
                                             >
                                                 Cancel
                                             </button>
                                             <button
                                                 onClick={async () => {
                                                     if (!identity || !selectedPost.pendingTransactionId) return;
                                                     setAccepting(true);
                                                     try {
                                                         const isVariable = selectedPost.priceType !== 'fixed';
                                                         const finalHours = isVariable ? Number(completeHours) : undefined;
                                                         await completeMarketplaceTransaction(selectedPost.pendingTransactionId, identity.publicKey, finalHours);
                                                         setSelectedPost(null);
                                                         setShowCompleteConfirm(false);
                                                         refresh();
                                                     } catch (e: any) {
                                                         setError(e.message || 'Failed to complete transaction');
                                                     } finally {
                                                         setAccepting(false);
                                                     }
                                                 }}
                                                 disabled={accepting || (selectedPost.priceType !== 'fixed' && (!completeHours || Number(completeHours) <= 0))}
                                                 className={`flex-1 py-2.5 rounded-lg font-bold text-white text-sm transition-all shadow-sm ${
                                                     accepting 
                                                         ? 'bg-emerald-400 cursor-not-allowed opacity-60' 
                                                         : 'bg-emerald-600 hover:bg-emerald-700'
                                                 }`}
                                             >
                                                 {accepting ? 'Processing...' : 'Release Credits'}
                                             </button>
                                         </div>
                                     </div>
                                 ) : (
                                     <button
                                         onClick={() => {
                                             setShowCompleteConfirm(true);
                                             if (selectedPost.priceType !== 'fixed' && !completeHours) {
                                                 setCompleteHours('1');
                                             }
                                         }}
                                         disabled={accepting}
                                         className={`w-full py-3.5 rounded-xl font-bold text-white text-[15px] transition-all shadow-md ${
                                             accepting ? 'bg-emerald-400 cursor-not-allowed opacity-60' : 'bg-emerald-500 hover:bg-emerald-600'
                                         }`}
                                     >
                                         {accepting ? 'Processing...' : '✅ Release Credits'}
                                     </button>
                                 )}
                             </>
                         ) : (
                             <>
                                 <p className="text-amber-500 text-sm font-semibold text-center mt-2 mb-2">
                                     ⏳ Pending Release by {targetPeerCallsign}
                                 </p>
                                 <p className="text-xs text-nature-500 text-center mb-2 px-4 shadow-sm">
                                     You are the Payee. Fulfill the terms exactly as agreed, and the Payer will release your credits.
                                 </p>
                             </>
                         )}
                         
                         <button
                             onClick={async () => {
                                 if (!identity || !selectedPost.pendingTransactionId) return;
                                 if (!confirm('Cancel this transaction and return the post to the market?')) return;
                                 setAccepting(true);
                                 try {
                                     await cancelMarketplaceTransaction(selectedPost.pendingTransactionId, identity.publicKey);
                                     setSelectedPost(null);
                                     refresh();
                                 } catch (e: any) {
                                     setError(e.message || 'Failed to cancel transaction');
                                 } finally {
                                     setAccepting(false);
                                 }
                             }}
                             disabled={accepting}
                             className={`w-full py-3 mt-2 rounded-xl border font-bold text-sm transition-colors ${
                                 accepting ? 'border-red-200 text-red-300 cursor-not-allowed' : 'border-red-300 text-red-500 hover:bg-red-50'
                             }`}
                         >
                             ❌ Cancel Escrow
                         </button>
                     </div>
                 )}

                {/* 1.5 Pending Requests (For Authors of Needs) */}
                {isOwnPost && selectedPost.type === 'need' && selectedPost.status === 'active' && requests.length > 0 && (
                    <div className="mt-4 bg-oat-50 dark:bg-nature-950 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3 shadow-sm">
                        <p className="font-bold text-amber-800 dark:text-amber-500 text-sm mb-2 text-center">
                            ✋ Pending Offers to Fulfill ({requests.length})
                        </p>
                        <div className="flex flex-col gap-2">
                            {requests.map(req => (
                                <div key={req.id} className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-lg p-3 flex flex-col shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-nature-900 dark:text-white text-sm">
                                                {req.sellerCallsign}
                                            </span>
                                            <span className="text-xs text-nature-500">
                                                {req.hours ? `${req.hours} hours estimated` : 'Offered to fulfill'}
                                            </span>
                                        </div>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm bg-emerald-50 dark:bg-emerald-900/40 px-2 py-0.5 rounded">
                                            {req.credits} B
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={async () => {
                                                if (!identity) return;
                                                setAccepting(true);
                                                try {
                                                    await rejectMarketplaceRequest(req.id, identity.publicKey);
                                                    setRequests(prev => prev.filter(r => r.id !== req.id));
                                                } catch (e: any) {
                                                    setError(e.message || 'Failed to reject offer');
                                                } finally {
                                                    setAccepting(false);
                                                }
                                            }}
                                            disabled={accepting}
                                            className="flex-1 py-1.5 rounded-md border border-nature-200 dark:border-nature-700 text-nature-600 dark:text-nature-400 font-bold text-xs hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/30 transition-colors"
                                        >
                                            Deny
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!identity) return;
                                                setAccepting(true);
                                                try {
                                                    await approveMarketplaceRequest(req.id, identity.publicKey);
                                                    const updated = await getMarketplacePosts({ id: selectedPost.id });
                                                    if (updated.length > 0) setSelectedPost(updated[0]);
                                                    refresh();
                                                } catch (e: any) {
                                                    setError(e.message || 'Failed to approve offer. Check your balance.');
                                                } finally {
                                                    setAccepting(false);
                                                }
                                            }}
                                            disabled={accepting}
                                            className="flex-1 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
                                        >
                                            Approve & Escrow
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. Unaccepted Posts Displayed to Browsers */}
                {!isOwnPost && selectedPost.status === 'active' && !isAcceptedByMe && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', gap: '0.5rem',
                        marginTop: '0.75rem',
                    }}>
                        {(() => {
                            const myRequest = requests.find(r => r.sellerPublicKey === identity?.publicKey);
                            if (myRequest) {
                                return (
                                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 shadow-sm text-center">
                                        <span className="text-4xl block mb-2">⏳</span>
                                        <p className="font-bold text-amber-800 dark:text-amber-500 mb-1">
                                            Offer Pending Approval
                                        </p>
                                        <p className="text-xs text-nature-600 dark:text-nature-400 mb-4">
                                            The author is reviewing your offer to fulfill this need.
                                        </p>
                                        <button
                                            onClick={async () => {
                                                if (!identity) return;
                                                setAccepting(true);
                                                try {
                                                    await cancelMarketplaceRequest(myRequest.id, identity.publicKey);
                                                    setRequests(prev => prev.filter(r => r.id !== myRequest.id));
                                                } catch (e: any) {
                                                    setError(e.message || 'Failed to cancel request');
                                                } finally {
                                                    setAccepting(false);
                                                }
                                            }}
                                            disabled={accepting}
                                            className="w-full py-2.5 rounded-lg border border-red-200 text-red-600 font-bold hover:bg-red-50 transition-colors text-sm"
                                        >
                                            {accepting ? 'Canceling...' : 'Cancel Offer'}
                                        </button>
                                    </div>
                                );
                            }

                            return showAcceptConfirm ? (
                            <div className="bg-oat-50 dark:bg-nature-950 border border-nature-200 dark:border-nature-800 rounded-xl p-4 shadow-inner mt-2">
                                <p className="font-bold text-nature-900 dark:text-white mb-2 text-center text-sm">
                                    {selectedPost.type === 'offer' ? 'Accept this Offer?' : 'Offer to Fulfill this Need?'}
                                </p>
                                
                                {selectedPost.priceType !== 'fixed' && (
                                    <div className="mb-3">
                                        <label className="block text-xs font-bold text-nature-600 dark:text-nature-400 mb-1 uppercase tracking-wider">
                                            ESTIMATED { { hourly: 'HOURS', daily: 'DAYS', weekly: 'WEEKS', monthly: 'MONTHS' }[selectedPost.priceType] || 'UNITS' }
                                        </label>
                                        <input
                                            type="number"
                                            value={acceptHours}
                                            onChange={(e) => setAcceptHours(e.target.value)}
                                            min="1"
                                            className="w-full bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-lg px-3 py-2 text-nature-900 dark:text-white font-mono text-center focus:ring-2 focus:ring-amber-400 focus:outline-none"
                                        />
                                        <p className="text-[10px] text-nature-500 mt-1 text-center">
                                            Credits will be reserved based on this estimate.
                                        </p>
                                    </div>
                                )}
                                
                                <div className="text-center mb-4 text-xs font-medium text-nature-700 dark:text-nature-300 bg-white dark:bg-nature-900 py-2 rounded-lg border border-nature-100 dark:border-nature-800">
                                    {(() => {
                                        const hrs = Number(acceptHours) || 0;
                                        const tot = selectedPost.priceType !== 'fixed' ? selectedPost.credits * hrs : selectedPost.credits;
                                        const actionText = selectedPost.type === 'offer' ? 'You will pay' : 'You will receive';
                                        return tot === 0 
                                            ? 'This is a free listing (0 B). No credits transferred.'
                                            : `${actionText} ${tot} B ${selectedPost.priceType !== 'fixed' ? `(${hrs} ${ { hourly: 'hr', daily: 'd', weekly: 'w', monthly: 'm' }[selectedPost.priceType] })` : ''} when completed.`;
                                    })()}
                                </div>
                                
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowAcceptConfirm(false)}
                                        disabled={accepting}
                                        className="flex-1 py-2.5 rounded-lg border border-nature-200 dark:border-nature-700 text-nature-600 dark:text-nature-300 font-bold hover:bg-nature-100 dark:hover:bg-nature-800 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!identity || !selectedPost) return;
                                            setAccepting(true);
                                            try {
                                                const isVariable = selectedPost.priceType !== 'fixed';
                                                const estimatedHours = isVariable ? Number(acceptHours) : undefined;
                                                const totalCredits = isVariable ? selectedPost.credits * (estimatedHours || 0) : selectedPost.credits;

                                                const remoteNode = (selectedPost as any)._remoteNode;
                                                if (remoteNode) {
                                                    const isOffer = selectedPost.type === 'offer';
                                                    if (totalCredits > 0) {
                                                        const from = isOffer ? identity.publicKey : selectedPost.authorPublicKey;
                                                        const to = isOffer ? selectedPost.authorPublicKey : identity.publicKey;
                                                        const memo = `${isOffer ? 'Accepted' : 'Fulfilled'}: ${selectedPost.title}`;
                                                        await sendRemoteTransfer(remoteNode, from, to, totalCredits, memo);
                                                    }
                                                    handleMessageAuthor();
                                                } else {
                                                    if (selectedPost.type === 'offer') {
                                                        await acceptMarketplacePost(selectedPost.id, identity.publicKey, estimatedHours);
                                                    } else {
                                                        await requestMarketplacePost(selectedPost.id, identity.publicKey, estimatedHours);
                                                    }
                                                    handleMessageAuthor();
                                                    refresh();
                                                }
                                                setShowAcceptConfirm(false);
                                            } catch (err) {
                                                alert(`Failed: ${(err as Error).message}`);
                                            } finally {
                                                setAccepting(false);
                                            }
                                        }}
                                        disabled={accepting || (selectedPost.priceType !== 'fixed' && (!acceptHours || Number(acceptHours) <= 0))}
                                        className={`flex-1 py-2.5 rounded-lg font-bold text-white text-sm transition-all shadow-sm ${
                                            accepting 
                                                ? 'bg-emerald-400 cursor-not-allowed opacity-60' 
                                                : 'bg-emerald-600 hover:bg-emerald-700'
                                        }`}
                                    >
                                        {accepting ? 'Processing...' : 'Confirm'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowAcceptConfirm(true)}
                                disabled={accepting}
                                className={`w-full py-3.5 rounded-xl font-bold text-white text-[15px] transition-all shadow-md ${
                                    accepting 
                                        ? 'bg-nature-400 cursor-not-allowed opacity-60'
                                        : selectedPost.type === 'offer' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-terra-600 hover:bg-terra-700'
                                }`}
                            >
                                 {accepting ? 'Processing...' : (selectedPost.type === 'offer' ? '🤝 Accept Offer' : '✋ Offer to Fulfill')}
                            </button>
                        );
                        })()}
                        
                    </div>
                )}
                
                {/* 3. Global Message Button (Visible to Non-Authors) */}
                {!isOwnPost && (
                    <div className="mt-2">
                        <button
                            onClick={handleMessageAuthor}
                            disabled={messaging}
                            className={`w-full py-3.5 mt-1 rounded-xl font-bold text-white text-[15px] transition-all shadow-md ${
                                messaging ? 'bg-nature-500 cursor-not-allowed opacity-60' : 'bg-nature-800 hover:bg-nature-900'
                            }`}
                        >
                            {messaging ? 'Opening chat...' : '💬 Message'}
                        </button>
                        
                        {/* Transaction-gated rating — only show on completed posts where user was a participant */}
                        {identity && selectedPost.status === 'completed' && selectedPost.pendingTransactionId && (
                            identity.publicKey === selectedPost.authorPublicKey || 
                            identity.publicKey === selectedPost.acceptedBy
                        ) && (() => {
                            const targetPubkey = identity.publicKey === selectedPost.authorPublicKey 
                                ? selectedPost.acceptedBy! 
                                : selectedPost.authorPublicKey;
                            const targetName = identity.publicKey === selectedPost.authorPublicKey
                                ? (selectedPost.acceptedByCallsign || 'them')
                                : selectedPost.authorCallsign;
                            // Determine role of target
                            const isOffer = selectedPost.type === 'offer';
                            const targetIsSeller = targetPubkey === selectedPost.authorPublicKey;
                            const targetRole = targetIsSeller 
                                ? (isOffer ? 'Provider' : 'Receiver')
                                : (isOffer ? 'Receiver' : 'Provider');
                            return (
                                <>
                                    <button
                                        onClick={() => setShowRatingForm(!showRatingForm)}
                                        className={`w-full py-3 mt-3 rounded-xl font-bold text-[14px] transition-all border ${
                                            showRatingForm 
                                                ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-500' 
                                                : 'bg-white dark:bg-nature-900 border-nature-200 dark:border-nature-800 text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-nature-800 shadow-sm'
                                        }`}
                                    >
                                        ⭐ Rate {targetName} as {targetRole}
                                    </button>

                                    {showRatingForm && (
                                        <div className="bg-oat-50 dark:bg-nature-950 border border-nature-200 dark:border-nature-800 rounded-xl p-4 mt-2 shadow-inner">
                                            <p className="text-sm text-nature-600 mb-3 text-center">
                                                How was <strong className="text-nature-900">{targetName}</strong> as a <strong className="text-nature-900">{targetRole}</strong>?
                                            </p>
                                            <div className="flex justify-center gap-2 mb-3">
                                                {[1, 2, 3, 4, 5].map(star => (
                                                    <button
                                                        key={star}
                                                        onClick={() => setMyRating(star)}
                                                        className={`text-4xl leading-none transition-transform focus:outline-none ${
                                                            star <= myRating ? 'text-amber-400 scale-110 drop-shadow-sm' : 'text-nature-300 scale-100'
                                                        }`}
                                                    >
                                                        {star <= myRating ? '★' : '☆'}
                                                    </button>
                                                ))}
                                            </div>
                                            <textarea
                                                value={ratingComment}
                                                onChange={(e) => setRatingComment(e.target.value)}
                                                placeholder="Leave a comment (optional)..."
                                                maxLength={200}
                                                className="w-full p-2.5 rounded-lg border border-nature-200 bg-white text-nature-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none mb-2"
                                                rows={2}
                                            />
                                            <button
                                                onClick={async () => {
                                                    if (!identity || !selectedPost || myRating < 1 || !selectedPost.pendingTransactionId) return;
                                                    setSubmittingRating(true);
                                                    try {
                                                        await submitRating(identity.publicKey, targetPubkey, myRating, ratingComment, selectedPost.pendingTransactionId);
                                                        const fresh = await getMemberRatings(targetPubkey);
                                                        setAuthorAvgRating({ average: fresh.average, count: fresh.count });
                                                        setShowRatingForm(false);
                                                        setRatingComment('');
                                                        setMyRating(0);
                                                    } catch (e: any) {
                                                        alert(e.message || 'Failed to submit rating');
                                                    } finally {
                                                        setSubmittingRating(false);
                                                    }
                                                }}
                                                disabled={myRating < 1 || submittingRating}
                                                className={`w-full py-2.5 rounded-lg font-bold text-sm text-white transition-colors ${
                                                    myRating >= 1 ? 'bg-amber-500 hover:bg-amber-600 shadow-sm' : 'bg-nature-300 cursor-not-allowed'
                                                }`}
                                            >
                                                {submittingRating ? 'Submitting...' : myRating < 1 ? 'Tap stars to rate' : `Submit ${myRating}⭐ Rating`}
                                            </button>
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                        <button
                            onClick={() => setShowReportForm(!showReportForm)}
                            className="w-full py-2.5 mt-3 rounded-xl border border-nature-200 bg-transparent text-nature-500 font-semibold text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                        >
                            🚩 Report
                        </button>

                        {showReportForm && (
                            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mt-2 shadow-inner">
                                <select
                                    value={reportReason}
                                    onChange={(e) => setReportReason(e.target.value)}
                                    className="w-full p-2.5 rounded-lg bg-white border border-red-200 text-nature-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 cursor-pointer mb-2"
                                >
                                    <option value="">Select a reason...</option>
                                    <option value="Spam or scam">Spam or scam</option>
                                    <option value="Offensive content">Offensive content</option>
                                    <option value="Misleading post">Misleading post</option>
                                    <option value="Harassment">Harassment</option>
                                    <option value="Other">Other</option>
                                </select>
                                <button
                                    onClick={async () => {
                                        if (!identity || !selectedPost || !reportReason) return;
                                        setSubmittingReport(true);
                                        try {
                                            await reportAbuse(identity.publicKey, selectedPost.authorPublicKey, reportReason, selectedPost.id);
                                            alert('Report submitted. The admin will review it.');
                                            setShowReportForm(false);
                                            setReportReason('');
                                        } catch (e: any) {
                                            alert(e.message || 'Failed to submit report');
                                        } finally {
                                            setSubmittingReport(false);
                                        }
                                    }}
                                    disabled={!reportReason || submittingReport}
                                    className={`w-full py-2.5 rounded-lg font-bold text-sm text-white transition-colors ${
                                        reportReason ? 'bg-red-600 hover:bg-red-700 shadow-sm' : 'bg-nature-300 cursor-not-allowed'
                                    }`}
                                >
                                    {submittingReport ? 'Sending...' : 'Submit Report'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {isOwnPost && selectedPost.status !== 'pending' && (
                    <div className="flex flex-col gap-2 mt-4">
                        {!editMode ? (
                            <>
                                <button
                                    onClick={() => {
                                        setEditType(selectedPost.type);
                                        setEditCategory(selectedPost.category);
                                        setEditTitle(selectedPost.title);
                                        setEditDescription(selectedPost.description);
                                        setEditCredits(selectedPost.credits);
                                        setEditPhotos(selectedPost.photos || []);
                                        setEditMode(true);
                                    }}
                                    className="w-full py-3.5 rounded-xl bg-terra-500 hover:bg-terra-600 font-bold text-white text-[15px] transition-all shadow-md"
                                >
                                    ✏️ Edit Post
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!identity || !selectedPost) return;
                                        if (!confirm('Delete this post?')) return;
                                        setDeleting(selectedPost.id);
                                        try {
                                            await removeMarketplacePost(selectedPost.id, identity.publicKey);
                                            setSelectedPost(null);
                                            refresh();
                                        } catch (e: any) {
                                            setError(e.message || 'Failed to delete');
                                        } finally {
                                            setDeleting(null);
                                        }
                                    }}
                                    disabled={deleting === selectedPost.id}
                                    className={`w-full py-3 rounded-xl border font-bold text-sm transition-colors mt-2 ${
                                        deleting === selectedPost.id ? 'border-red-200 text-red-300 cursor-not-allowed' : 'border-red-300 text-red-500 hover:bg-red-50'
                                    }`}
                                >
                                    {deleting === selectedPost.id ? 'Deleting...' : '🗑️ Delete Post'}
                                </button>
                            </>
                        ) : (
                            <div className="bg-white dark:bg-nature-950 border border-nature-200 dark:border-nature-800 rounded-2xl p-5 shadow-sm">
                                <h3 className="font-bold text-lg text-nature-950 dark:text-white mb-4 tracking-tight">✏️ Edit Post</h3>

                                {/* Type */}
                                <div className="flex gap-2 mb-4">
                                    {(['offer', 'need'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setEditType(t)}
                                            className={`flex-1 py-2.5 rounded-xl border text-sm font-bold capitalize transition-colors ${
                                                editType === t
                                                    ? (t === 'offer' ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-orange-600 border-orange-600 text-white shadow-sm')
                                                    : 'bg-white dark:bg-nature-900 border-nature-200 dark:border-nature-800 text-nature-500 dark:text-nature-400 hover:bg-oat-50 dark:hover:bg-nature-800'
                                            }`}
                                        >
                                            {t === 'offer' ? '🔵 Offer' : '🟠 Need'}
                                        </button>
                                    ))}
                                </div>

                                {/* Category */}
                                <select
                                    value={editCategory}
                                    onChange={(e) => setEditCategory(e.target.value)}
                                    className="w-full mb-3 py-3 px-4 rounded-xl border border-nature-200 bg-white text-nature-900 text-[15px] focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm appearance-auto cursor-pointer"
                                    style={inputStyle}
                                >
                                    {MARKETPLACE_CATEGORIES.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>
                                    ))}
                                </select>

                                {/* Title */}
                                <input
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Title"
                                    className="w-full mb-3 py-3 px-4 rounded-xl border border-nature-200 bg-white text-nature-900 text-[15px] focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm"
                                    style={inputStyle}
                                />

                                {/* Description */}
                                <textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="Description"
                                    className="w-full mb-3 py-3 px-4 rounded-xl border border-nature-200 bg-white text-nature-900 text-[15px] focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm min-h-[100px] resize-y"
                                    style={{ ...inputStyle, minHeight: '100px' }}
                                />

                                {/* Credits */}
                                <input
                                    type="number"
                                    value={editCredits}
                                    onChange={(e) => setEditCredits(Number(e.target.value) || 0)}
                                    placeholder="Credits (B)"
                                    className="w-full mb-4 py-3 px-4 rounded-xl border border-nature-200 bg-white text-nature-900 text-[15px] focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm"
                                    style={inputStyle}
                                />

                                {/* Photos */}
                                <div className="mb-5">
                                    <p className="text-xs font-bold text-nature-400 uppercase tracking-widest mb-2">Photos ({editPhotos.length}/3)</p>
                                    <div className="flex gap-2 flex-wrap">
                                        {editPhotos.map((photo, i) => (
                                            <div key={i} className="relative">
                                                <img src={photo} alt={`photo ${i+1}`} className="w-16 h-16 object-cover rounded-xl border border-nature-200 shadow-sm" />
                                                <button
                                                    onClick={() => setEditPhotos(editPhotos.filter((_, j) => j !== i))}
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 border-none text-white text-[10px] flex items-center justify-center cursor-pointer shadow-sm hover:bg-red-600 transition-colors"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                        {editPhotos.length < 3 && (
                                            <label className="w-16 h-16 rounded-xl border-2 border-dashed border-nature-300 flex items-center justify-center cursor-pointer text-nature-400 text-2xl hover:bg-nature-50 hover:border-nature-400 transition-colors">
                                                +
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        const reader = new FileReader();
                                                        reader.onload = () => {
                                                            const img = new Image();
                                                            img.onload = () => {
                                                                const canvas = document.createElement('canvas');
                                                                const max = 800;
                                                                let w = img.width, h = img.height;
                                                                if (w > max || h > max) {
                                                                    if (w > h) { h = Math.round(h * max / w); w = max; }
                                                                    else { w = Math.round(w * max / h); h = max; }
                                                                }
                                                                canvas.width = w; canvas.height = h;
                                                                canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
                                                                setEditPhotos([...editPhotos, canvas.toDataURL('image/jpeg', 0.7)]);
                                                            };
                                                            img.src = reader.result as string;
                                                        };
                                                        reader.readAsDataURL(file);
                                                        e.target.value = '';
                                                    }}
                                                />
                                            </label>
                                        )}
                                    </div>
                                </div>

                                {/* Save/Cancel */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditMode(false)}
                                        className="flex-1 py-3 is-bold rounded-xl border border-nature-300 text-nature-600 bg-white hover:bg-nature-50 transition-colors text-[15px] font-bold shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!identity || !selectedPost || !editTitle.trim()) return;
                                            setSaving(true);
                                            try {
                                                const result = await updateMarketplacePost(selectedPost.id, identity.publicKey, {
                                                    type: editType,
                                                    category: editCategory,
                                                    title: editTitle.trim(),
                                                    description: editDescription.trim(),
                                                    credits: editCredits,
                                                    photos: editPhotos,
                                                });
                                                setSelectedPost(result.post);
                                                setEditMode(false);
                                                refresh();
                                            } catch (e: any) {
                                                setError(e.message || 'Failed to save');
                                            } finally {
                                                setSaving(false);
                                            }
                                        }}
                                        disabled={saving || !editTitle.trim()}
                                        className={`flex-1 py-3 rounded-xl font-bold text-white text-[15px] transition-colors shadow-sm ${
                                            saving || !editTitle.trim() ? 'bg-nature-300 cursor-not-allowed' : 'bg-terra-500 hover:bg-terra-600'
                                        }`}
                                    >
                                        {saving ? 'Saving...' : '💾 Save'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-4 text-red-600 text-sm text-center shadow-sm">
                        {error}
                    </div>
                )}
            </div>
        );
    }

    // =================== LIST VIEW ===================
    return (
        <div className="px-3 pt-2 pb-24 max-w-lg mx-auto">
            {/* Radius Picker Full Screen */}
            {showRadiusPicker && (
                <RadiusPickerPage
                    initial={radiusSettings}
                    defaultRadius={nodeConfig?.serviceRadius?.radiusKm}
                    onApply={(settings) => {
                        setRadiusSettings(settings);
                        saveRadiusSettings(settings);
                        setShowRadiusPicker(false);
                    }}
                    onCancel={() => setShowRadiusPicker(false)}
                    onReset={() => {
                        setRadiusSettings(null);
                        clearRadiusSettings();
                        setShowRadiusPicker(false);
                    }}
                />
            )}

            {/* Top Segmented Control (Feed vs Deals) */}
            <div className="flex bg-nature-100 dark:bg-nature-800 rounded-xl p-1 mb-3 shadow-inner">
                <button
                    onClick={() => setActiveTab('feed')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
                        activeTab === 'feed'
                            ? 'bg-white dark:bg-nature-900 text-nature-900 dark:text-white shadow-sm'
                            : 'text-nature-500 hover:text-nature-700 dark:hover:text-nature-300'
                    }`}
                >
                    Global Feed
                </button>
                <button
                    onClick={() => setActiveTab('deals')}
                    className={`flex-1 flex gap-2 items-center justify-center py-2 text-sm font-bold rounded-lg transition-all ${
                        activeTab === 'deals'
                            ? 'bg-white dark:bg-nature-900 text-nature-900 dark:text-white shadow-sm'
                            : 'text-nature-500 hover:text-nature-700 dark:hover:text-nature-300'
                    }`}
                >
                    <span>My Market</span>
                    {pendingDealsCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
                            {pendingDealsCount}
                        </span>
                    )}
                </button>
            </div>

            {/* ── Compact Top Header ── */}
            <div className="mb-2">
                {/* Search + Primary Actions */}
                <div className="flex gap-2 items-center">
                    <div className="flex-1 relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm opacity-40 pointer-events-none text-nature-500 dark:text-nature-400">🔍</span>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search..."
                            className="w-full py-2.5 pl-10 pr-4 rounded-full border border-nature-200 dark:border-nature-800 bg-white dark:bg-nature-900 text-nature-900 dark:text-white text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm transition-all hover:shadow-md"
                        />
                    </div>
                    
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        title="Toggle Filters"
                        className={`w-10 h-10 rounded-full flex-shrink-0 border flex items-center justify-center transition-colors hover:shadow-md ${
                            showFilters ? 'bg-nature-800 dark:bg-white text-white dark:text-nature-950 border-nature-900 dark:border-white shadow-inner' : 'bg-white dark:bg-nature-900 border-nature-200 dark:border-nature-800 text-nature-600 dark:text-nature-400 hover:bg-oat-50 shadow-sm'
                        }`}
                    >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                        </svg>
                    </button>
                    
                    <button
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                        className="w-10 h-10 rounded-full flex-shrink-0 border bg-white dark:bg-nature-900 border-nature-200 dark:border-nature-800 text-nature-600 dark:text-nature-400 hover:bg-oat-50 dark:hover:bg-nature-800 transition-colors shadow-sm flex items-center justify-center text-md hover:shadow-md"
                        title={viewMode === 'grid' ? "Switch to List View" : "Switch to Grid View"}
                    >
                        {viewMode === 'grid' ? '☰' : '⊞'}
                    </button>
                </div>

                {/* Collapsible Filters Panel */}
                {showFilters && (
                    <div className="mt-4 bg-oat-50/50 dark:bg-nature-900/40 rounded-[24px] border border-nature-200 dark:border-nature-800 p-4 shadow-inner animate-in slide-in-from-top-2 duration-200">
                        <div className="flex gap-2 items-center mb-4">
                            <div className={`flex-1 flex rounded-xl border shadow-sm transition-colors ${
                                radiusSettings ? 'bg-amber-100 dark:bg-amber-900/60 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400' : 'bg-white dark:bg-nature-900 border-nature-200 dark:border-nature-800 text-nature-600 dark:text-nature-400'
                            }`}>
                                <button
                                    onClick={() => setShowRadiusPicker(true)}
                                    title={radiusSettings ? `${radiusSettings.radiusKm}km radius` : 'Set radius'}
                                    className={`flex-1 py-2.5 px-3 flex items-center justify-center gap-2 text-sm font-bold rounded-l-xl ${!radiusSettings ? 'rounded-r-xl px-4' : ''}`}
                                >
                                    <span>📍</span> {radiusSettings ? `${radiusSettings.radiusKm}km Radius` : 'Location Radius'}
                                </button>
                                {radiusSettings && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setRadiusSettings(null);
                                            clearRadiusSettings();
                                        }}
                                        className="px-3 flex items-center justify-center border-l bg-amber-100 dark:bg-transparent border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-r-xl transition-colors font-bold text-amber-700 dark:text-amber-400"
                                        title="Clear Radius"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className={`flex-1 py-2.5 px-4 rounded-xl appearance-auto cursor-pointer text-sm font-bold shadow-sm border transition-colors ${
                                    categoryFilter !== 'all' ? 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300' : 'bg-white dark:bg-nature-900 border-nature-200 dark:border-nature-800 text-nature-600 dark:text-nature-400'
                                }`}
                            >
                                <option value="all">🏷️ All Categories</option>
                                {MARKETPLACE_CATEGORIES.map((cat) => (
                                    <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Connected Communities — multi-toggle */}
                        {peerNodes.length > 0 && (
                            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
                                <span className="px-3 py-1.5 rounded-lg border-2 border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-black uppercase tracking-widest whitespace-nowrap inline-flex items-center shadow-sm">
                                    🏠 Internal
                                </span>
                                {peerNodes.map(peer => {
                                    const isOn = enabledPeers.has(peer.publicUrl);
                                    return (
                                        <button
                                            key={peer.publicUrl}
                                            onClick={() => { setEnabledPeers(togglePeer(enabledPeers, peer.publicUrl)); }}
                                            className={`px-3 py-1.5 rounded-lg border-2 text-xs font-bold cursor-pointer whitespace-nowrap transition-all shadow-sm ${
                                                isOn ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300' : 'border-nature-200 dark:border-nature-800 bg-white/50 dark:bg-nature-950/50 text-nature-500 dark:text-nature-400'
                                            }`}
                                        >
                                            {isOn ? '🌐' : '○'} {peer.callsign}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Type filter chips */}
                        <div className="flex w-full gap-2 items-center pb-1">
                            {(['all', 'offer', 'need'] as const).map((t) => {
                                const isSelected = typeFilter === t;
                                let activeStyles = 'bg-nature-800 border-nature-900 text-white';
                                if (t === 'offer') activeStyles = 'bg-emerald-600 border-emerald-700 text-white';
                                if (t === 'need') activeStyles = 'bg-terra-600 border-terra-700 text-white';

                                return (
                                    <button
                                        key={t}
                                        onClick={() => setTypeFilter(t)}
                                        className={`${t === 'all' ? 'px-3' : 'flex-1'} py-2 rounded-xl border text-[11px] sm:text-xs font-bold text-center truncate shadow-sm transition-colors ${
                                            isSelected ? activeStyles : 'bg-white dark:bg-nature-950 border-nature-200 dark:border-nature-800 text-nature-500 dark:text-nature-400'
                                        }`}
                                    >
                                        {t === 'all' ? 'All' : t === 'offer' ? '🟢 Offers' : '🟠 Needs'}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setShowMine(!showMine)}
                                className={`flex-[1.2] px-1 py-2 rounded-xl border text-[11px] sm:text-xs font-bold text-center truncate shadow-sm transition-colors ${
                                    showMine ? 'bg-purple-600 border-purple-700 text-white' : 'bg-white dark:bg-nature-950 border-nature-200 dark:border-nature-800 text-nature-500 dark:text-nature-400'
                                }`}
                            >
                                👤 My Listings
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-600 text-sm text-center shadow-sm">
                    {error}
                </div>
            )}

            {/* Posts */}
            {loading ? (
                <p className="text-nature-500 text-center py-8">Loading...</p>
            ) : (() => {
                let filtered = posts;
                
                if (activeTab === 'deals') {
                    filtered = myMarketPosts;
                } else if (showMine && identity) {
                    filtered = posts.filter(p => p.authorPublicKey === identity.publicKey);
                } else {
                    filtered = posts.filter(p => p.status === 'active');
                }

                // Text search
                if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase().trim();
                    filtered = filtered.filter(p =>
                        p.title.toLowerCase().includes(q) ||
                        p.description.toLowerCase().includes(q)
                    );
                }

                // Radius filter
                if (radiusSettings) {
                    filtered = filtered.filter(p => {
                        if (p.lat == null || p.lng == null) return false;
                        const dist = haversineDistance(radiusSettings.lat, radiusSettings.lng, p.lat, p.lng);
                        return dist <= radiusSettings.radiusKm;
                    });
                }

                return filtered.length === 0 ? (
                    <div className="bg-white dark:bg-nature-950 border border-nature-200 dark:border-nature-800 rounded-3xl p-10 mt-6 text-center shadow-soft">
                        <div className="text-5xl opacity-30 mb-4">
                            {searchQuery.trim() ? '🔍' : radiusSettings ? '📍' : showMine ? '👤' : '🛒'}
                        </div>
                        <h4 className="font-bold text-lg text-nature-900 dark:text-white mb-2">No items found</h4>
                        <p className="text-nature-500 dark:text-nature-400 text-sm">
                            {searchQuery.trim() ? `No matches for "${searchQuery}".`
                                : radiusSettings ? 'Expand your radius to see more posts.'
                                : showMine ? 'You haven\'t added any posts yet.'
                                : 'The market is quiet right now. Post an offer!'}
                        </p>
                    </div>
                ) : (
                    <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3 pb-32' : 'flex flex-col gap-5 pb-32'}>
                        {filtered.map((post) => (
                            <div key={post.id} onClick={() => setSelectedPost(post)} className="h-full">
                                <MarketplaceCard
                                    post={post as any}
                                    authorRating={authorRatingsCache[post.authorPublicKey]}
                                    remoteNode={(post as any)._remoteNode}
                                    viewMode={viewMode}
                                />
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* Floating 'Add Offer/Need' Button */}
            {!selectedPost && (
                <button
                    onClick={() => onNavigate?.('map-post')}
                    className="fixed bottom-[90px] right-4 z-50 flex items-center justify-center gap-1.5 px-4 py-3 bg-gradient-to-r from-terra-500 to-terra-600 hover:from-terra-600 hover:to-terra-700 text-white font-bold rounded-full shadow-[0_6px_20px_rgb(203,83,38,0.35)] hover:shadow-[0_8px_25px_rgb(203,83,38,0.45)] transition-all hover:-translate-y-1 group text-sm"
                >
                    <span className="text-lg leading-none block group-hover:rotate-90 transition-transform duration-300">+</span> ADD POST
                </button>
            )}
        </div>
    );
}

function getTimeAgo(date: Date): string {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
