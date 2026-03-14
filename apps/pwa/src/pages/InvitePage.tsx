/**
 * InvitePage — Generate and share single-use invite codes
 *
 * Each code is unique and can only be used once.
 * Members can generate unlimited invites.
 */

import { useState, useEffect } from 'react';
import { generateInvite, getMyInvites, type InviteCode } from '../lib/api';
import { type BeanPoolIdentity } from '../lib/identity';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
    identity: BeanPoolIdentity;
}

export function InvitePage({ identity }: Props) {
    const [invites, setInvites] = useState<InviteCode[]>([]);
    const [generating, setGenerating] = useState(false);
    const [newCode, setNewCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);

    useEffect(() => {
        loadInvites();
    }, []);

    async function loadInvites() {
        try {
            const result = await getMyInvites(identity.publicKey);
            setInvites(result.invites);
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

    return (
        <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>🎟️ Invite Someone</h2>
            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Each invite code can only be used once. Generate a new one for each person you invite.
            </p>

            {/* Generate Button */}
            <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                    width: '100%',
                    padding: '1rem',
                    borderRadius: '12px',
                    border: 'none',
                    background: generating ? '#555' : '#2563eb',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: generating ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    marginBottom: '1.5rem',
                    transition: 'background 0.2s',
                }}
            >
                {generating ? 'Generating...' : '✨ Generate New Invite'}
            </button>

            {/* New Code Display */}
            {newCode && showQR && (
                <div style={{
                    ...cardStyle,
                    textAlign: 'center',
                    border: '1px solid #2563eb',
                    background: '#0f1729',
                    marginBottom: '1.5rem',
                }}>
                    <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                        Share this code with someone you trust
                    </p>
                    <p style={{
                        fontFamily: 'monospace',
                        fontSize: '1.8rem',
                        fontWeight: 700,
                        color: '#fff',
                        letterSpacing: '2px',
                        marginBottom: '1rem',
                    }}>
                        {newCode.toUpperCase()}
                    </p>

                    <div style={{
                        background: '#fff',
                        borderRadius: '12px',
                        padding: '1rem',
                        display: 'inline-block',
                        marginBottom: '1rem',
                    }}>
                        {/* @ts-ignore */}
                        <QRCodeSVG
                            value={`${window.location.origin}?invite=${newCode}`}
                            size={200}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                            onClick={() => handleCopy(newCode)}
                            style={{
                                padding: '0.6rem 1.2rem',
                                borderRadius: '8px',
                                border: '1px solid #444',
                                background: copied ? '#22c55e' : '#222',
                                color: '#fff',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'background 0.2s',
                            }}
                        >
                            {copied ? '✓ Copied!' : '📋 Copy'}
                        </button>
                        <button
                            onClick={() => handleShare(newCode)}
                            style={{
                                padding: '0.6rem 1.2rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#2563eb',
                                color: '#fff',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            📤 Share
                        </button>
                    </div>
                </div>
            )}

            {/* Unused Invites */}
            {unusedInvites.length > 0 && (
                <>
                    <h3 style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '0.5rem' }}>
                        ⏳ Pending ({unusedInvites.length})
                    </h3>
                    {unusedInvites.map(inv => (
                        <div key={inv.code} style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{
                                    fontFamily: 'monospace',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    letterSpacing: '1px',
                                }}>
                                    {inv.code.toUpperCase()}
                                </span>
                                <button
                                    onClick={() => handleCopy(inv.code.toUpperCase())}
                                    style={{
                                        padding: '0.3rem 0.6rem',
                                        borderRadius: '6px',
                                        border: '1px solid #444',
                                        background: '#222',
                                        color: '#aaa',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    📋
                                </button>
                            </div>
                            <p style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                Created {new Date(inv.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                    ))}
                </>
            )}

            {/* Used Invites */}
            {usedInvites.length > 0 && (
                <>
                    <h3 style={{ fontSize: '0.9rem', color: '#aaa', marginTop: '1rem', marginBottom: '0.5rem' }}>
                        ✅ Redeemed ({usedInvites.length})
                    </h3>
                    {usedInvites.map(inv => (
                        <div key={inv.code} style={{ ...cardStyle, opacity: 0.6 }}>
                            <span style={{
                                fontFamily: 'monospace',
                                fontSize: '0.9rem',
                                color: '#888',
                                textDecoration: 'line-through',
                            }}>
                                {inv.code.toUpperCase()}
                            </span>
                            <p style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                Used {inv.usedAt ? new Date(inv.usedAt).toLocaleDateString() : ''}
                            </p>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
