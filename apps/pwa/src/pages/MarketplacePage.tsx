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
import {
    getMarketplacePosts, removeMarketplacePost,
    getMemberProfile, createConversationApi,
    submitRating, getMemberRatings, reportAbuse,
    type MarketplacePost, type MemberProfile,
} from '../lib/api';
import { type BeanPoolIdentity } from '../lib/identity';

interface Props {
    identity: BeanPoolIdentity | null;
    onNavigate?: (tab: string, conversationId?: string) => void;
}

export function MarketplacePage({ identity, onNavigate }: Props) {
    const [posts, setPosts] = useState<MarketplacePost[]>([]);
    const [typeFilter, setTypeFilter] = useState<PostType | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
    const [loading, setLoading] = useState(true);
    const [showMine, setShowMine] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Detail view
    const [selectedPost, setSelectedPost] = useState<MarketplacePost | null>(null);
    const [authorProfile, setAuthorProfile] = useState<MemberProfile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [messaging, setMessaging] = useState(false);

    // Ratings
    const [authorAvgRating, setAuthorAvgRating] = useState<{ average: number; count: number }>({ average: 0, count: 0 });
    const [myRating, setMyRating] = useState(0);
    const [ratingComment, setRatingComment] = useState('');
    const [showRatingForm, setShowRatingForm] = useState(false);
    const [submittingRating, setSubmittingRating] = useState(false);

    // Report
    const [showReportForm, setShowReportForm] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [submittingReport, setSubmittingReport] = useState(false);

    // Author ratings cache for tiles
    const [authorRatingsCache, setAuthorRatingsCache] = useState<Record<string, { average: number; count: number }>>({}); 

    const refresh = useCallback(async () => {
        try {
            const filter: any = {};
            if (typeFilter !== 'all') filter.type = typeFilter;
            if (categoryFilter !== 'all') filter.category = categoryFilter;
            const data = await getMarketplacePosts(filter);
            setPosts(data);
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [typeFilter, categoryFilter]);

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
            .then(r => setAuthorAvgRating({ average: r.average, count: r.count }))
            .catch(() => {});
    }, [selectedPost?.id]);

    async function handleMessageAuthor() {
        if (!identity || !selectedPost) return;
        setMessaging(true);
        try {
            const result = await createConversationApi(
                'dm',
                [identity.publicKey, selectedPost.authorPublicKey],
                identity.publicKey,
            );
            if (onNavigate) onNavigate('messages', result.conversation.id);
        } catch (e: any) {
            setError(e.message || 'Failed to start conversation');
        } finally {
            setMessaging(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.5rem', background: '#0f0f0f',
        border: '1px solid #333', borderRadius: '8px', color: '#fff',
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

        return (
            <div style={{ padding: '1rem' }}>
                {/* Back button */}
                <button
                    onClick={() => setSelectedPost(null)}
                    style={{
                        background: 'none', border: 'none', color: '#2563eb',
                        fontSize: '0.9rem', cursor: 'pointer', padding: '0.25rem 0',
                        fontFamily: 'inherit', marginBottom: '0.75rem',
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                    }}
                >
                    ← Back to Market
                </button>

                {/* Post card */}
                <div style={{
                    background: '#1a1a1a', borderRadius: '16px',
                    border: `1px solid ${typeColor}44`,
                    overflow: 'hidden',
                }}>
                    {/* Type + category header */}
                    <div style={{
                        background: `${typeColor}15`, padding: '0.75rem 1rem',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        borderBottom: `1px solid ${typeColor}33`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.3rem' }}>{cat?.emoji ?? '🌐'}</span>
                            <span style={{
                                fontSize: '0.75rem', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                color: typeColor,
                            }}>
                                {selectedPost.type === 'offer' ? '🔵 Offer' : '🟠 Need'} · {cat?.label ?? selectedPost.category}
                            </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>{ago}</span>
                    </div>

                    {/* Content */}
                    <div style={{ padding: '1rem' }}>
                        <h2 style={{
                            fontSize: '1.25rem', fontWeight: 700, color: '#fff',
                            margin: '0 0 0.5rem',
                        }}>
                            {selectedPost.title}
                        </h2>

                        {selectedPost.description && (
                            <p style={{
                                fontSize: '0.9rem', color: '#bbb', lineHeight: 1.6,
                                margin: '0 0 1rem', whiteSpace: 'pre-wrap',
                            }}>
                                {selectedPost.description}
                            </p>
                        )}

                        {/* Photos */}
                        {selectedPost.photos && selectedPost.photos.length > 0 && (
                            <div style={{
                                display: 'flex', gap: '0.5rem', overflowX: 'auto',
                                marginBottom: '1rem', paddingBottom: '0.25rem',
                            }}>
                                {selectedPost.photos.map((photo, i) => (
                                    <img
                                        key={i}
                                        src={photo}
                                        alt={`photo ${i+1}`}
                                        style={{
                                            height: '140px', borderRadius: '10px',
                                            objectFit: 'cover', flexShrink: 0,
                                            border: '1px solid #333',
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Credits */}
                        <div style={{
                            background: '#0f0f0f', borderRadius: '12px',
                            padding: '0.75rem 1rem', textAlign: 'center',
                            marginBottom: '1rem',
                        }}>
                            <span style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.25rem' }}>
                                {selectedPost.type === 'offer' ? 'Asking' : 'Willing to pay'}
                            </span>
                            <span style={{
                                fontSize: '1.8rem', fontWeight: 700, color: '#fff',
                                fontFamily: 'monospace',
                            }}>
                                {selectedPost.credits}<span style={{ fontSize: '1.2rem', color: '#888' }}>Ʀ</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Author section */}
                <div style={{
                    background: '#1a1a1a', borderRadius: '16px',
                    border: '1px solid #333', padding: '1rem',
                    marginTop: '0.75rem',
                }}>
                    <p style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
                        Posted by
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {/* Avatar */}
                        {loadingProfile ? (
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: '#333', flexShrink: 0,
                            }} />
                        ) : authorProfile?.avatar ? (
                            <img
                                src={authorProfile.avatar}
                                alt="avatar"
                                style={{
                                    width: '48px', height: '48px', borderRadius: '50%',
                                    objectFit: 'cover', border: '2px solid #333', flexShrink: 0,
                                }}
                            />
                        ) : (
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: '#2563eb', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: '1.2rem', color: '#fff',
                                fontWeight: 700, flexShrink: 0,
                            }}>
                                {selectedPost.authorCallsign.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: '0 0 0.15rem' }}>
                                🤝 {selectedPost.authorCallsign}
                            </p>
                            {/* Bean rating */}
                            <p style={{ fontSize: '0.8rem', color: '#fbbf24', margin: '0 0 0.15rem' }}>
                                {'🫘'.repeat(Math.round(authorAvgRating.average))}{'○'.repeat(5 - Math.round(authorAvgRating.average))}
                                <span style={{ color: '#888', marginLeft: '0.35rem' }}>
                                    {authorAvgRating.count > 0 ? `${authorAvgRating.average}/5 (${authorAvgRating.count})` : 'No ratings yet'}
                                </span>
                            </p>
                            {authorProfile?.bio && (
                                <p style={{ fontSize: '0.8rem', color: '#888', margin: 0, lineHeight: 1.4 }}>
                                    {authorProfile.bio}
                                </p>
                            )}
                            {authorProfile?.contact && authorProfile.contact.visibility !== 'hidden' && (
                                <p style={{ fontSize: '0.75rem', color: '#666', margin: '0.25rem 0 0' }}>
                                    📧 {authorProfile.contact.value}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action buttons */}
                {!isOwnPost && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', gap: '0.5rem',
                        marginTop: '0.75rem',
                    }}>
                        <button
                            onClick={handleMessageAuthor}
                            disabled={messaging}
                            style={{
                                width: '100%', padding: '0.85rem', borderRadius: '12px',
                                background: '#2563eb', color: '#fff', border: 'none',
                                fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                                fontFamily: 'inherit', opacity: messaging ? 0.6 : 1,
                            }}
                        >
                            {messaging ? 'Opening chat...' : '💬 Message'}
                        </button>
                        <button
                            onClick={() => {
                                // TODO: Trade proposal flow
                                alert(`Trade proposal coming soon!\n\nFor now, use 💬 Message to coordinate with ${selectedPost.authorCallsign}.`);
                            }}
                            style={{
                                width: '100%', padding: '0.85rem', borderRadius: '12px',
                                background: typeColor, color: '#fff', border: 'none',
                                fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            {selectedPost.type === 'offer' ? '🤝 Accept Offer' : '🤝 Fulfill Need'}
                        </button>
                        <button
                            onClick={() => setShowRatingForm(!showRatingForm)}
                            style={{
                                width: '100%', padding: '0.7rem', borderRadius: '12px',
                                background: showRatingForm ? '#92400e' : '#1a1a1a',
                                color: showRatingForm ? '#fbbf24' : '#fbbf24',
                                border: '1px solid #333',
                                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            🫘 Rate {selectedPost.authorCallsign}
                        </button>

                        {showRatingForm && (
                            <div style={{
                                background: '#1a1a1a', borderRadius: '12px',
                                border: '1px solid #333', padding: '1rem',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button
                                            key={star}
                                            onClick={() => setMyRating(star)}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                fontSize: '1.8rem', padding: '0.1rem',
                                                color: star <= myRating ? '#fbbf24' : '#444',
                                                transition: 'transform 0.15s',
                                                transform: star <= myRating ? 'scale(1.15)' : 'scale(1)',
                                            }}
                                        >
                                            🫘
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={ratingComment}
                                    onChange={(e) => setRatingComment(e.target.value)}
                                    placeholder="Leave a comment (optional)..."
                                    maxLength={200}
                                    style={{
                                        width: '100%', padding: '0.6rem', borderRadius: '8px',
                                        border: '1px solid #444', background: '#0f0f0f',
                                        color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit',
                                        minHeight: '60px', resize: 'none', outline: 'none',
                                        marginBottom: '0.5rem', boxSizing: 'border-box',
                                    }}
                                />
                                <button
                                    onClick={async () => {
                                        if (!identity || !selectedPost || myRating < 1) return;
                                        setSubmittingRating(true);
                                        try {
                                            await submitRating(identity.publicKey, selectedPost.authorPublicKey, myRating, ratingComment);
                                            const fresh = await getMemberRatings(selectedPost.authorPublicKey);
                                            setAuthorAvgRating({ average: fresh.average, count: fresh.count });
                                            setShowRatingForm(false);
                                            setRatingComment('');
                                        } catch (e: any) {
                                            alert(e.message || 'Failed to submit rating');
                                        } finally {
                                            setSubmittingRating(false);
                                        }
                                    }}
                                    disabled={myRating < 1 || submittingRating}
                                    style={{
                                        width: '100%', padding: '0.6rem', borderRadius: '8px',
                                        background: myRating >= 1 ? '#2563eb' : '#333',
                                        color: '#fff', border: 'none', fontSize: '0.85rem',
                                        fontWeight: 600, cursor: myRating >= 1 ? 'pointer' : 'not-allowed',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    {submittingRating ? 'Submitting...' : myRating < 1 ? 'Tap beans to rate' : `Submit ${myRating}🫘 Rating`}
                                </button>
                            </div>
                        )}

                        <button
                            onClick={() => setShowReportForm(!showReportForm)}
                            style={{
                                width: '100%', padding: '0.6rem', borderRadius: '12px',
                                background: 'transparent', color: '#666', border: '1px solid #333',
                                fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            🚩 Report
                        </button>

                        {showReportForm && (
                            <div style={{
                                background: '#1a1a1a', borderRadius: '12px',
                                border: '1px solid #333', padding: '1rem',
                            }}>
                                <select
                                    value={reportReason}
                                    onChange={(e) => setReportReason(e.target.value)}
                                    style={{
                                        width: '100%', padding: '0.6rem', borderRadius: '8px',
                                        background: '#0f0f0f', border: '1px solid #444',
                                        color: '#ccc', fontSize: '0.85rem', fontFamily: 'inherit',
                                        cursor: 'pointer', marginBottom: '0.5rem',
                                    }}
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
                                    style={{
                                        width: '100%', padding: '0.6rem', borderRadius: '8px',
                                        background: reportReason ? '#dc2626' : '#333',
                                        color: '#fff', border: 'none', fontSize: '0.85rem',
                                        fontWeight: 600, cursor: reportReason ? 'pointer' : 'not-allowed',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    {submittingReport ? 'Sending...' : 'Submit Report'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {isOwnPost && (
                    <div style={{
                        display: 'flex', gap: '0.5rem', flexDirection: 'column',
                        marginTop: '0.75rem',
                    }}>
                        <div style={{
                            background: '#1a1a1a', borderRadius: '12px',
                            border: '1px solid #333', padding: '0.75rem',
                            textAlign: 'center',
                            color: '#666', fontSize: '0.85rem',
                        }}>
                            This is your post
                        </div>
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
                            style={{
                                width: '100%', padding: '0.7rem', borderRadius: '12px',
                                background: deleting === selectedPost.id ? '#555' : '#dc2626',
                                color: '#fff', border: 'none',
                                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            {deleting === selectedPost.id ? 'Deleting...' : '🗑️ Delete Post'}
                        </button>
                    </div>
                )}

                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '10px', padding: '0.75rem', marginTop: '0.75rem',
                        color: '#ef4444', fontSize: '0.85rem', textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}
            </div>
        );
    }

    // =================== LIST VIEW ===================
    return (
        <div style={{ padding: '1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: 0 }}>🤝 Marketplace</h2>
                <button
                    onClick={() => onNavigate?.('map-post')}
                    style={{
                        padding: '0.4rem 0.8rem', borderRadius: '8px',
                        background: '#2563eb',
                        border: 'none', color: '#fff', fontSize: '0.8rem',
                        fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    ＋ New Post
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem',
                    color: '#ef4444', fontSize: '0.85rem', textAlign: 'center',
                }}>
                    {error}
                </div>
            )}

            {/* Filters: type buttons + Mine + category dropdown on one row */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {(['all', 'offer', 'need'] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => { setTypeFilter(t); setShowMine(false); }}
                        style={{
                            padding: '0.4rem 0.8rem', borderRadius: '9999px',
                            border: `1px solid ${t === 'offer' ? '#3b82f6' : t === 'need' ? '#f97316' : '#555'}`,
                            background: !showMine && typeFilter === t ? (t === 'offer' ? '#3b82f6' : t === 'need' ? '#f97316' : '#333') : 'transparent',
                            color: !showMine && typeFilter === t ? '#fff' : '#aaa',
                            fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                            fontFamily: 'inherit', textTransform: 'capitalize',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {t === 'all' ? 'All' : t === 'offer' ? '🔵 Offers' : '🟠 Needs'}
                    </button>
                ))}
                <button
                    onClick={() => setShowMine(!showMine)}
                    style={{
                        padding: '0.4rem 0.8rem', borderRadius: '9999px',
                        border: '1px solid #a855f7',
                        background: showMine ? '#a855f7' : 'transparent',
                        color: showMine ? '#fff' : '#aaa',
                        fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                >
                    👤 Mine
                </button>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{
                        flex: 1, padding: '0.4rem 0.5rem', borderRadius: '9999px',
                        background: categoryFilter !== 'all' ? '#333' : '#1a1a1a',
                        border: '1px solid #555', color: '#ccc',
                        fontSize: '0.8rem', fontFamily: 'inherit', cursor: 'pointer',
                        appearance: 'auto', minWidth: '100px',
                    }}
                >
                    <option value="all">All Categories</option>
                    {MARKETPLACE_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>
                    ))}
                </select>
            </div>

            {/* Posts */}
            {loading ? (
                <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>Loading...</p>
            ) : (() => {
                const filtered = showMine && identity
                    ? posts.filter(p => p.authorPublicKey === identity.publicKey)
                    : posts;
                return filtered.length === 0 ? (
                    <div style={{
                        background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
                        padding: '2rem', textAlign: 'center', color: '#555', fontSize: '0.9rem',
                    }}>
                        {showMine ? 'You haven\'t posted anything yet.' : 'No posts yet. Be the first to post!'}
                    </div>
                ) : (
                    filtered.map((post) => (
                        <div key={post.id} onClick={() => setSelectedPost(post)}>
                            <MarketplaceCard
                                post={post as any}
                                authorRating={authorRatingsCache[post.authorPublicKey]}
                                onTrade={(p) => setSelectedPost(p as any)}
                            />
                        </div>
                    ))
                );
            })()
            }
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
