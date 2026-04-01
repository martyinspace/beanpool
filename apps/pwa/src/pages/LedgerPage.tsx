/**
 * LedgerPage — Balance, Standing, and Trade History
 *
 * Fetches real balance and transaction history from the BeanPool Node API.
 */

import { useState, useEffect, useCallback } from 'react';
import { type BeanPoolIdentity } from '../lib/identity';
import {
    getBalance, getTransactions, sendTransfer, getMembers,
    getCommonsProjects, proposeProject, voteForProject, getMemberProfile,
    updateCommunityProject, deleteCommunityProject,
    type BalanceInfo, type Transaction, type Member,
    type CommunityProject, type VotingRound, type MemberProfile,
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
    const [profile, setProfile] = useState<MemberProfile | null>(null);

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
    const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
    const [editPropTitle, setEditPropTitle] = useState('');
    const [editPropDesc, setEditPropDesc] = useState('');
    const [editPropAmount, setEditPropAmount] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const [bal, txn, mem, prof] = await Promise.all([
                getBalance(identity.publicKey).catch(() => null),
                getTransactions(identity.publicKey).catch(() => []),
                getMembers().catch(() => []),
                getMemberProfile(identity.publicKey).catch(() => null),
            ]);
            if (bal) setBalanceInfo(bal);
            setTxns(txn);
            setMembers(mem.filter(m => m.publicKey !== identity.publicKey));
            setProfile(prof);
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
        <div className="p-4 max-w-[600px] mx-auto min-h-full">
            {/* Identity header */}
            <div className="text-center mb-6 p-6 bg-white dark:bg-nature-900 rounded-2xl border border-nature-200 dark:border-nature-800 shadow-sm transition-transform hover:-translate-y-0.5">
                <div className="w-20 h-20 rounded-full border-4 border-emerald-500 flex items-center justify-center text-3xl mx-auto mb-4 bg-emerald-50 dark:bg-nature-800 shadow-inner overflow-hidden">
                    {profile?.avatar ? (
                        <img src={profile.avatar} className="w-full h-full object-cover" alt="Identity" />
                    ) : (
                        <img src="/assets/logo-192x192.png" className="w-[70%] h-[70%] object-contain" alt="Identity" />
                    )}
                </div>
                <h2 className="text-xl font-bold mb-1 text-nature-950 dark:text-white">
                    {identity.callsign}
                </h2>
                <p className="text-nature-500 text-xs font-mono">
                    {identity.publicKey.substring(0, 16)}...
                </p>
            </div>

            {/* Balance */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1 bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-2xl p-5 text-center shadow-sm">
                    <p className="text-nature-500 dark:text-nature-400 text-sm font-semibold mb-2">Balance</p>
                    <p className={`text-3xl font-bold font-mono ${loading ? 'text-nature-400' : balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {loading ? '...' : `${balance >= 0 ? '+' : ''}${balance.toFixed(2)}B`}
                    </p>
                    <p className="text-nature-400 text-xs mt-1 font-medium">
                        Floor: {balanceInfo?.floor ?? -100}B
                    </p>
                </div>

                <div className="flex-1 bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-2xl p-5 text-center shadow-sm">
                    <p className="text-nature-500 dark:text-nature-400 text-sm font-semibold mb-2">Commons</p>
                    <p className="text-3xl font-bold text-amber-500 font-mono">
                        {loading ? '...' : `${(balanceInfo?.commonsBalance ?? 0).toFixed(2)}B`}
                    </p>
                    <p className="text-nature-400 text-xs mt-1 font-medium">
                        🌱 Community Pool
                    </p>
                </div>
            </div>

            {/* Send Credits Button */}
            <button
                onClick={() => setShowSend(!showSend)}
                className={`w-full p-4 rounded-xl text-[15px] font-bold border-none cursor-pointer mb-4 transition-all shadow-md ${
                    showSend ? 'bg-nature-800 text-white hover:bg-nature-900' : 'bg-[#d97757] text-white hover:bg-[#c26749] hover:shadow-lg'
                }`}
            >
                {showSend ? '✕ Cancel' : '💸 Send Credits'}
            </button>

            {/* Send Form */}
            {showSend && (
                <div className="animate-in fade-in slide-in-from-top-2 bg-nature-50 dark:bg-[#1a201a] border border-nature-200 dark:border-nature-800 rounded-2xl p-4 mb-6 shadow-sm">
                    <select
                        value={sendTo}
                        onChange={(e) => setSendTo(e.target.value)}
                        className="w-full p-3.5 rounded-xl border border-nature-200 dark:border-nature-800 bg-white dark:bg-nature-950 text-nature-900 dark:text-white text-[15px] font-medium mb-3 focus:ring-2 focus:ring-[#d97757] outline-none shadow-sm transition-all"
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
                        placeholder="Amount (B)"
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                        min="0.01"
                        step="0.01"
                        className="w-full p-3.5 rounded-xl border border-nature-200 dark:border-nature-800 bg-white dark:bg-nature-950 text-nature-900 dark:text-white text-[15px] font-medium mb-3 focus:ring-2 focus:ring-[#d97757] outline-none shadow-sm transition-all"
                    />
                    <input
                        type="text"
                        placeholder="Memo (optional)"
                        value={sendMemo}
                        onChange={(e) => setSendMemo(e.target.value)}
                        className="w-full p-3.5 rounded-xl border border-nature-200 dark:border-nature-800 bg-white dark:bg-nature-950 text-nature-900 dark:text-white text-[15px] font-medium mb-4 focus:ring-2 focus:ring-[#d97757] outline-none shadow-sm transition-all"
                    />
                    <button
                        onClick={handleSend}
                        disabled={sending || !sendTo || !sendAmount}
                        className={`w-full p-3.5 rounded-xl text-[15px] font-bold border-none transition-all shadow-md ${
                            sending || !sendTo || !sendAmount 
                                ? 'bg-nature-300 text-white cursor-not-allowed' 
                                : 'bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600 hover:shadow-lg'
                        }`}
                    >
                        {sending ? 'Sending...' : 'Confirm Transfer'}
                    </button>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="animate-in fade-in bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-600 text-sm text-center font-bold shadow-sm">
                    {error}
                </div>
            )}

            {/* Decay info */}
            {balance > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6 flex justify-between items-center shadow-sm">
                    <span className="text-[13px] font-bold text-red-600">
                        🔥 Monthly Decay (0.5%)
                    </span>
                    <span className="text-[13px] font-bold text-red-700 font-mono">
                        −{(balance * 0.005).toFixed(3)}B/mo → Commons
                    </span>
                </div>
            )}

            {/* Community Projects */}
            <div className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-2xl p-5 mb-6 shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-nature-950">
                    🏛️ Community Projects
                </h3>

                {/* Active Voting Round */}
                {activeRound && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-4 flex justify-between items-center shadow-sm">
                        <span className="text-[13px] font-bold text-emerald-700">
                            🗳️ Voting Open
                        </span>
                        <span className="text-xs font-semibold text-emerald-600">
                            Closes {new Date(activeRound.closesAt).toLocaleDateString()}
                        </span>
                    </div>
                )}

                {/* Project cards */}
                {projects.filter(p => p.status === 'active' || p.status === 'proposed').length === 0 ? (
                    <p className="text-nature-500 dark:text-nature-400 text-[13px] text-center p-4 font-medium bg-oat-50 rounded-xl border border-nature-200">
                        No proposals yet. Be the first to suggest a community project!
                    </p>
                ) : (
                    <div className="flex flex-col gap-3 mb-4">
                        {projects.filter(p => p.status === 'active' || p.status === 'proposed').map(project => {
                            const totalVotes = project.votes.length;
                            const maxVotes = Math.max(...projects.filter(p => p.status === 'active').map(p => p.votes.length), 1);
                            const hasVoted = project.votes.some(v => v.pubkey === identity.publicKey);
                            const isActive = project.status === 'active';

                            return (
                                <div key={project.id} className={`bg-white rounded-xl p-4 transition-all shadow-sm ${hasVoted ? 'border-2 border-emerald-500 ring-2 ring-emerald-50' : 'border border-nature-200 hover:border-nature-300'}`}>
                                    {editingProjectId === project.id ? (
                                        <div className="flex flex-col gap-2">
                                            <input
                                                type="text" placeholder="Project title"
                                                value={editPropTitle} onChange={e => setEditPropTitle(e.target.value)}
                                                maxLength={100}
                                                className="w-full p-2.5 rounded-lg border border-nature-200 bg-white text-[13px] font-medium focus:ring-2 focus:ring-amber-400 outline-none"
                                            />
                                            <textarea
                                                placeholder="Description (optional)"
                                                value={editPropDesc} onChange={e => setEditPropDesc(e.target.value)}
                                                maxLength={500} rows={2}
                                                className="w-full p-2.5 rounded-lg border border-nature-200 bg-white text-[13px] font-medium focus:ring-2 focus:ring-amber-400 outline-none resize-y min-h-[50px]"
                                            />
                                            <input
                                                type="number" placeholder="Requested amount (B)"
                                                value={editPropAmount} onChange={e => setEditPropAmount(e.target.value)}
                                                min="0.01" step="0.01"
                                                className="w-full p-2.5 rounded-lg border border-nature-200 bg-white text-[13px] font-medium focus:ring-2 focus:ring-amber-400 outline-none"
                                            />
                                            <div className="flex gap-2 mt-1">
                                                <button
                                                    onClick={() => setEditingProjectId(null)}
                                                    className="flex-1 p-2 rounded-lg bg-nature-100 text-nature-600 border text-[12px] font-bold border-nature-200 cursor-pointer"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    disabled={savingEdit || !editPropTitle.trim() || !editPropAmount}
                                                    onClick={async () => {
                                                        setSavingEdit(true);
                                                        try {
                                                            await updateCommunityProject(identity.publicKey, project.id, editPropTitle, editPropDesc, Number(editPropAmount));
                                                            setEditingProjectId(null);
                                                            await refresh();
                                                        } catch { setError('Failed to update project'); }
                                                        setSavingEdit(false);
                                                    }}
                                                    className="flex-[2] p-2 rounded-lg bg-amber-500 text-white border-none cursor-pointer text-[12px] font-bold disabled:opacity-50"
                                                >
                                                    {savingEdit ? 'Saving...' : 'Save Changes'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-[15px] text-nature-950">
                                                    {project.title}
                                                </p>
                                                {project.proposerPubkey === identity.publicKey && project.status === 'proposed' && (
                                                    <div className="flex gap-1">
                                                        <button 
                                                            onClick={() => {
                                                                setEditPropTitle(project.title);
                                                                setEditPropDesc(project.description);
                                                                setEditPropAmount(project.requestedAmount.toString());
                                                                setEditingProjectId(project.id);
                                                            }}
                                                            className="text-nature-400 hover:text-amber-500 p-1 bg-transparent border-none cursor-pointer text-[12px]" title="Edit">
                                                            ✏️
                                                        </button>
                                                        <button 
                                                            onClick={async () => {
                                                                if (window.confirm('Are you sure you want to delete this proposal?')) {
                                                                    try {
                                                                        await deleteCommunityProject(identity.publicKey, project.id);
                                                                        await refresh();
                                                                    } catch { setError('Failed to delete project'); }
                                                                }
                                                            }}
                                                            className="text-nature-400 hover:text-red-500 p-1 bg-transparent border-none cursor-pointer text-[12px]" title="Delete">
                                                            🗑️
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {project.description && (
                                                <p className="text-[13px] text-nature-500 dark:text-nature-400 mt-1 leading-relaxed">
                                                    {project.description}
                                                </p>
                                            )}
                                            <p className="text-[11px] font-bold text-nature-400 mt-2 uppercase tracking-wide">
                                                by {project.proposerCallsign} · <span className="text-amber-600 border border-amber-200 bg-amber-50 px-1.5 py-0.5 rounded text-xs lowercase font-mono">{project.requestedAmount.toFixed(2)}B</span>
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
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer whitespace-nowrap transition-colors shadow-sm ${
                                                    hasVoted 
                                                        ? 'bg-emerald-600 text-white' 
                                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                                }`}
                                            >
                                                {hasVoted ? '✓ Voted' : 'Vote'}
                                            </button>
                                        )}
                                    </div>
                                    {/* Vote bar */}
                                    {isActive && (
                                        <div className="flex items-center gap-2 mt-3">
                                            <div className="flex-1 h-2 bg-oat-100 rounded-full overflow-hidden shadow-inner border border-nature-200/50">
                                                <div 
                                                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-400 to-teal-500"
                                                    style={{ width: `${(totalVotes / maxVotes) * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-[11px] font-bold text-nature-500 dark:text-nature-400 min-w-[40px] text-right">
                                                {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    )}
                                        </>
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
                        className="w-full p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 border-dashed text-sm font-bold cursor-pointer hover:bg-amber-100 transition-colors"
                    >
                        + Propose a Project
                    </button>
                ) : (
                    <div className="bg-oat-50/50 rounded-xl p-4 border border-nature-200 shadow-sm animate-in fade-in slide-in-from-top-2">
                        <input
                            type="text" placeholder="Project title"
                            value={propTitle} onChange={e => setPropTitle(e.target.value)}
                            maxLength={100}
                            className="w-full p-3.5 rounded-xl border border-nature-200 dark:border-nature-800 bg-white dark:bg-nature-950 text-nature-900 dark:text-white text-[14px] font-medium mb-2 focus:ring-2 focus:ring-amber-400 outline-none shadow-sm transition-all"
                        />
                        <textarea
                            placeholder="Description (optional)"
                            value={propDesc} onChange={e => setPropDesc(e.target.value)}
                            maxLength={500} rows={2}
                            className="w-full p-3.5 rounded-xl border border-nature-200 dark:border-nature-800 bg-white dark:bg-nature-950 text-nature-900 dark:text-white text-[14px] font-medium mb-2 focus:ring-2 focus:ring-amber-400 outline-none shadow-sm transition-all resize-y min-h-[60px]"
                        />
                        <input
                            type="number" placeholder="Requested amount (B)"
                            value={propAmount} onChange={e => setPropAmount(e.target.value)}
                            min="0.01" step="0.01"
                            className="w-full p-3.5 rounded-xl border border-nature-200 dark:border-nature-800 bg-white dark:bg-nature-950 text-nature-900 dark:text-white text-[14px] font-medium mb-3 focus:ring-2 focus:ring-amber-400 outline-none shadow-sm transition-all"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setShowPropose(false); setPropTitle(''); setPropDesc(''); setPropAmount(''); }}
                                className="flex-1 p-2.5 rounded-lg bg-white dark:bg-nature-800 border border-nature-200 dark:border-nature-800 text-nature-600 dark:text-nature-400 text-[13px] font-bold cursor-pointer hover:bg-nature-50 shadow-sm transition-colors"
                            >
                                Cancel
                            </button>
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
                                className={`flex-[2] p-2.5 rounded-lg border-none text-[13px] font-bold shadow-sm transition-all ${
                                    proposing || !propTitle.trim() || !propAmount
                                        ? 'bg-nature-200 text-nature-500 dark:text-nature-400 cursor-not-allowed'
                                        : 'bg-amber-500 text-white cursor-pointer hover:bg-amber-600 hover:shadow-md'
                                }`}
                            >
                                {proposing ? 'Submitting...' : 'Submit Proposal'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Funded projects history */}
                {projects.filter(p => p.status === 'funded').length > 0 && (
                    <div className="mt-5 border-t border-nature-200 pt-4">
                        <p className="text-[13px] font-bold text-emerald-600 mb-3 uppercase tracking-wider">✅ Funded Projects</p>
                        {projects.filter(p => p.status === 'funded').map(p => (
                            <div key={p.id} className="flex justify-between items-center py-2.5 border-b border-nature-100 dark:border-nature-800 last:border-0">
                                <span className="text-[14px] font-medium text-nature-900 dark:text-white">{p.title}</span>
                                <span className="text-[13px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-mono shadow-sm">
                                    {p.requestedAmount.toFixed(2)}B
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Transaction history */}
            <div className="flex justify-between items-center mb-3 px-1">
                <h3 className="text-lg font-bold text-nature-950">
                    Recent Transactions
                </h3>
                <button
                    onClick={async () => {
                        try {
                            const res = await fetch('/api/ledger/export');
                            const data = await res.json();
                            
                            const balBlob = new Blob([data.balancesCsv], { type: 'text/csv' });
                            const balUrl = window.URL.createObjectURL(balBlob);
                            const balA = document.createElement('a');
                            balA.href = balUrl;
                            balA.download = 'beanpool_balances.csv';
                            balA.click();
                            window.URL.revokeObjectURL(balUrl);
                            
                            setTimeout(() => {
                                const txBlob = new Blob([data.transactionsCsv], { type: 'text/csv' });
                                const txUrl = window.URL.createObjectURL(txBlob);
                                const txA = document.createElement('a');
                                txA.href = txUrl;
                                txA.download = 'beanpool_transactions.csv';
                                txA.click();
                                window.URL.revokeObjectURL(txUrl);
                            }, 500);
                        } catch (e) {
                            console.error('Export failed', e);
                            alert('Export failed');
                        }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-nature-100 dark:bg-nature-800 text-nature-700 dark:text-nature-300 rounded-lg text-[11px] font-bold hover:bg-nature-200 transition-colors border border-nature-200 shadow-sm cursor-pointer"
                >
                    ⬇️ Node Audit
                </button>
            </div>
            {txns.length === 0 ? (
                <div className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-2xl p-8 text-center text-nature-500 dark:text-nature-400 text-[14px] shadow-sm font-medium">
                    No transactions yet. Start trading on the Marketplace!
                </div>
            ) : (
                <div className="flex flex-col gap-2.5 pb-20">
                    {txns.map(tx => {
                        const isSent = tx.from === identity.publicKey;
                        return (
                            <div key={tx.id} className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 rounded-xl p-4 flex justify-between items-center shadow-sm transition-transform hover:-translate-y-0.5">
                                <div>
                                    <p className={`text-[14px] font-bold ${isSent ? 'text-nature-900 dark:text-white' : 'text-emerald-700'}`}>
                                        {isSent ? '↑ Sent' : '↓ Received'}
                                    </p>
                                    {tx.memo && (
                                        <p className="text-[13px] text-nature-500 dark:text-nature-400 mt-1 leading-snug">{tx.memo}</p>
                                    )}
                                    <p className="text-[11px] font-bold text-nature-400 mt-1.5 uppercase tracking-wide">
                                        {new Date(tx.timestamp).toLocaleString()}
                                    </p>
                                </div>
                                <p className={`text-lg font-bold font-mono ${isSent ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {isSent ? '−' : '+'}{tx.amount.toFixed(2)}B
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
