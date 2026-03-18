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
}

type SubView = 'friends' | 'community' | 'invites' | 'guardians';

export function PeoplePage({ identity }: Props) {
    const [view, setView] = useState<SubView>('friends');
    const [friends, setFriends] = useState<FriendEntry[]>([]);
    const [members, setMembers] = useState<MemberSummary[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => { loadFriends(); }, []);
    useEffect(() => { if (view === 'community') loadMembers(); }, [view]);

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
        <div style={{ padding: '1rem', maxWidth: 480, margin: '0 auto' }}>
            {/* Sub-nav pills */}
            <div style={{
                display: 'flex', gap: '0.25rem', marginBottom: '1rem',
                background: 'var(--bg-secondary, #1e293b)', borderRadius: 10, padding: 3,
            }}>
                {(['friends', 'community', 'invites', 'guardians'] as SubView[]).map(v => (
                    <button
                        key={v}
                        onClick={() => setView(v)}
                        style={{
                            flex: 1, padding: '0.5rem 0.25rem', border: 'none', borderRadius: 8,
                            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                            background: view === v ? 'var(--bg-primary, #0f172a)' : 'transparent',
                            color: view === v ? '#fff' : 'var(--text-muted, #64748b)',
                            transition: 'all 0.2s',
                        }}
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
                <div>
                    {friends.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted, #64748b)' }}>
                            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👫</p>
                            <p style={{ fontSize: '0.9rem' }}>No friends yet</p>
                            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                Go to <strong>Community</strong> to browse members and add friends.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {friends.map(f => (
                                <div key={f.publicKey} style={{
                                    background: 'var(--bg-secondary, #1e293b)', borderRadius: 12,
                                    padding: '0.75rem 1rem', display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                            {f.callsign}
                                            {f.isGuardian && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#f59e0b' }}>🛡️</span>}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>
                                            Added {new Date(f.addedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveFriend(f.publicKey)}
                                        style={{
                                            background: 'none', border: 'none', color: '#ef4444',
                                            fontSize: '0.75rem', cursor: 'pointer', padding: '0.25rem 0.5rem',
                                        }}
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
                <div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginBottom: '0.75rem' }}>
                        All members on this node. Tap <strong>+ Add</strong> to add someone as a friend.
                    </p>
                    {loading ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-muted, #64748b)', padding: '2rem' }}>Loading...</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {members
                                .filter(m => m.publicKey !== identity.publicKey)
                                .map(m => (
                                    <div key={m.publicKey} style={{
                                        background: 'var(--bg-secondary, #1e293b)', borderRadius: 12,
                                        padding: '0.75rem 1rem', display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.callsign}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>
                                                Joined {new Date(m.joinedAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                        {friendPubkeys.has(m.publicKey) ? (
                                            <span style={{ fontSize: '0.75rem', color: '#10b981' }}>✓ Friend</span>
                                        ) : (
                                            <button
                                                onClick={() => handleAddFriend(m.publicKey)}
                                                style={{
                                                    background: '#2563eb', color: 'white', border: 'none',
                                                    borderRadius: 8, padding: '0.35rem 0.75rem',
                                                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                                                }}
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
                <InvitePage identity={identity} />
            )}

            {/* ===== GUARDIANS ===== */}
            {view === 'guardians' && (
                <div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', marginBottom: '1rem', lineHeight: 1.5 }}>
                        Choose up to <strong>5 trusted friends</strong> as recovery guardians. 
                        If you ever lose your device, any 3 of them can help you get your identity back.
                    </p>

                    {friends.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted, #64748b)' }}>
                            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛡️</p>
                            <p style={{ fontSize: '0.85rem' }}>Add some friends first, then come back here to choose your guardians.</p>
                        </div>
                    ) : (
                        <>
                            <p style={{
                                fontSize: '0.8rem', color: guardians.length >= 5 ? '#10b981' : '#f59e0b',
                                marginBottom: '0.75rem', fontWeight: 600,
                            }}>
                                {guardians.length}/5 guardians selected
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {friends.map(f => (
                                    <div key={f.publicKey} style={{
                                        background: f.isGuardian
                                            ? 'linear-gradient(135deg, #1a1a2e, #1e3a5f)'
                                            : 'var(--bg-secondary, #1e293b)',
                                        border: f.isGuardian ? '1px solid #f59e0b44' : '1px solid transparent',
                                        borderRadius: 12, padding: '0.75rem 1rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                                {f.isGuardian && '🛡️ '}{f.callsign}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleToggleGuardian(f.publicKey, !f.isGuardian)}
                                            disabled={!f.isGuardian && guardians.length >= 5}
                                            style={{
                                                background: f.isGuardian ? '#92400e' : '#1e40af',
                                                color: 'white', border: 'none', borderRadius: 8,
                                                padding: '0.35rem 0.75rem', fontSize: '0.75rem',
                                                fontWeight: 600, cursor: 'pointer',
                                                opacity: (!f.isGuardian && guardians.length >= 5) ? 0.4 : 1,
                                            }}
                                        >
                                            {f.isGuardian ? 'Remove' : 'Make Guardian'}
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {guardians.length >= 3 && (
                                <div style={{
                                    marginTop: '1rem', padding: '0.75rem', borderRadius: 10,
                                    background: '#064e3b', fontSize: '0.8rem', color: '#a7f3d0',
                                    textAlign: 'center', lineHeight: 1.5,
                                }}>
                                    ✅ You have enough guardians for social recovery. 
                                    If you lose your device, any 3 of them can help restore your identity.
                                    <br/><em style={{ fontSize: '0.75rem', color: '#6ee7b7' }}>Full recovery flow coming soon.</em>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
