/**
 * PeoplePage — Friends, Community, Invites, Guardians
 *
 * Replaces the old InvitePage with a multi-view People tab.
 * Sub-views are switched via horizontal pill buttons.
 */

import { useState, useEffect } from 'react';
import {
    getFriends, addFriendApi, removeFriendApi, setGuardianApi,
    getAllMembers,
    type FriendEntry, type MemberSummary,
} from '../lib/api';
import { type BeanPoolIdentity } from '../lib/identity';
import { InvitePage } from './InvitePage';

interface Props {
    identity: BeanPoolIdentity;
    initialView?: SubView;
}

type SubView = 'friends' | 'community' | 'invites' | 'guardians';

export function PeoplePage({ identity, initialView = 'friends' }: Props) {
    const [view, setView] = useState<SubView>(initialView);
    const [friends, setFriends] = useState<FriendEntry[]>([]);
    const [members, setMembers] = useState<MemberSummary[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => { loadFriends(); }, []);
    useEffect(() => { if (view === 'community') loadMembers(); }, [view]);
    useEffect(() => { if (initialView) setView(initialView); }, [initialView]);

    async function loadFriends() {
        try {
            const data = await getFriends(identity.publicKey);
            setFriends(data);
        } catch { /* offline */ }
    }

    async function loadMembers() {
        setLoading(true);
        try {
            const data = await getAllMembers();
            setMembers(data);
        } catch { /* offline */ }
        setLoading(false);
    }

    async function handleAddFriend(pubkey: string) {
        try {
            await addFriendApi(identity.publicKey, pubkey);
            await loadFriends();
        } catch { /* error */ }
    }

    async function handleRemoveFriend(pubkey: string) {
        try {
            await removeFriendApi(identity.publicKey, pubkey);
            setFriends(f => f.filter(fr => fr.publicKey !== pubkey));
        } catch { /* error */ }
    }

    async function handleToggleGuardian(pubkey: string, isGuardian: boolean) {
        try {
            await setGuardianApi(identity.publicKey, pubkey, isGuardian);
            setFriends(f => f.map(fr =>
                fr.publicKey === pubkey ? { ...fr, isGuardian } : fr
            ));
        } catch { /* error */ }
    }

    const friendPubkeys = new Set(friends.map(f => f.publicKey));
    const guardians = friends.filter(f => f.isGuardian);

    return (
        <div className="p-4 max-w-[480px] mx-auto">
            {/* Sub-nav pills */}
            <div className="flex gap-1 mb-5 bg-oat-100 dark:bg-nature-900 rounded-xl p-1 shadow-inner border border-nature-200 dark:border-nature-800">
                {(['friends', 'community', 'invites', 'guardians'] as SubView[]).map(v => (
                    <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`flex-1 py-2 px-1 border-none rounded-lg text-xs font-bold cursor-pointer transition-all ${
                            view === v 
                                ? 'bg-white dark:bg-nature-800 text-rainbow shadow-sm border border-nature-200/50 dark:border-nature-700/50 scale-95 drop-shadow-sm' 
                                : 'bg-transparent text-nature-500 dark:text-nature-400 hover:text-nature-700 dark:hover:text-oat-50 hover:bg-oat-200 dark:hover:bg-nature-800'
                        }`}
                    >
                        {v === 'friends' && '👫 Friends'}
                        {v === 'community' && '🏘️ Community'}
                        {v === 'invites' && '🎟️ Invites'}
                        {v === 'guardians' && '🛡️ Guardians'}
                    </button>
                ))}
            </div>

            {/* ===== FRIENDS ===== */}
            {view === 'friends' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {friends.length === 0 ? (
                        <div className="text-center p-10 text-nature-500 dark:text-nature-400 bg-white dark:bg-nature-900 rounded-2xl border border-nature-200 dark:border-nature-800 shadow-sm mt-4">
                            <p className="text-4xl mb-3">👫</p>
                            <p className="text-[15px] font-semibold text-nature-800 dark:text-white">No friends yet</p>
                            <p className="text-xs mt-2 text-nature-500 dark:text-nature-400 leading-relaxed">
                                Go to <strong className="text-nature-700 dark:text-oat-50">Community</strong> to browse members and add friends.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {friends.map(f => (
                                <div key={f.publicKey} className="bg-white dark:bg-nature-900 rounded-2xl p-4 flex items-center justify-between border border-nature-200 dark:border-nature-800 shadow-sm transition-transform hover:-translate-y-0.5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-oat-100 dark:bg-nature-800 border border-nature-200 dark:border-nature-700 flex items-center justify-center text-lg">
                                            {f.isGuardian ? '🛡️' : '👤'}
                                        </div>
                                        <div>
                                            <div className="font-bold text-[15px] text-nature-900 dark:text-white flex items-center gap-1.5">
                                                {f.callsign}
                                                {f.isGuardian && <span className="text-xs text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 border border-amber-100 dark:border-amber-800 px-1.5 py-0.5 rounded-md">Guardian</span>}
                                            </div>
                                            <div className="text-xs text-nature-400 dark:text-nature-500 font-medium mt-0.5">
                                                Added {new Date(f.addedAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveFriend(f.publicKey)}
                                        className="bg-transparent border-none text-red-500 text-xs font-semibold cursor-pointer px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ===== COMMUNITY ===== */}
            {view === 'community' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <p className="text-[13px] font-medium text-nature-500 dark:text-nature-400 mb-4 bg-oat-50 dark:bg-nature-900 p-3 rounded-xl border border-nature-200 dark:border-nature-800 shadow-sm">
                        All members on this node. Tap <strong className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded shadow-sm border border-emerald-100 dark:border-emerald-800">+ Add</strong> to add someone as a friend.
                    </p>
                    {loading ? (
                        <p className="text-center text-nature-500 p-8 font-medium animate-pulse">Loading community...</p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {members
                                .filter(m => m.publicKey !== identity.publicKey)
                                .map(m => (
                                    <div key={m.publicKey} className="bg-white dark:bg-nature-900 rounded-2xl p-4 flex items-center justify-between border border-nature-200 dark:border-nature-800 shadow-sm transition-transform hover:-translate-y-0.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-oat-100 dark:bg-nature-800 border border-nature-200 dark:border-nature-700 flex items-center justify-center text-lg shadow-inner">
                                                👤
                                            </div>
                                            <div>
                                                <div className="font-bold text-[15px] text-nature-900 dark:text-white">{m.callsign}</div>
                                                <div className="text-xs text-nature-400 dark:text-nature-500 font-medium mt-0.5">
                                                    Joined {new Date(m.joinedAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                        {friendPubkeys.has(m.publicKey) ? (
                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-3 py-1.5 rounded-xl border border-emerald-100 dark:border-emerald-800 shadow-sm">
                                                ✓ Friend
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => handleAddFriend(m.publicKey)}
                                                className="bg-emerald-600 border-none text-white rounded-xl px-4 py-2 text-xs font-bold cursor-pointer hover:bg-emerald-700 shadow-sm transition-all hover:shadow-md"
                                            >
                                                + Add
                                            </button>
                                        )}
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* ===== INVITES ===== */}
            {view === 'invites' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white dark:bg-nature-900 rounded-2xl shadow-soft border border-nature-200 dark:border-nature-800 overflow-hidden">
                    <InvitePage identity={identity} />
                </div>
            )}

            {/* ===== GUARDIANS ===== */}
            {view === 'guardians' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <p className="text-[13px] text-nature-600 dark:text-nature-300 mb-5 leading-relaxed bg-emerald-50/50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800 shadow-sm">
                        Choose up to <strong className="text-nature-900 dark:text-white">5 trusted friends</strong> as recovery guardians. 
                        If you ever lose your device, any 3 of them can help you get your identity back.
                    </p>

                    {friends.length === 0 ? (
                        <div className="text-center p-10 text-nature-500 bg-white rounded-2xl border border-nature-200 shadow-sm mt-4">
                            <p className="text-4xl mb-3">🛡️</p>
                            <p className="text-[14px] font-semibold text-nature-800 leading-relaxed max-w-[250px] mx-auto">
                                Add some friends first, then come back here to choose your guardians.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-nature-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-nature-950 text-[15px] m-0">Your Guardians</h3>
                                <div className={`text-xs font-bold px-3 py-1 rounded-full ${guardians.length >= 5 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                                    {guardians.length}/5 selected
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-3">
                                {friends.map(f => (
                                    <div key={f.publicKey} className={`rounded-xl p-3.5 flex items-center justify-between border transition-all ${
                                        f.isGuardian
                                            ? 'bg-amber-50 border-amber-200 shadow-sm'
                                            : 'bg-oat-50 border-nature-200'
                                    }`}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-white border border-nature-200 flex items-center justify-center text-lg shadow-sm">
                                                {f.isGuardian ? '🛡️' : '👤'}
                                            </div>
                                            <div className={`font-bold text-[15px] ${f.isGuardian ? 'text-amber-900' : 'text-nature-900'}`}>
                                                {f.callsign}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleToggleGuardian(f.publicKey, !f.isGuardian)}
                                            disabled={!f.isGuardian && guardians.length >= 5}
                                            className={`border-none rounded-xl px-4 py-2 text-xs font-bold cursor-pointer transition-all shadow-sm ${
                                                f.isGuardian 
                                                    ? 'bg-amber-600 text-white hover:bg-amber-700' 
                                                    : 'bg-nature-800 text-white hover:bg-nature-900'
                                            } ${(!f.isGuardian && guardians.length >= 5) ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-md'}`}
                                        >
                                            {f.isGuardian ? 'Remove' : 'Make Guardian'}
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {guardians.length >= 3 && (
                                <div className="mt-5 p-4 rounded-xl bg-emerald-50 text-[13px] text-emerald-800 text-center leading-relaxed border border-emerald-200 shadow-sm font-medium">
                                    <div className="font-bold text-emerald-700 mb-1 flex items-center justify-center gap-1.5 animate-pulse">
                                        <span className="text-base">✅</span> Social Recovery Ready
                                    </div>
                                    If you lose your device, any 3 of them can help restore your identity.
                                    <div className="mt-2 text-[11px] font-bold text-emerald-600/70 border-t border-emerald-200/50 pt-2 uppercase tracking-wider">
                                        Full recovery flow coming soon.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
