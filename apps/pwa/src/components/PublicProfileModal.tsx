import { useState, useEffect } from 'react';
import { getMemberProfile, getMemberRatings, type Rating } from '../lib/api';

export function PublicProfileModal({ 
    publicKey, 
    callsign, 
    onClose 
}: { 
    publicKey: string; 
    callsign: string; 
    onClose: () => void;
}) {
    const [profile, setProfile] = useState<any>(null);
    const [ratings, setRatings] = useState<Rating[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            getMemberProfile(publicKey, publicKey).catch(() => null),
            getMemberRatings(publicKey).catch(() => null)
        ]).then(([prof, rat]) => {
            if (prof) setProfile(prof);
            if (rat) {
                setStats({ average: rat.average, count: rat.count, asProvider: rat.asProvider, asReceiver: rat.asReceiver });
                setRatings(rat.ratings || []);
            }
            setLoading(false);
        });
    }, [publicKey]);

    const renderStars = (avg: number) => {
        const rounded = Math.round(avg || 0);
        return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[999] flex flex-col animate-in fade-in duration-200">
            {/* Header */}
            <div className="bg-white dark:bg-nature-950 p-4 shadow-sm flex items-center justify-between border-b border-nature-200 dark:border-nature-800 shrink-0">
                <button 
                    onClick={onClose}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-nature-100 dark:bg-nature-900 text-nature-600 dark:text-nature-400 font-bold hover:bg-nature-200 transition-colors"
                >
                    ✕
                </button>
                <h3 className="m-0 text-nature-900 dark:text-white font-bold text-lg text-center flex-1 pr-10">
                    Trust Profile
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto bg-nature-50 dark:bg-black/90 pb-[env(safe-area-inset-bottom)]">
                {/* Profile Banner */}
                <div className="bg-white dark:bg-nature-900 px-6 py-8 flex flex-col items-center border-b border-nature-200 dark:border-nature-800 shadow-sm relative">
                    <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-br from-amber-500/20 to-emerald-500/20 dark:from-amber-500/10 dark:to-emerald-500/10" />
                    
                    {profile?.avatar ? (
                        <img 
                            src={profile.avatar} 
                            alt={callsign} 
                            className="w-24 h-24 rounded-full border-4 border-white dark:border-nature-900 shadow-md mb-4 relative z-10 object-cover bg-nature-100"
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-full border-4 border-white dark:border-nature-900 shadow-md mb-4 relative z-10 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-500 flex items-center justify-center text-4xl font-bold">
                            {callsign.charAt(0).toUpperCase()}
                        </div>
                    )}
                    
                    <h2 className="text-2xl font-bold text-nature-900 dark:text-white m-0 relative z-10 flex items-center gap-2">
                        {callsign} <span className="text-emerald-500 text-lg">✓</span>
                    </h2>
                    
                    <div className="mt-1 text-xs text-nature-500 font-mono bg-nature-100 dark:bg-nature-800 px-2 py-0.5 rounded">
                        {publicKey.slice(0, 16)}...
                    </div>

                    {profile?.bio && (
                        <p className="mt-4 text-sm text-nature-600 dark:text-nature-300 text-center max-w-xs relative z-10 leading-relaxed italic">
                            "{profile.bio}"
                        </p>
                    )}
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="p-12 text-center text-nature-400 font-medium animate-pulse">
                        Loading reputation data...
                    </div>
                )}

                {/* Stats Highlights */}
                {!loading && stats && stats.count > 0 && (
                    <div className="p-4 grid grid-cols-3 gap-2">
                        <div className="bg-white dark:bg-nature-900 p-3 rounded-xl border border-nature-200 dark:border-nature-800 flex flex-col items-center justify-center shadow-sm">
                            <span className="text-2xl mb-1 text-amber-500">{renderStars(stats.average)}</span>
                            <span className="text-nature-900 dark:text-white font-bold text-[15px]">{stats.average.toFixed(1)}</span>
                            <span className="text-nature-500 text-[10px] uppercase tracking-wider font-bold">Overall</span>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/40 flex flex-col items-center justify-center shadow-sm">
                            <span className="text-lg mb-1">📤</span>
                            <span className="text-emerald-800 dark:text-emerald-400 font-bold text-[15px]">{stats.asProvider?.average.toFixed(1) || '-'}</span>
                            <span className="text-emerald-600 dark:text-emerald-500 text-[10px] uppercase tracking-wider font-bold">As Provider</span>
                        </div>
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 flex flex-col items-center justify-center shadow-sm">
                            <span className="text-lg mb-1">📥</span>
                            <span className="text-indigo-800 dark:text-indigo-400 font-bold text-[15px]">{stats.asReceiver?.average.toFixed(1) || '-'}</span>
                            <span className="text-indigo-600 dark:text-indigo-500 text-[10px] uppercase tracking-wider font-bold">As Payer</span>
                        </div>
                    </div>
                )}

                {/* Reviews List */}
                {!loading && (
                    <div className="px-4 pb-8">
                        <h4 className="text-nature-900 dark:text-white font-bold text-sm mb-3 mt-2 px-1">
                            Reviews ({ratings.length})
                        </h4>
                        
                        {ratings.length === 0 ? (
                            <div className="bg-white dark:bg-nature-900 p-6 rounded-xl border border-nature-200 dark:border-nature-800 text-center shadow-sm">
                                <span className="text-3xl mb-2 opacity-50 block">🌱</span>
                                <p className="text-nature-500 dark:text-nature-400 text-sm font-medium m-0">No ratings yet.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {ratings.map(r => (
                                    <div key={r.id} className="bg-white dark:bg-nature-900 p-4 rounded-xl border border-nature-200 dark:border-nature-800 shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm tracking-tight text-amber-500">{renderStars(r.stars)}</span>
                                                <span className="text-nature-400 text-xs font-bold">•</span>
                                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                                    r.role === 'provider' 
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                                                        : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400'
                                                }`}>
                                                    {r.role === 'provider' ? 'Provided Service' : 'Paid for Service'}
                                                </span>
                                            </div>
                                            <span className="text-nature-400 dark:text-nature-500 text-[10px] font-semibold uppercase tracking-wider">
                                                {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                        {r.comment ? (
                                            <p className="text-nature-700 dark:text-nature-300 text-sm leading-relaxed m-0 italic bg-nature-50 dark:bg-black/20 p-3 rounded-lg border border-nature-100 dark:border-nature-800">
                                                "{r.comment}"
                                            </p>
                                        ) : (
                                            <p className="text-nature-400 dark:text-nature-600 text-[13px] italic m-0">No comment provided.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
