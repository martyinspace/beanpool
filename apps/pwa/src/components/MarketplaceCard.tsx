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
    viewMode?: 'grid' | 'list';
}

export function MarketplaceCard({ post, authorRating, remoteNode, viewMode = 'grid' }: Props) {
    const categoryConfig = MARKETPLACE_CATEGORIES.find((c) => c.id === post.category);
    const typeColor = POST_TYPE_COLORS[post.type];
    const emoji = categoryConfig?.emoji ?? '📦';

    const nodeBadge = remoteNode
        ? remoteNode.replace(/^https?:\/\//, '').replace(/\.beanpool\.org.*$/, '').replace(/:\d+$/, '')
        : null;

    const hasPhoto = post.photos && post.photos.length > 0;

    const isList = viewMode === 'list';

    const isGrid = viewMode === 'grid';

    return (
        <div
            className={`bg-white dark:bg-nature-950 overflow-hidden cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl dark:shadow-2xl dark:shadow-black/40 border border-nature-100/50 dark:border-nature-800 flex flex-col h-full
                ${isGrid ? 'rounded-[20px] p-3' : 'rounded-[28px] p-4'}
            `}
        >
            {/* Top Handle: Author + Title + Rating */}
            <div className={`flex justify-between items-start ${isGrid ? 'mb-2' : 'mb-3'}`}>
                <div className={`flex items-center overflow-hidden ${isGrid ? 'gap-2' : 'gap-3'}`}>
                    <div className={`${isGrid ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'} rounded-full bg-terra-100 dark:bg-nature-800 shrink-0 flex items-center justify-center text-terra-700 dark:text-terra-400 font-bold shadow-inner`}>
                        {post.authorCallsign.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col truncate">
                        <span className={`font-black uppercase text-nature-500 dark:text-nature-400 tracking-wider truncate ${isGrid ? 'text-[9px]' : 'text-[10px]'}`}>
                            {post.authorCallsign}
                        </span>
                        <span className={`font-bold text-nature-950 dark:text-white truncate ${isGrid ? 'text-xs' : 'text-sm'}`}>
                            {post.title}
                        </span>
                    </div>
                </div>

                <div className={`flex items-center shrink-0 bg-oat-50 dark:bg-nature-900 rounded-lg ${isGrid ? 'gap-0.5 px-1.5 py-0.5' : 'gap-1 px-2 py-1'}`}>
                    {!isGrid && <span className="text-xs font-bold text-nature-900 dark:text-white">{authorRating && authorRating.average > 0 ? authorRating.average.toFixed(1) : 'New'}</span>}
                    {!isGrid && <span className="text-nature-400 dark:text-nature-500 text-[10px]">★</span>}
                    <span className={isGrid ? 'text-xs my-0.5' : 'ml-1 text-sm'}>{emoji}</span>
                </div>
            </div>

            {/* Image Area */}
            {hasPhoto ? (
                <div className={`relative w-full rounded-[20px] overflow-hidden shadow-sm ${isGrid ? 'h-[110px] mb-3' : 'h-[180px] mb-4'}`}>
                    <img src={post.photos![0]} alt={post.title} className="w-full h-full object-cover" />

                    {/* Status Overlays */}
                    <div className={`absolute left-2 flex flex-col gap-1 items-start ${isGrid ? 'top-1.5' : 'top-2'}`}>
                        {post.status === 'pending' && (
                            <span className={`font-bold bg-amber-400 text-amber-950 rounded-lg shadow-sm ${isGrid ? 'text-[0.6rem] px-1.5 py-0.5' : 'text-[0.65rem] px-2 py-1'}`}>
                                ⏳ PENDING
                            </span>
                        )}
                        {nodeBadge && (
                            <span className={`font-bold bg-indigo-500/90 text-white backdrop-blur-sm rounded-lg shadow-sm ${isGrid ? 'text-[0.6rem] px-1.5 py-0.5' : 'text-[0.65rem] px-2 py-1'}`}>
                                🌐 {nodeBadge}
                            </span>
                        )}
                    </div>

                    {/* Price Overlay */}
                    <div className={`absolute right-2 bg-nature-900/90 backdrop-blur-md text-white font-bold tracking-tight shadow-md ${isGrid ? 'bottom-2 px-2.5 py-1 rounded-lg text-sm' : 'bottom-3 right-3 px-4 py-1.5 rounded-xl'}`}>
                        {post.credits} <span className="text-[10px] font-normal opacity-80">{
                            { fixed: 'B', hourly: 'B/hr', daily: 'B/d', weekly: 'B/w', monthly: 'B/m' }[post.priceType] || 'B'
                        }</span>
                    </div>
                </div>
            ) : (
                <div className={`relative w-full rounded-[20px] bg-oat-50 dark:bg-nature-900 flex items-center justify-center shadow-inner ${isGrid ? 'h-[80px] mb-3' : 'h-[100px] mb-4'}`}>
                    <span className={`${isGrid ? 'text-3xl' : 'text-4xl'} opacity-20`}>{emoji}</span>
                    <div className={`absolute right-2 bg-nature-900/90 backdrop-blur-md text-white font-bold tracking-tight shadow-md ${isGrid ? 'bottom-2 px-2.5 py-1 rounded-lg text-sm' : 'bottom-3 right-3 px-4 py-1.5 rounded-xl'}`}>
                        {post.credits} <span className="text-[10px] font-normal opacity-80">{
                            { fixed: 'B', hourly: 'B/hr', daily: 'B/d', weekly: 'B/w', monthly: 'B/m' }[post.priceType] || 'B'
                        }</span>
                    </div>
                </div>
            )}

            {/* Body Text */}
            <p className={`text-nature-600 dark:text-nature-400 leading-relaxed px-1 flex-1 ${isGrid ? 'text-[11px] line-clamp-1 mb-3' : 'text-sm line-clamp-2 mb-4'}`}>
                {post.description || "No description provided."}
            </p>

            {/* Action Button */}
            <div
                className={`w-full rounded-full font-bold tracking-widest text-center transition-colors shadow-sm ${isGrid ? 'py-2 text-[10px] mt-auto' : 'py-3.5 text-[13px]'} ${post.type === 'offer'
                        ? 'bg-terra-500 text-white hover:bg-terra-600'
                        : 'bg-nature-700 text-white dark:bg-nature-800 hover:bg-nature-800'
                    }`}
            >
                {post.type === 'offer' ? (isGrid ? 'VIEW' : 'VIEW OFFER') : (isGrid ? 'VIEW' : 'VIEW REQUEST')}
            </div>
        </div>
    );
}
