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
    getMarketplacePosts, createMarketplacePost,
    getMemberProfile, createConversationApi,
    type MarketplacePost, type MemberProfile,
} from '../lib/api';
import { loadIdentity, type BeanPoolIdentity } from '../lib/identity';

interface Props {
    identity: BeanPoolIdentity | null;
    onNavigate?: (tab: string, conversationId?: string) => void;
}

export function MarketplacePage({ identity, onNavigate }: Props) {
    const [posts, setPosts] = useState<MarketplacePost[]>([]);
    const [typeFilter, setTypeFilter] = useState<PostType | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Detail view
    const [selectedPost, setSelectedPost] = useState<MarketplacePost | null>(null);
    const [authorProfile, setAuthorProfile] = useState<MemberProfile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [messaging, setMessaging] = useState(false);

    // Create form
    const [newType, setNewType] = useState<PostType>('offer');
    const [newCategory, setNewCategory] = useState('services');
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newCredits, setNewCredits] = useState('');
    const [creating, setCreating] = useState(false);

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

    // Load author profile when detail view opens
    useEffect(() => {
        if (!selectedPost) return;
        setLoadingProfile(true);
        setAuthorProfile(null);
        getMemberProfile(selectedPost.authorPublicKey, identity?.publicKey)
            .then(p => setAuthorProfile(p))
            .catch(() => setAuthorProfile(null))
            .finally(() => setLoadingProfile(false));
    }, [selectedPost?.id]);

    async function handleCreate() {
        const id = await loadIdentity();
        if (!id || !newTitle.trim()) return;
        setCreating(true);
        try {
            await createMarketplacePost({
                type: newType,
                category: newCategory,
                title: newTitle.trim(),
                description: newDescription.trim(),
                credits: parseFloat(newCredits) || 0,
                authorPublicKey: id.publicKey,
            });
            setNewTitle('');
            setNewDescription('');
            setNewCredits('');
            setShowCreate(false);
            await refresh();
        } catch (e: any) {
            setError(e.message || 'Failed to create post');
        } finally {
            setCreating(false);
        }
    }

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
                            onClick={() => alert('Report feature coming soon.')}
                            style={{
                                width: '100%', padding: '0.6rem', borderRadius: '12px',
                                background: 'transparent', color: '#666', border: '1px solid #333',
                                fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            🚩 Report
                        </button>
                    </div>
                )}

                {isOwnPost && (
                    <div style={{
                        background: '#1a1a1a', borderRadius: '12px',
                        border: '1px solid #333', padding: '0.75rem',
                        marginTop: '0.75rem', textAlign: 'center',
                        color: '#666', fontSize: '0.85rem',
                    }}>
                        This is your post
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
                    onClick={() => setShowCreate(!showCreate)}
                    style={{
                        padding: '0.4rem 0.8rem', borderRadius: '8px',
                        background: showCreate ? '#333' : '#2563eb',
                        border: 'none', color: '#fff', fontSize: '0.8rem',
                        fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    {showCreate ? '✕ Cancel' : '＋ New Post'}
                </button>
            </div>

            {/* Create Form */}
            {showCreate && (
                <div style={{
                    background: '#1a1a1a', border: '1px solid #333',
                    borderRadius: '12px', padding: '1rem', marginBottom: '1rem',
                }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        {(['offer', 'need'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setNewType(t)}
                                style={{
                                    flex: 1, padding: '0.5rem', borderRadius: '8px',
                                    border: `1px solid ${t === 'offer' ? '#3b82f6' : '#f97316'}`,
                                    background: newType === t ? (t === 'offer' ? '#3b82f6' : '#f97316') : 'transparent',
                                    color: newType === t ? '#fff' : '#aaa',
                                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                {t === 'offer' ? '🔵 Offer' : '🟠 Need'}
                            </button>
                        ))}
                    </div>
                    <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        style={inputStyle}
                    >
                        {MARKETPLACE_CATEGORIES.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</option>
                        ))}
                    </select>
                    <input type="text" placeholder="Title" value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)} style={inputStyle} />
                    <textarea placeholder="Description (optional)" value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        rows={3}
                        style={{ ...inputStyle, resize: 'vertical' }} />
                    <input type="number" placeholder="Credits (Ʀ)" value={newCredits}
                        onChange={(e) => setNewCredits(e.target.value)} min="0" step="0.01" style={inputStyle} />
                    <button
                        onClick={handleCreate}
                        disabled={creating || !newTitle.trim()}
                        style={{
                            width: '100%', padding: '0.7rem', borderRadius: '8px',
                            background: creating ? '#555' : '#10b981', color: '#fff',
                            border: 'none', fontSize: '0.9rem', fontWeight: 600,
                            cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        {creating ? 'Posting...' : 'Post to Marketplace'}
                    </button>
                </div>
            )}

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

            {/* Type filter */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {(['all', 'offer', 'need'] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        style={{
                            padding: '0.4rem 0.8rem', borderRadius: '9999px',
                            border: `1px solid ${t === 'offer' ? '#3b82f6' : t === 'need' ? '#f97316' : '#555'}`,
                            background: typeFilter === t ? (t === 'offer' ? '#3b82f6' : t === 'need' ? '#f97316' : '#333') : 'transparent',
                            color: typeFilter === t ? '#fff' : '#aaa',
                            fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                            fontFamily: 'inherit', textTransform: 'capitalize',
                        }}
                    >
                        {t === 'all' ? 'All' : t === 'offer' ? '🔵 Offers' : '🟠 Needs'}
                    </button>
                ))}
            </div>

            {/* Category chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
                <button
                    onClick={() => setCategoryFilter('all')}
                    style={{
                        padding: '0.3rem 0.6rem', borderRadius: '8px',
                        border: '1px solid #444',
                        background: categoryFilter === 'all' ? '#333' : 'transparent',
                        color: '#ccc', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    All
                </button>
                {MARKETPLACE_CATEGORIES.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => setCategoryFilter(cat.id)}
                        style={{
                            padding: '0.3rem 0.6rem', borderRadius: '8px',
                            border: '1px solid #444',
                            background: categoryFilter === cat.id ? '#333' : 'transparent',
                            color: '#ccc', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        {cat.emoji} {cat.label}
                    </button>
                ))}
            </div>

            {/* Posts */}
            {loading ? (
                <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>Loading...</p>
            ) : posts.length === 0 ? (
                <div style={{
                    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
                    padding: '2rem', textAlign: 'center', color: '#555', fontSize: '0.9rem',
                }}>
                    No posts yet. Be the first to post!
                </div>
            ) : (
                posts.map((post) => (
                    <div key={post.id} onClick={() => setSelectedPost(post)}>
                        <MarketplaceCard
                            post={post as any}
                            onTrade={(p) => setSelectedPost(p as any)}
                        />
                    </div>
                ))
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
