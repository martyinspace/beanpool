/**
 * MarketplaceCard — Needs & Offers display card
 */

import { MARKETPLACE_CATEGORIES, POST_TYPE_COLORS, type MarketplacePost } from '../lib/marketplace';

interface Props {
    post: MarketplacePost;
    authorRating?: { average: number; count: number };
    remoteNode?: string; // e.g. "https://sydney.beanpool.org"
    onTrade?: (post: MarketplacePost) => void;
}

export function MarketplaceCard({ post, authorRating, remoteNode, onTrade }: Props) {
    const categoryConfig = MARKETPLACE_CATEGORIES.find((c) => c.id === post.category);
    const typeColor = POST_TYPE_COLORS[post.type];

    // Extract node callsign from URL for display
    const nodeBadge = remoteNode
        ? remoteNode.replace(/^https?:\/\//, '').replace(/\.beanpool\.org.*$/, '').replace(/:\d+$/, '')
        : null;

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: `1px solid ${typeColor}33`,
            borderLeft: `3px solid ${typeColor}`,
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '0.75rem',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            cursor: 'pointer',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.4rem' }}>{categoryConfig?.emoji ?? '🌐'}</span>
                    <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            {post.title}
                        </h3>
                        <span style={{
                            display: 'inline-block',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            color: typeColor,
                            letterSpacing: '0.05em',
                            marginTop: '0.2rem',
                        }}>
                            {post.type === 'offer' ? '🔵 Offer' : '🟠 Need'}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span style={{
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                    }}>
                        {post.credits}Ʀ
                    </span>
                    {nodeBadge && (
                        <span style={{
                            fontSize: '0.6rem', fontWeight: 600,
                            background: 'rgba(99,102,241,0.15)',
                            color: '#818cf8',
                            padding: '0.15rem 0.4rem', borderRadius: '9999px',
                            border: '1px solid rgba(99,102,241,0.3)',
                            whiteSpace: 'nowrap',
                        }}>
                            🌐 {nodeBadge}
                        </span>
                    )}
                </div>
            </div>

            {/* Primary photo */}
            {post.photos && post.photos.length > 0 && (
                <img
                    src={post.photos[0]}
                    alt="post"
                    style={{
                        width: '100%', aspectRatio: '16/9', objectFit: 'cover',
                        borderRadius: '8px', marginTop: '0.5rem',
                        background: '#1a1a1a',
                    }}
                />
            )}

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                {post.description}
            </p>

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '0.75rem',
            }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    🤝 {post.authorCallsign}
                    {authorRating && (
                        <span style={{ marginLeft: '0.4rem', color: '#fbbf24', fontSize: '0.7rem' }}>
                            {'🫘'.repeat(Math.round(authorRating.average))}{'○'.repeat(5 - Math.round(authorRating.average))}
                        </span>
                    )}
                </span>
                {onTrade && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onTrade(post); }}
                        style={{
                            background: typeColor,
                            color: 'var(--text-primary)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.4rem 1rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        {post.type === 'offer' ? 'Accept Offer' : 'Fulfill Need'}
                    </button>
                )}
            </div>
        </div>
    );
}
