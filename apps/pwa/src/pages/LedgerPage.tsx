/**
 * LedgerPage — Balance, Standing, and Trade History
 *
 * Fetches real balance and transaction history from the BeanPool Node API.
 */

import { useState, useEffect, useCallback } from 'react';
import { type BeanPoolIdentity } from '../lib/identity';
import {
    getBalance, getTransactions, sendTransfer, getMembers,
    type BalanceInfo, type Transaction, type Member,
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
                background: '#1a1a1a',
                borderRadius: '16px',
                border: '1px solid #333',
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
                <p style={{ color: '#666', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {identity.publicKey.substring(0, 16)}...
                </p>
            </div>

            {/* Balance */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{
                    flex: 1, background: '#1a1a1a', border: '1px solid #333',
                    borderRadius: '12px', padding: '1.25rem', textAlign: 'center',
                }}>
                    <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Balance</p>
                    <p style={{
                        fontSize: '2rem', fontWeight: 700,
                        color: loading ? '#555' : balance >= 0 ? '#10b981' : '#ef4444',
                        fontFamily: 'monospace',
                    }}>
                        {loading ? '...' : `${balance >= 0 ? '+' : ''}${balance.toFixed(2)}Ʀ`}
                    </p>
                    <p style={{ color: '#555', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                        Floor: {balanceInfo?.floor ?? -100}Ʀ
                    </p>
                </div>

                <div style={{
                    flex: 1, background: '#1a1a1a', border: '1px solid #333',
                    borderRadius: '12px', padding: '1.25rem', textAlign: 'center',
                }}>
                    <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Commons</p>
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
                        {loading ? '...' : `${(balanceInfo?.commonsBalance ?? 0).toFixed(2)}Ʀ`}
                    </p>
                    <p style={{ color: '#555', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                        🌱 Community Pool
                    </p>
                </div>
            </div>

            {/* Send Credits Button */}
            <button
                onClick={() => setShowSend(!showSend)}
                style={{
                    width: '100%', padding: '0.85rem', borderRadius: '12px',
                    background: showSend ? '#333' : '#2563eb', color: '#fff',
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
                    background: '#1a1a1a', border: '1px solid #333',
                    borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem',
                }}>
                    <select
                        value={sendTo}
                        onChange={(e) => setSendTo(e.target.value)}
                        style={{
                            width: '100%', padding: '0.6rem', borderRadius: '8px',
                            border: '1px solid #444', background: '#0f0f0f',
                            color: '#e0e0e0', fontSize: '0.9rem', marginBottom: '0.5rem',
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
                            border: '1px solid #444', background: '#0f0f0f',
                            color: '#e0e0e0', fontSize: '0.9rem', marginBottom: '0.5rem',
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
                            border: '1px solid #444', background: '#0f0f0f',
                            color: '#e0e0e0', fontSize: '0.9rem', marginBottom: '0.75rem',
                            fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={sending || !sendTo || !sendAmount}
                        style={{
                            width: '100%', padding: '0.7rem', borderRadius: '8px',
                            background: sending ? '#555' : '#10b981', color: '#fff',
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
                    <span style={{ fontSize: '0.85rem', color: '#aaa', fontFamily: 'monospace' }}>
                        −{(balance * 0.005).toFixed(3)}Ʀ/mo → Commons
                    </span>
                </div>
            )}

            {/* Transaction history */}
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Recent Transactions
            </h3>
            {txns.length === 0 ? (
                <div style={{
                    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
                    padding: '2rem', textAlign: 'center', color: '#555', fontSize: '0.9rem',
                }}>
                    No transactions yet. Start trading on the Marketplace!
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {txns.map(tx => {
                        const isSent = tx.from === identity.publicKey;
                        return (
                            <div key={tx.id} style={{
                                background: '#1a1a1a', border: '1px solid #333',
                                borderRadius: '10px', padding: '0.75rem 1rem',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <div>
                                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e0e0e0' }}>
                                        {isSent ? '↑ Sent' : '↓ Received'}
                                    </p>
                                    {tx.memo && (
                                        <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>{tx.memo}</p>
                                    )}
                                    <p style={{ fontSize: '0.7rem', color: '#555', marginTop: '2px' }}>
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
