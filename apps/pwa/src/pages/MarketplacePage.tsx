/**
 * MarketplacePage — Browse & Post Needs & Offers
 *
 * Fetches real posts from the BeanPool Node API.
 * Users can create new posts and filter by type/category.
 */

import { useState, useEffect, useCallback } from 'react';
import { MARKETPLACE_CATEGORIES, type PostType } from '../lib/marketplace';
import { MarketplaceCard } from '../components/MarketplaceCard';
import { getMarketplacePosts, createMarketplacePost, type MarketplacePost } from '../lib/api';
import { loadIdentity } from '../lib/identity';

export function MarketplacePage() {
    const [posts, setPosts] = useState<MarketplacePost[]>([]);
    const [typeFilter, setTypeFilter] = useState<PostType | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    async function handleCreate() {
        if (!newTitle.trim()) return;
        setCreating(true);
        try {
            const identity = await loadIdentity();
            if (!identity) {
                setError('No identity found. Please create one first.');
                return;
            }
            await createMarketplacePost({
                type: newType,
                category: newCategory,
                title: newTitle.trim(),
                description: newDescription.trim(),
                credits: Number(newCredits) || 0,
                authorPublicKey: identity.publicKey,
            });
            setShowCreate(false);
            setNewTitle('');
            setNewDescription('');
            setNewCredits('');
            await refresh();
        } catch (e: any) {
            setError(e.message || 'Failed to create post');
        } finally {
            setCreating(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.6rem', borderRadius: '8px',
        border: '1px solid #444', background: '#0f0f0f',
        color: '#e0e0e0', fontSize: '0.9rem', marginBottom: '0.5rem',
        fontFamily: 'inherit', boxSizing: 'border-box',
    };

    return (
        <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                    🤝 Marketplace
                </h2>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    style={{
                        padding: '0.5rem 1rem', borderRadius: '10px',
                        background: showCreate ? '#333' : '#2563eb', color: '#fff',
                        border: 'none', fontSize: '0.85rem', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
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
                    <MarketplaceCard
                        key={post.id}
                        post={post as any}
                        onTrade={(p) => console.log('Trade initiated with', p.authorCallsign)}
                    />
                ))
            )}
        </div>
    );
}
