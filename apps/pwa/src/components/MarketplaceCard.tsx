/**
 * MarketplaceCard — FB Marketplace-style image-dominant tile
 *
 * Designed for a 2-column CSS grid:
 *  - Square photo (1:1 aspect ratio) fills the top
 *  - Price + title below in compact text
 *  - Category emoji badge overlaid on the image
 *  - Remote node badge if from a peer
 */

import { MARKETPLACE_CATEGORIES, POST_TYPE_COLORS, type MarketplacePost } from '../lib/marketplace';

interface Props {
    post: MarketplacePost;
    authorRating?: { average: number; count: number };
    remoteNode?: string;
    onTrade?: (post: MarketplacePost) => void;
}

export function MarketplaceCard({ post, authorRating, remoteNode }: Props) {
    const categoryConfig = MARKETPLACE_CATEGORIES.find((c) => c.id === post.category);
    const typeColor = POST_TYPE_COLORS[post.type];
    const emoji = categoryConfig?.emoji ?? '📦';

    const nodeBadge = remoteNode
        ? remoteNode.replace(/^https?:\/\//, '').replace(/\.beanpool\.org.*$/, '').replace(/:\d+$/, '')
        : null;

    const hasPhoto = post.photos && post.photos.length > 0;

    return (
        <div style={{
            background: '#0f0f0f',
            borderRadius: '12px',
            overflow: 'hidden',
            cursor: 'pointer',
            border: '1px solid #1a1a1a',
            transition: 'transform 0.12s ease',
        }}>
            {/* Image area */}
            <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1/1',
                background: '#1a1a1a',
                overflow: 'hidden',
            }}>
                {hasPhoto ? (
                    <img
                        src={post.photos![0]}
                        alt={post.title}
                        style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                ) : (
                    /* No photo — show large emoji */
                    <div style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '3rem', opacity: 0.4,
                    }}>
                        {emoji}
                    </div>
                )}

                {/* Type indicator — top-left colored dot */}
                <div style={{
                    position: 'absolute', top: '0.4rem', left: '0.4rem',
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: typeColor,
                    boxShadow: `0 0 6px ${typeColor}`,
                }} />

                {/* Category badge — top-right */}
                <span style={{
                    position: 'absolute', top: '0.35rem', right: '0.35rem',
                    fontSize: '0.95rem',
                    background: 'rgba(0,0,0,0.6)',
                    borderRadius: '6px', padding: '0.15rem 0.3rem',
                    lineHeight: 1,
                }}>
                    {emoji}
                </span>

                {/* Remote node badge — bottom-left */}
                {nodeBadge && (
                    <span style={{
                        position: 'absolute', bottom: '0.35rem', left: '0.35rem',
                        fontSize: '0.55rem', fontWeight: 600,
                        background: 'rgba(99,102,241,0.85)',
                        color: '#fff',
                        padding: '0.15rem 0.35rem', borderRadius: '4px',
                        whiteSpace: 'nowrap',
                    }}>
                        🌐 {nodeBadge}
                    </span>
                )}
            </div>

            {/* Text area — compact */}
            <div style={{ padding: '0.4rem 0.5rem 0.5rem' }}>
                {/* Price */}
                <div style={{
                    fontSize: '0.85rem', fontWeight: 700,
                    color: '#e5e5e5', fontFamily: 'monospace',
                    lineHeight: 1.2,
                }}>
                    {post.credits}Ʀ
                </div>

                {/* Title */}
                <div style={{
                    fontSize: '0.75rem', color: '#999',
                    lineHeight: 1.3, marginTop: '0.15rem',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                }}>
                    {post.title}
                </div>

                {/* Author + rating — tiny */}
                <div style={{
                    fontSize: '0.6rem', color: '#555',
                    marginTop: '0.2rem',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {post.authorCallsign}
                    {authorRating && authorRating.count > 0 && (
                        <span style={{ marginLeft: '0.3rem', color: '#fbbf24' }}>
                            {'★'.repeat(Math.round(authorRating.average))}{'☆'.repeat(5 - Math.round(authorRating.average))}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
