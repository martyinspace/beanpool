/**
 * WelcomePage — First-run identity bootstrap with invite code
 *
 * New users:  Enter invite code + callsign → redeem → joined
 * Existing:   Import identity from another device
 */

import { useState } from 'react';
import { createIdentity, importIdentity, type BeanPoolIdentity } from '../lib/identity';
import { decryptIdentity } from '../lib/identity-transfer';
import { redeemInvite, registerMember } from '../lib/api';

interface Props {
    onComplete: (identity: BeanPoolIdentity) => void;
}

export function WelcomePage({ onComplete }: Props) {
    const [callsign, setCallsign] = useState('');
    const [inviteCode, setInviteCode] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('invite') || '';
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showImport, setShowImport] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return !!params.get('import');
    });
    const [importData, setImportData] = useState(() => {
        // Auto-fill if opened via identity transfer link
        const params = new URLSearchParams(window.location.search);
        const importParam = params.get('import');
        return importParam ? window.location.href : '';
    });
    const [importPin, setImportPin] = useState('');

    async function handleCreate() {
        const trimmedCallsign = callsign.trim();
        const trimmedCode = inviteCode.trim();

        if (trimmedCallsign.length < 2) {
            setError('Callsign must be at least 2 characters.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const identity = await createIdentity(trimmedCallsign);

            if (trimmedCode) {
                // Invite code provided — redeem it
                try {
                    await redeemInvite(trimmedCode, identity.publicKey, identity.callsign);
                } catch (err: any) {
                    setError(err.message || 'Invalid invite code');
                    setLoading(false);
                    return;
                }
            } else {
                // No invite code — legacy registration (will be anonymous/genesis)
                try {
                    await registerMember(identity.publicKey, identity.callsign);
                } catch { /* offline — will register on next sync */ }
            }

            onComplete(identity);
        } catch (err) {
            setError('Failed to generate identity. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleImport() {
        if (!importData.trim() || importPin.length < 4) {
            setError('Paste the transfer code and enter your PIN.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const imported = await decryptIdentity(importData.trim(), importPin);
            await importIdentity(imported);
            try {
                await registerMember(imported.publicKey, imported.callsign);
            } catch { /* offline — will register on next sync */ }
            onComplete(imported);
        } catch {
            setError('Import failed — wrong PIN or invalid code.');
        } finally {
            setLoading(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        border: '1px solid var(--border-input)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: '1rem',
        fontFamily: 'inherit',
        outline: 'none',
        marginBottom: '1rem',
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            padding: '2rem',
        }}>
            <div style={{
                maxWidth: '420px',
                width: '100%',
                textAlign: 'center',
            }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🫘</h1>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Welcome to BeanPool
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
                    Your identity is yours. It lives on this device,
                    backed by cryptography — no passwords, no central accounts.
                </p>

                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '16px',
                    padding: '2rem',
                }}>
                    {!showImport ? (
                        <>
                            <label style={{
                                display: 'block',
                                textAlign: 'left',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                marginBottom: '0.5rem',
                            }}>
                                Invite Code
                            </label>
                            <input
                                type="text"
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                placeholder="e.g. BP-7K3X-9M2W"
                                maxLength={14}
                                disabled={loading}
                                style={{
                                    ...inputStyle,
                                    fontFamily: 'monospace',
                                    letterSpacing: '1px',
                                    textAlign: 'center',
                                    fontSize: '1.1rem',
                                }}
                            />

                            <label style={{
                                display: 'block',
                                textAlign: 'left',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                marginBottom: '0.5rem',
                            }}>
                                Choose your Callsign
                            </label>
                            <input
                                type="text"
                                value={callsign}
                                onChange={(e) => setCallsign(e.target.value)}
                                placeholder="e.g. Billinudgel-Marty"
                                maxLength={32}
                                disabled={loading}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                style={inputStyle}
                            />

                            {error && (
                                <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                    {error}
                                </p>
                            )}

                            <button
                                onClick={handleCreate}
                                disabled={loading || callsign.trim().length < 2}
                                style={{
                                    width: '100%',
                                    padding: '0.85rem',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: loading ? '#555' : '#2563eb',
                                    color: 'var(--text-primary)',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'background 0.2s',
                                }}
                            >
                                {loading ? 'Joining...' : inviteCode.trim()
                                    ? 'Join with Invite'
                                    : 'Create Sovereign Identity'}
                            </button>

                            {!inviteCode.trim() && (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem' }}>
                                    No invite code? You can still join — ask a member to invite you later for full access.
                                </p>
                            )}

                            <p style={{ color: 'var(--text-faint)', fontSize: '0.75rem', marginTop: '1rem' }}>
                                🔐 Ed25519 keypair generated locally. Your private key never leaves this device.
                            </p>

                            <button
                                onClick={() => { setShowImport(true); setError(null); }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#2563eb',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    marginTop: '1.5rem',
                                    fontFamily: 'inherit',
                                }}
                            >
                                Already have an identity? Import →
                            </button>
                        </>
                    ) : (
                        <>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', textAlign: 'left' }}>
                                📥 Import Identity
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5, textAlign: 'left' }}>
                                Paste the transfer code from your other device and enter the PIN.
                            </p>
                            <textarea
                                value={importData}
                                onChange={(e) => setImportData(e.target.value)}
                                placeholder="Paste the identity transfer link here"
                                style={{
                                    ...inputStyle,
                                    minHeight: '80px',
                                    resize: 'none',
                                    fontSize: '0.8rem',
                                    fontFamily: 'monospace',
                                }}
                            />
                            <input
                                type="password"
                                inputMode="numeric"
                                value={importPin}
                                onChange={(e) => setImportPin(e.target.value)}
                                placeholder="Enter PIN"
                                style={inputStyle}
                            />

                            {error && (
                                <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                    {error}
                                </p>
                            )}

                            <button
                                onClick={handleImport}
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    padding: '0.85rem',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: loading ? '#555' : '#2563eb',
                                    color: 'var(--text-primary)',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'background 0.2s',
                                }}
                            >
                                {loading ? 'Importing...' : 'Import Identity'}
                            </button>

                            <button
                                onClick={() => { setShowImport(false); setError(null); }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    marginTop: '1rem',
                                    fontFamily: 'inherit',
                                }}
                            >
                                ← Back to Join
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
