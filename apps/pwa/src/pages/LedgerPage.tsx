/**
 * LedgerPage — Balance, Standing, and Trade History
 *
 * Fetches real balance and transaction history from the BeanPool Node API.
 */

import { useState, useEffect, useCallback } from 'react';
import { type BeanPoolIdentity } from '../lib/identity';
import {
    getBalance, getTransactions, sendTransfer, getMembers,
    getCommonsProjects, proposeProject, voteForProject,
    type BalanceInfo, type Transaction, type Member,
    type CommunityProject, type VotingRound,
} from '../lib/api';

interface Props {
    identity: BeanPoolIdentity;
}

export function LedgerPage({ identity }: Props) {
    const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
    const [txns, setTxns] = useState<Transaction[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Send form
    const [showSend, setShowSend] = useState(false);
    const [sendTo, setSendTo] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const [sendMemo, setSendMemo] = useState('');
    const [sending, setSending] = useState(false);

    // Commons state
    const [projects, setProjects] = useState<CommunityProject[]>([]);
    const [activeRound, setActiveRound] = useState<VotingRound | null>(null);
    const [showPropose, setShowPropose] = useState(false);
    const [propTitle, setPropTitle] = useState('');
    const [propDesc, setPropDesc] = useState('');
    const [propAmount, setPropAmount] = useState('');
    const [proposing, setProposing] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const [bal, txn, mem] = await Promise.all([
                getBalance(identity.publicKey),
                getTransactions(identity.publicKey),
                getMembers(),
            ]);
            setBalanceInfo(bal);
            setTxns(txn);
            setMembers(mem.filter(m => m.publicKey !== identity.publicKey));
            // Load commons data
            try {
                const commons = await getCommonsProjects();
                setProjects(commons.projects);
                setActiveRound(commons.activeRound);
            } catch { /* commons not critical */ }
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [identity.publicKey]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 10_000);
        return () => clearInterval(interval);
    }, [refresh]);

    async function handleSend() {
        if (!sendTo || !sendAmount) return;
        setSending(true);
        try {
            await sendTransfer(identity.publicKey, sendTo, Number(sendAmount), sendMemo);
            setShowSend(false);
            setSendTo('');
            setSendAmount('');
            setSendMemo('');
            await refresh();
        } catch (e: any) {
            setError(e.message || 'Transfer failed');
        } finally {
            setSending(false);
        }
    }

    const balance = balanceInfo?.balance ?? 0;

    return (
        <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
            {/* Identity header */}
            <div style={{
                textAlign: 'center',
                marginBottom: '1.5rem',
                padding: '1.5rem',
                background: 'var(--bg-card)',
                borderRadius: '16px',
                border: '1px solid var(--border-primary)',
            }}>
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    border: '3px solid #10b981',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2rem', margin: '0 auto 1rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                }}>
                    🫘
                </div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    {identity.callsign}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {identity.publicKey.substring(0, 16)}...
                </p>
            </div>

            {/* Balance */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{
                    flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                    borderRadius: '12px', padding: '1.25rem', textAlign: 'center',
                }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Balance</p>
                    <p style={{
                        fontSize: '2rem', fontWeight: 700,
                        color: loading ? '#555' : balance >= 0 ? '#10b981' : '#ef4444',
                        fontFamily: 'monospace',
                    }}>
                        {loading ? '...' : `${balance >= 0 ? '+' : ''}${balance.toFixed(2)}Ʀ`}
                    </p>
                    <p style={{ color: 'var(--text-faint)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                        Floor: {balanceInfo?.floor ?? -100}Ʀ
                    </p>
                </div>

                <div style={{
                    flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                    borderRadius: '12px', padding: '1.25rem', textAlign: 'center',
                }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Commons</p>
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
                        {loading ? '...' : `${(balanceInfo?.commonsBalance ?? 0).toFixed(2)}Ʀ`}
                    </p>
                    <p style={{ color: 'var(--text-faint)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                        🌱 Community Pool
                    </p>
                </div>
            </div>

            {/* Send Credits Button */}
            <button
                onClick={() => setShowSend(!showSend)}
                style={{
                    width: '100%', padding: '0.85rem', borderRadius: '12px',
                    background: showSend ? '#333' : '#2563eb', color: 'var(--text-primary)',
                    border: 'none', fontSize: '1rem', fontWeight: 700,
                    cursor: 'pointer', marginBottom: '1rem', fontFamily: 'inherit',
                    transition: 'background 0.2s',
                }}
            >
                {showSend ? '✕ Cancel' : '💸 Send Credits'}
            </button>

            {/* Send Form */}
            {showSend && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                    borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem',
                }}>
                    <select
                        value={sendTo}
                        onChange={(e) => setSendTo(e.target.value)}
                        style={{
                            width: '100%', padding: '0.6rem', borderRadius: '8px',
                            border: '1px solid var(--border-input)', background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.5rem',
                            fontFamily: 'inherit',
                        }}
                    >
                        <option value="">Select recipient...</option>
                        {members.map(m => (
                            <option key={m.publicKey} value={m.publicKey}>
                                {m.callsign}
                            </option>
                        ))}
                    </select>
                    <input
                        type="number"
                        placeholder="Amount (Ʀ)"
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                        min="0.01"
                        step="0.01"
                        style={{
                            width: '100%', padding: '0.6rem', borderRadius: '8px',
                            border: '1px solid var(--border-input)', background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.5rem',
                            fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                    />
                    <input
                        type="text"
                        placeholder="Memo (optional)"
                        value={sendMemo}
                        onChange={(e) => setSendMemo(e.target.value)}
                        style={{
                            width: '100%', padding: '0.6rem', borderRadius: '8px',
                            border: '1px solid var(--border-input)', background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.75rem',
                            fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={sending || !sendTo || !sendAmount}
                        style={{
                            width: '100%', padding: '0.7rem', borderRadius: '8px',
                            background: sending ? '#555' : '#10b981', color: 'var(--text-primary)',
                            border: 'none', fontSize: '0.9rem', fontWeight: 600,
                            cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        {sending ? 'Sending...' : 'Confirm Transfer'}
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

            {/* Decay info */}
            {balance > 0 && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.5rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span style={{ fontSize: '0.85rem', color: '#ef4444' }}>
                        🔥 Monthly Decay (0.5%)
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        −{(balance * 0.005).toFixed(3)}Ʀ/mo → Commons
                    </span>
                </div>
            )}

            {/* Community Projects */}
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem',
            }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🏛️ Community Projects
                </h3>

                {/* Active Voting Round */}
                {activeRound && (
                    <div style={{
                        background: 'rgba(37, 99, 235, 0.1)', border: '1px solid rgba(37, 99, 235, 0.3)',
                        borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#60a5fa' }}>
                            🗳️ Voting Open
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Closes {new Date(activeRound.closesAt).toLocaleDateString()}
                        </span>
                    </div>
                )}

                {/* Project cards */}
                {projects.filter(p => p.status === 'active' || p.status === 'proposed').length === 0 ? (
                    <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                        No proposals yet. Be the first to suggest a community project!
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        {projects.filter(p => p.status === 'active' || p.status === 'proposed').map(project => {
                            const totalVotes = project.votes.length;
                            const maxVotes = Math.max(...projects.filter(p => p.status === 'active').map(p => p.votes.length), 1);
                            const hasVoted = project.votes.some(v => v.pubkey === identity.publicKey);
                            const isActive = project.status === 'active';

                            return (
                                <div key={project.id} style={{
                                    background: 'var(--bg-secondary)', border: hasVoted ? '2px solid #2563eb' : '1px solid var(--border-primary)',
                                    borderRadius: '10px', padding: '0.75rem 1rem',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                        <div>
                                            <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                                {project.title}
                                            </p>
                                            {project.description && (
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {project.description}
                                                </p>
                                            )}
                                            <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)', marginTop: '4px' }}>
                                                by {project.proposerCallsign} · {project.requestedAmount.toFixed(2)}Ʀ
                                            </p>
                                        </div>
                                        {isActive && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await voteForProject(identity.publicKey, project.id);
                                                        await refresh();
                                                    } catch { /* ignore */ }
                                                }}
                                                style={{
                                                    padding: '0.35rem 0.75rem', borderRadius: '6px',
                                                    background: hasVoted ? '#2563eb' : 'rgba(37, 99, 235, 0.15)',
                                                    color: hasVoted ? '#fff' : '#60a5fa',
                                                    border: 'none', fontSize: '0.75rem', fontWeight: 600,
                                                    cursor: 'pointer', fontFamily: 'inherit',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {hasVoted ? '✓ Voted' : 'Vote'}
                                            </button>
                                        )}
                                    </div>
                                    {/* Vote bar */}
                                    {isActive && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <div style={{
                                                flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)',
                                                borderRadius: '3px', overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    height: '100%', width: `${(totalVotes / maxVotes) * 100}%`,
                                                    background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
                                                    borderRadius: '3px', transition: 'width 0.3s',
                                                }} />
                                            </div>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '40px' }}>
                                                {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Propose button / form */}
                {!showPropose ? (
                    <button
                        onClick={() => setShowPropose(true)}
                        style={{
                            width: '100%', padding: '0.6rem', borderRadius: '8px',
                            background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b',
                            border: '1px dashed rgba(245, 158, 11, 0.4)',
                            fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        + Propose a Project
                    </button>
                ) : (
                    <div style={{
                        background: 'var(--bg-secondary)', borderRadius: '10px',
                        padding: '1rem', border: '1px solid var(--border-primary)',
                    }}>
                        <input
                            type="text" placeholder="Project title"
                            value={propTitle} onChange={e => setPropTitle(e.target.value)}
                            maxLength={100}
                            style={{
                                width: '100%', padding: '0.5rem', borderRadius: '6px',
                                border: '1px solid var(--border-input)', background: 'var(--bg-primary)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.5rem',
                                fontFamily: 'inherit', boxSizing: 'border-box',
                            }}
                        />
                        <textarea
                            placeholder="Description (optional)"
                            value={propDesc} onChange={e => setPropDesc(e.target.value)}
                            maxLength={500} rows={2}
                            style={{
                                width: '100%', padding: '0.5rem', borderRadius: '6px',
                                border: '1px solid var(--border-input)', background: 'var(--bg-primary)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.5rem',
                                fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                            }}
                        />
                        <input
                            type="number" placeholder="Requested amount (Ʀ)"
                            value={propAmount} onChange={e => setPropAmount(e.target.value)}
                            min="0.01" step="0.01"
                            style={{
                                width: '100%', padding: '0.5rem', borderRadius: '6px',
                                border: '1px solid var(--border-input)', background: 'var(--bg-primary)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.75rem',
                                fontFamily: 'inherit', boxSizing: 'border-box',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => { setShowPropose(false); setPropTitle(''); setPropDesc(''); setPropAmount(''); }}
                                style={{
                                    flex: 1, padding: '0.5rem', borderRadius: '6px',
                                    background: '#333', color: 'var(--text-primary)',
                                    border: 'none', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >Cancel</button>
                            <button
                                disabled={proposing || !propTitle.trim() || !propAmount}
                                onClick={async () => {
                                    setProposing(true);
                                    try {
                                        await proposeProject(identity.publicKey, propTitle, propDesc, Number(propAmount));
                                        setShowPropose(false); setPropTitle(''); setPropDesc(''); setPropAmount('');
                                        await refresh();
                                    } catch { setError('Failed to propose project'); }
                                    setProposing(false);
                                }}
                                style={{
                                    flex: 1, padding: '0.5rem', borderRadius: '6px',
                                    background: proposing ? '#555' : '#f59e0b', color: '#000',
                                    border: 'none', fontSize: '0.8rem', fontWeight: 600,
                                    cursor: proposing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                }}
                            >{proposing ? 'Submitting...' : 'Submit Proposal'}</button>
                        </div>
                    </div>
                )}

                {/* Funded projects history */}
                {projects.filter(p => p.status === 'funded').length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>✅ Funded</p>
                        {projects.filter(p => p.status === 'funded').map(p => (
                            <div key={p.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.4rem 0', borderBottom: '1px solid var(--border-primary)',
                            }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{p.title}</span>
                                <span style={{ fontSize: '0.75rem', color: '#10b981', fontFamily: 'monospace' }}>{p.requestedAmount.toFixed(2)}Ʀ</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Transaction history */}
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Recent Transactions
            </h3>
            {txns.length === 0 ? (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: '12px',
                    padding: '2rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.9rem',
                }}>
                    No transactions yet. Start trading on the Marketplace!
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {txns.map(tx => {
                        const isSent = tx.from === identity.publicKey;
                        return (
                            <div key={tx.id} style={{
                                background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                                borderRadius: '10px', padding: '0.75rem 1rem',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <div>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {isSent ? '↑ Sent' : '↓ Received'}
                                    </p>
                                    {tx.memo && (
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{tx.memo}</p>
                                    )}
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)', marginTop: '2px' }}>
                                        {new Date(tx.timestamp).toLocaleString()}
                                    </p>
                                </div>
                                <p style={{
                                    fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace',
                                    color: isSent ? '#ef4444' : '#10b981',
                                }}>
                                    {isSent ? '−' : '+'}{tx.amount.toFixed(2)}Ʀ
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
