import { useState, useEffect } from 'react';
import { getMemberProfile, getMemberRatings, getMarketplacePosts, type MemberProfile, type Rating, type MarketplacePost } from '../lib/api';
import { type BeanPoolIdentity } from '../lib/identity';
import { resolveAvatarUrl } from '../lib/avatar';

interface Props {
    identity: BeanPoolIdentity;
    pubkey: string;
    onBack: () => void;
    onMessage: (pubkey: string) => void;
    onNavigatePost: (postId: string) => void;
}

export function PublicProfilePage({ identity, pubkey, onBack, onMessage, onNavigatePost }: Props) {
    const [profile, setProfile] = useState<MemberProfile | null>(null);
    const [ratings, setRatings] = useState<Rating[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [activePosts, setActivePosts] = useState<MarketplacePost[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            getMemberProfile(pubkey, identity.publicKey).catch(() => null),
            getMemberRatings(pubkey).catch(() => null),
            getMarketplacePosts({ author: pubkey }).catch(() => [])
        ]).then(([prof, rat, posts]) => {
            if (prof) setProfile(prof);
            if (rat) {
                setStats({ average: rat.average, count: rat.count, asProvider: rat.asProvider, asReceiver: rat.asReceiver });
                setRatings(rat.ratings || []);
            }
            if (posts) {
                setActivePosts(posts.filter(p => p.status === 'active'));
            }
            setLoading(false);
        });
    }, [pubkey, identity.publicKey]);

    const renderStars = (avg: number) => {
        const rounded = Math.round(avg || 0);
        return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
    };

    const initial = profile?.callsign?.charAt(0).toUpperCase() || '?';
    const avatarResolved = resolveAvatarUrl(profile?.avatar);

    return (
        <div className="fixed inset-0 bg-nature-100 dark:bg-black z-50 overflow-y-auto animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="sticky top-0 bg-nature-100/90 dark:bg-black/90 backdrop-blur-md border-b border-nature-200 dark:border-nature-800 p-4 flex items-center justify-between z-10">
                <button onClick={onBack} className="text-nature-500 dark:text-nature-400 font-bold hover:text-nature-900 dark:hover:text-white transition-colors bg-transparent border-none cursor-pointer flex items-center gap-1">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>
                <div className="font-bold text-nature-900 dark:text-white text-lg">Trust Profile</div>
                <div className="w-[60px]"></div>
            </div>

            <div className="max-w-[480px] mx-auto pb-20">
                {/* Banner Profile */}
                <div className="flex flex-col items-center p-8 border-b border-nature-200 dark:border-nature-800">
                    <div className="w-24 h-24 rounded-full mb-4 border-4 border-nature-200 dark:border-nature-800 overflow-hidden bg-oat-100 dark:bg-nature-900 flex items-center justify-center shadow-lg">
                        {avatarResolved ? (
                            <img src={avatarResolved} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-4xl font-bold text-nature-400 dark:text-nature-500">{initial}</span>
                        )}
                    </div>
                    
                    <div className="text-2xl font-black text-nature-900 dark:text-white flex items-center gap-2">
                        {profile?.callsign || 'Loading...'}
                        <span className="text-emerald-500">✓</span>
                    </div>
                    
                    <div className="text-xs text-nature-400 dark:text-nature-500 font-mono bg-nature-200/50 dark:bg-nature-900 px-2 py-1 rounded mt-1">
                        {pubkey.slice(0, 16)}...
                    </div>

                    {profile?.bio && (
                        <div className="mt-4 text-sm text-nature-600 dark:text-nature-300 italic text-center max-w-sm">
                            "{profile.bio}"
                        </div>
                    )}

                    {pubkey !== identity.publicKey && (
                        <button 
                            onClick={() => onMessage(pubkey)}
                            className="mt-6 bg-emerald-600 hover:bg-emerald-500 text-white border-none rounded-xl px-6 py-2.5 font-bold cursor-pointer shadow-sm transition-transform active:scale-95 flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            Send Message
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="flex justify-center p-12">
                        <div className="w-8 h-8 rounded-full border-4 border-nature-200 dark:border-nature-800 border-t-emerald-500 animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {/* Stats grid */}
                        {stats && stats.count > 0 && (
                            <div className="grid grid-cols-3 gap-3 p-4">
                                <div className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-xl p-3 flex flex-col items-center justify-center shadow-sm">
                                    <div className="text-amber-500 text-sm mb-1">{renderStars(stats.average)}</div>
                                    <div className="text-xl font-black text-nature-900 dark:text-white">{stats.average.toFixed(1)}</div>
                                    <div className="text-[10px] font-bold text-nature-400 dark:text-nature-500 uppercase mt-1">Overall</div>
                                </div>
                                <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3 flex flex-col items-center justify-center shadow-sm">
                                    <div className="text-sm mb-1">📤</div>
                                    <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">{stats.asProvider?.average.toFixed(1) || '-'}</div>
                                    <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 uppercase mt-1">As Provider</div>
                                </div>
                                <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 flex flex-col items-center justify-center shadow-sm">
                                    <div className="text-sm mb-1">📥</div>
                                    <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">{stats.asReceiver?.average.toFixed(1) || '-'}</div>
                                    <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-500 uppercase mt-1">As Payer</div>
                                </div>
                            </div>
                        )}

                        {/* Active Posts list */}
                        {activePosts.length > 0 && (
                            <div className="p-4 pt-0">
                                <h3 className="text-nature-900 dark:text-white font-bold text-lg mb-3 ml-1">Active Listings ({activePosts.length})</h3>
                                <div className="flex flex-col gap-3">
                                    {activePosts.map((p, i) => {
                                        let coverImage: string | null = null;
                                        if (p.photos) {
                                            try { 
                                                const arr = Array.isArray(p.photos) ? p.photos : JSON.parse(p.photos); 
                                                if (arr.length > 0) coverImage = arr[0]; 
                                            } catch {}
                                        }

                                        return (
                                            <button 
                                                key={p.id || i}
                                                onClick={() => { onBack(); onNavigatePost(p.id); }}
                                                className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-xl p-3 text-left cursor-pointer hover:-translate-y-0.5 transition-transform shadow-sm"
                                            >
                                                <div className="flex gap-3">
                                                    {coverImage ? (
                                                        <img src={coverImage} alt="cover" className="w-14 h-14 rounded-lg object-cover bg-nature-100 dark:bg-nature-800" />
                                                    ) : (
                                                        <div className="w-14 h-14 rounded-lg bg-nature-100 dark:bg-nature-800 flex items-center justify-center text-2xl opacity-50">
                                                            📦
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                                p.type === 'offer' 
                                                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                                                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                                            }`}>
                                                                {p.type?.toUpperCase()}
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="font-black text-sm text-indigo-600 dark:text-indigo-400">{p.credits ?? '?'}</span>
                                                                <span className="text-[10px]">🫘</span>
                                                            </div>
                                                        </div>
                                                        <div className="font-bold text-nature-900 dark:text-white text-sm truncate">{p.title}</div>
                                                        <div className="text-xs text-nature-400 font-medium mt-0.5">Active</div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Reviews list */}
                        <div className="p-4 pt-0">
                            <h3 className="text-nature-900 dark:text-white font-bold text-lg mb-3 ml-1">Reviews ({ratings.length})</h3>
                            
                            {ratings.length === 0 ? (
                                <div className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-xl p-8 text-center shadow-sm">
                                    <div className="text-4xl opacity-50 mb-2">🌱</div>
                                    <div className="font-bold text-nature-500 dark:text-nature-400">No ratings yet.</div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {ratings.map((r, i) => (
                                        <div key={i} className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-xl p-4 shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="text-amber-500 text-xs">{renderStars(r.stars)}</div>
                                                    <div className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                                        r.role === 'provider'
                                                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                                                            : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                                                    }`}>
                                                        {r.role === 'provider' ? 'Provided Service' : 'Paid for Service'}
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-bold text-nature-400 uppercase">
                                                    {new Date(r.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                                </div>
                                            </div>
                                            {r.comment ? (
                                                <div className="text-sm text-nature-600 dark:text-nature-300 italic bg-nature-50 dark:bg-nature-800/50 p-3 rounded-lg">
                                                    "{r.comment}"
                                                </div>
                                            ) : (
                                                <div className="text-xs text-nature-400 italic">No comment provided.</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
