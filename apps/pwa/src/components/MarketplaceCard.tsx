/**
 * MarketplaceCard — Needs & Offers display card
 */

import { MARKETPLACE_CATEGORIES, POST_TYPE_COLORS, type MarketplacePost } from '../lib/marketplace';

interface Props {
    post: MarketplacePost;
    onTrade?: (post: MarketplacePost) => void;
}

export function MarketplaceCard({ post, onTrade }: Props) {
    const categoryConfig = MARKETPLACE_CATEGORIES.find((c) => c.id === post.category);
    const typeColor = POST_TYPE_COLORS[post.type];

    return (
        <div style={{
            background: '#1a1a1a',
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
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', margin: 0 }}>
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
                <span style={{
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: '#fff',
                    fontFamily: 'monospace',
                }}>
                    {post.credits}Ʀ
                </span>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#aaa', marginTop: '0.5rem', lineHeight: 1.5 }}>
                {post.description}
            </p>

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '0.75rem',
            }}>
                <span style={{ fontSize: '0.8rem', color: '#666' }}>
                    🤝 {post.authorCallsign}
                </span>
                {onTrade && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onTrade(post); }}
                        style={{
                            background: typeColor,
                            color: '#fff',
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
