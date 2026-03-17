/**
 * InvitePage — Generate invites + Community Tree + Health Dashboard
 *
 * Three sections:
 *  1. Invite code generation & management
 *  2. Interactive invite tree visualisation
 *  3. Community health metrics & flags
 */

import { useState, useEffect } from 'react';
import { generateInvite, getMyInvites, getInviteTree, getCommunityHealth, type InviteCode } from '../lib/api';
import { type BeanPoolIdentity } from '../lib/identity';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
    identity: BeanPoolIdentity;
}

interface TreeNode {
    publicKey: string;
    callsign: string;
    joinedAt: string;
    inviteCode: string;
    children: TreeNode[];
}

interface HealthData {
    tree: {
        totalMembers: number;
        maxDepth: number;
        widestBranch: { callsign: string; children: number };
        avgBranchSize: number;
    };
    activity: {
        totalTransactions: number;
        last7Days: number;
        last30Days: number;
        activeMemberCount: number;
        inactiveMemberCount: number;
        commonsBalance: number;
    };
    flags: {
        type: string;
        severity: 'warning' | 'alert';
        description: string;
        members: string[];
    }[];
}

export function InvitePage({ identity }: Props) {
    const [invites, setInvites] = useState<InviteCode[]>([]);
    const [generating, setGenerating] = useState(false);
    const [newCode, setNewCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);

    // Tree + Health
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [health, setHealth] = useState<HealthData | null>(null);
    const [activeSection, setActiveSection] = useState<'invites' | 'tree' | 'health'>('invites');

    useEffect(() => {
        loadInvites();
        loadTree();
        loadHealth();
    }, []);

    async function loadInvites() {
        try {
            const result = await getMyInvites(identity.publicKey);
            setInvites(result.invites);
        } catch { /* offline */ }
    }

    async function loadTree() {
        try {
            const result = await getInviteTree();
            setTree(result);
        } catch { /* offline */ }
    }

    async function loadHealth() {
        try {
            const result = await getCommunityHealth();
            setHealth(result);
        } catch { /* offline */ }
    }

    async function handleGenerate() {
        setGenerating(true);
        setCopied(false);
        try {
            const result = await generateInvite(identity.publicKey);
            setNewCode(result.invite.code);
            setShowQR(true);
            await loadInvites();
        } catch (err: any) {
            alert(err.message || 'Failed to generate invite');
        } finally {
            setGenerating(false);
        }
    }

    async function handleCopy(code: string) {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const el = document.createElement('textarea');
            el.value = code;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    async function handleShare(code: string) {
        const shareData = {
            title: 'Join BeanPool',
            text: `You've been invited to BeanPool! Use this invite code to join: ${code}`,
            url: window.location.origin,
        };
        if (navigator.share) {
            try { await navigator.share(shareData); } catch { /* cancelled */ }
        } else {
            handleCopy(`${shareData.text}\n${shareData.url}`);
        }
    }

    const unusedInvites = invites.filter(i => !i.usedBy);
    const usedInvites = invites.filter(i => i.usedBy);

    const cardStyle: React.CSSProperties = {
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '0.75rem',
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({
        flex: 1,
        padding: '0.5rem',
        borderRadius: '8px',
        border: 'none',
        background: active ? '#2563eb' : '#1a1a1a',
        color: active ? '#fff' : '#888',
        fontSize: '0.8rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
    });

    return (
        <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
            {/* Section tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
                <button onClick={() => setActiveSection('invites')} style={tabStyle(activeSection === 'invites')}>
                    🎟️ Invites
                </button>
                <button onClick={() => setActiveSection('tree')} style={tabStyle(activeSection === 'tree')}>
                    🌳 Tree
                </button>
                <button onClick={() => setActiveSection('health')} style={tabStyle(activeSection === 'health')}>
                    💚 Health
                </button>
            </div>

            {/* =================== INVITES SECTION =================== */}
            {activeSection === 'invites' && (
                <>
                    <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>🎟️ Invite Someone</h2>
                    <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                        Each invite code can only be used once. Generate a new one for each person you invite.
                    </p>

                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        style={{
                            width: '100%', padding: '1rem', borderRadius: '12px',
                            border: 'none', background: generating ? '#555' : '#2563eb',
                            color: '#fff', fontSize: '1rem', fontWeight: 600,
                            cursor: generating ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit', marginBottom: '1.5rem',
                        }}
                    >
                        {generating ? 'Generating...' : '✨ Generate New Invite'}
                    </button>

                    {newCode && showQR && (
                        <div style={{ ...cardStyle, textAlign: 'center', border: '1px solid #2563eb', background: '#0f1729', marginBottom: '1.5rem' }}>
                            <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '0.75rem' }}>Share this code with someone you trust</p>
                            <p style={{ fontFamily: 'monospace', fontSize: '1.8rem', fontWeight: 700, color: '#fff', letterSpacing: '2px', marginBottom: '1rem' }}>
                                {newCode.toUpperCase()}
                            </p>
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem', display: 'inline-block', marginBottom: '1rem' }}>
                                {/* @ts-ignore */}
                                <QRCodeSVG value={`${window.location.origin}?invite=${newCode}`} size={200} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                <button onClick={() => handleCopy(newCode)} style={{
                                    padding: '0.6rem 1.2rem', borderRadius: '8px', border: '1px solid #444',
                                    background: copied ? '#22c55e' : '#222', color: '#fff', fontSize: '0.85rem',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    {copied ? '✓ Copied!' : '📋 Copy'}
                                </button>
                                <button onClick={() => handleShare(newCode)} style={{
                                    padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none',
                                    background: '#2563eb', color: '#fff', fontSize: '0.85rem',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    📤 Share
                                </button>
                            </div>
                        </div>
                    )}

                    {unusedInvites.length > 0 && (
                        <>
                            <h3 style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem' }}>⏳ Pending ({unusedInvites.length})</h3>
                            {unusedInvites.map(inv => (
                                <div key={inv.code} style={cardStyle}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 600, letterSpacing: '1px' }}>
                                            {inv.code.toUpperCase()}
                                        </span>
                                        <button onClick={() => handleCopy(inv.code.toUpperCase())} style={{
                                            padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid #444',
                                            background: '#222', color: '#aaa', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                                        }}>📋</button>
                                    </div>
                                    <p style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                        Created {new Date(inv.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            ))}
                        </>
                    )}

                    {usedInvites.length > 0 && (
                        <>
                            <h3 style={{ fontSize: '0.9rem', color: '#aaa', marginTop: '1rem', marginBottom: '0.5rem' }}>✅ Redeemed ({usedInvites.length})</h3>
                            {usedInvites.map(inv => (
                                <div key={inv.code} style={{ ...cardStyle, opacity: 0.6 }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: '#888', textDecoration: 'line-through' }}>
                                        {inv.code.toUpperCase()}
                                    </span>
                                    <p style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                        Used {inv.usedAt ? new Date(inv.usedAt).toLocaleDateString() : ''}
                                    </p>
                                </div>
                            ))}
                        </>
                    )}
                </>
            )}

            {/* =================== TREE SECTION =================== */}
            {activeSection === 'tree' && (
                <>
                    <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>🌳 Community Tree</h2>
                    <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                        Who invited whom. The tree shows how your community grows.
                    </p>

                    {tree.length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', color: '#555' }}>
                            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🌱</p>
                            <p>No members yet. Generate an invite to start growing!</p>
                        </div>
                    ) : (
                        <div style={{ ...cardStyle, padding: '0.75rem' }}>
                            {tree.map(node => (
                                <TreeNodeView key={node.publicKey} node={node} depth={0} identity={identity} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* =================== HEALTH SECTION =================== */}
            {activeSection === 'health' && (
                <>
                    <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>💚 Community Health</h2>
                    <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                        Metrics and alerts for node operators.
                    </p>

                    {!health ? (
                        <p style={{ color: '#555', textAlign: 'center', padding: '2rem' }}>Loading...</p>
                    ) : (
                        <>
                            {/* Summary cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                                <StatCard label="Members" value={health.tree.totalMembers} emoji="👥" />
                                <StatCard label="Tree Depth" value={health.tree.maxDepth} emoji="🌳" />
                                <StatCard label="Txns (7d)" value={health.activity.last7Days} emoji="📈" />
                                <StatCard label="Txns (30d)" value={health.activity.last30Days} emoji="📊" />
                                <StatCard label="Active" value={health.activity.activeMemberCount} emoji="🟢" color="#22c55e" />
                                <StatCard label="Inactive" value={health.activity.inactiveMemberCount} emoji="⚪" color="#666" />
                                <StatCard label="Commons" value={`${health.activity.commonsBalance}Ʀ`} emoji="🏦" color="#f59e0b" />
                                <StatCard label="Total Txns" value={health.activity.totalTransactions} emoji="💸" />
                            </div>

                            {/* Tree info */}
                            {health.tree.widestBranch.children > 0 && (
                                <div style={{ ...cardStyle, background: '#0f1729', border: '1px solid #1e3a5f' }}>
                                    <p style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.25rem' }}>
                                        Widest Branch
                                    </p>
                                    <p style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                                        🌿 {health.tree.widestBranch.callsign} — {health.tree.widestBranch.children} invitee{health.tree.widestBranch.children !== 1 ? 's' : ''}
                                    </p>
                                </div>
                            )}

                            {/* Flags */}
                            <h3 style={{ fontSize: '0.9rem', color: '#aaa', marginTop: '1rem', marginBottom: '0.5rem' }}>
                                🚩 Flags ({health.flags.length})
                            </h3>
                            {health.flags.length === 0 ? (
                                <div style={{ ...cardStyle, textAlign: 'center', border: '1px solid #1a3a1a' }}>
                                    <p style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>✅</p>
                                    <p style={{ color: '#22c55e', fontSize: '0.9rem', margin: 0 }}>No issues detected</p>
                                </div>
                            ) : (
                                health.flags.map((flag, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            ...cardStyle,
                                            border: `1px solid ${flag.severity === 'alert' ? '#ef444466' : '#f59e0b44'}`,
                                            background: flag.severity === 'alert' ? '#1a0f0f' : '#1a1a0f',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                            <span style={{ fontSize: '1rem' }}>
                                                {flag.type === 'wash_trading' ? '🔄' : flag.type === 'isolated_branch' ? '🏝️' : '💤'}
                                            </span>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                                                letterSpacing: '0.05em',
                                                color: flag.severity === 'alert' ? '#ef4444' : '#f59e0b',
                                            }}>
                                                {flag.type.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', color: '#ccc', margin: 0 }}>
                                            {flag.description}
                                        </p>
                                    </div>
                                ))
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// =================== SUB-COMPONENTS ===================

function StatCard({ label, value, emoji, color }: { label: string; value: string | number; emoji: string; color?: string }) {
    return (
        <div style={{
            background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
            padding: '0.75rem', textAlign: 'center',
        }}>
            <p style={{ fontSize: '1.2rem', margin: '0 0 0.15rem' }}>{emoji}</p>
            <p style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.1rem', color: color || '#fff', fontFamily: 'monospace' }}>
                {value}
            </p>
            <p style={{ fontSize: '0.7rem', color: '#666', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {label}
            </p>
        </div>
    );
}

function TreeNodeView({ node, depth, identity }: { node: TreeNode; depth: number; identity: BeanPoolIdentity }) {
    const [expanded, setExpanded] = useState(depth < 2);
    const isMe = node.publicKey === identity.publicKey;
    const hasChildren = node.children.length > 0;
    const joinDate = new Date(node.joinedAt).toLocaleDateString();

    return (
        <div style={{ marginLeft: depth > 0 ? '1.25rem' : 0 }}>
            <div
                onClick={() => hasChildren && setExpanded(!expanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.25rem', cursor: hasChildren ? 'pointer' : 'default',
                    borderLeft: depth > 0 ? '2px solid #333' : 'none',
                    paddingLeft: depth > 0 ? '0.75rem' : '0.25rem',
                }}
            >
                {/* Expand/collapse */}
                <span style={{ fontSize: '0.75rem', color: '#555', width: '1rem', textAlign: 'center' }}>
                    {hasChildren ? (expanded ? '▼' : '▶') : '·'}
                </span>

                {/* Avatar dot */}
                <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: isMe ? '#2563eb' : '#333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                    border: isMe ? '2px solid #60a5fa' : 'none',
                }}>
                    {node.callsign.charAt(0).toUpperCase()}
                </div>

                {/* Name + info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{
                            fontSize: '0.85rem', fontWeight: 600,
                            color: isMe ? '#60a5fa' : '#ddd',
                        }}>
                            {node.callsign}
                        </span>
                        {isMe && (
                            <span style={{
                                fontSize: '0.6rem', background: '#2563eb33', color: '#60a5fa',
                                padding: '0.1rem 0.3rem', borderRadius: '4px',
                            }}>
                                you
                            </span>
                        )}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#555' }}>
                        Joined {joinDate}
                        {hasChildren && ` · ${node.children.length} invite${node.children.length !== 1 ? 's' : ''}`}
                    </span>
                </div>
            </div>

            {/* Children */}
            {expanded && hasChildren && (
                <div>
                    {node.children.map(child => (
                        <TreeNodeView key={child.publicKey} node={child} depth={depth + 1} identity={identity} />
                    ))}
                </div>
            )}
        </div>
    );
}
