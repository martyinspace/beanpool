/**
 * WelcomePage — First-run identity bootstrap with invite code
 *
 * New users:  Enter invite code + callsign → create → show seed phrase → joined
 * Existing:   Import identity from another device
 * Recovery:   Enter 12-word phrase to recover identity
 */

import { useState } from 'react';
import { createIdentity, createIdentityFromMnemonic, importIdentity, type BeanPoolIdentity } from '../lib/identity';
import { validateMnemonic } from '../lib/mnemonic';
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
    const [showRecovery, setShowRecovery] = useState(false);
    const [recoveryWords, setRecoveryWords] = useState<string[]>(Array(12).fill(''));
    const [recoveryCallsign, setRecoveryCallsign] = useState('');
    const [pendingIdentity, setPendingIdentity] = useState<BeanPoolIdentity | null>(null);
    const [seedConfirmed, setSeedConfirmed] = useState(false);
    const [pendingInviteCode, setPendingInviteCode] = useState('');

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

            // Show seed phrase before proceeding
            setPendingIdentity(identity);
            setPendingInviteCode(trimmedCode);
            setLoading(false);
        } catch (err) {
            setError('Failed to generate identity. Please try again.');
            console.error(err);
            setLoading(false);
        }
    }

    async function handleSeedConfirmed() {
        if (!pendingIdentity) return;
        setLoading(true);
        try {
            if (pendingInviteCode) {
                try {
                    await redeemInvite(pendingInviteCode, pendingIdentity.publicKey, pendingIdentity.callsign);
                } catch (err: any) {
                    setError(err.message || 'Invalid invite code');
                    setLoading(false);
                    return;
                }
            } else {
                try {
                    await registerMember(pendingIdentity.publicKey, pendingIdentity.callsign);
                } catch { /* offline */ }
            }
            onComplete(pendingIdentity);
        } finally {
            setLoading(false);
        }
    }

    async function handleRecover() {
        const words = recoveryWords.map(w => w.toLowerCase().trim());
        if (!validateMnemonic(words)) {
            setError('One or more words are not valid. Check your spelling.');
            return;
        }
        if (recoveryCallsign.trim().length < 2) {
            setError('Enter your callsign (at least 2 characters).');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const identity = await createIdentityFromMnemonic(words, recoveryCallsign.trim());
            try {
                await registerMember(identity.publicKey, identity.callsign);
            } catch { /* offline */ }
            onComplete(identity);
        } catch {
            setError('Recovery failed. Check your words and try again.');
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
                    {/* ===== SEED PHRASE DISPLAY (after create, before confirm) ===== */}
                    {pendingIdentity?.mnemonic ? (
                        <>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>🔑 Your Recovery Phrase</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                                Write these 12 words down on paper and keep them safe.
                                This is the <strong>only</strong> way to recover your identity if you lose this device.
                            </p>

                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '0.4rem', marginBottom: '1rem',
                            }}>
                                {pendingIdentity.mnemonic.map((word, i) => (
                                    <div key={i} style={{
                                        background: 'var(--bg-secondary, #1e293b)',
                                        borderRadius: 8, padding: '0.5rem 0.4rem',
                                        fontSize: '0.8rem', fontFamily: 'monospace',
                                        textAlign: 'center',
                                    }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{i + 1}. </span>
                                        <strong>{word}</strong>
                                    </div>
                                ))}
                            </div>

                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                fontSize: '0.8rem', color: 'var(--text-muted)',
                                marginBottom: '1rem', cursor: 'pointer',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={seedConfirmed}
                                    onChange={(e) => setSeedConfirmed(e.target.checked)}
                                    style={{ accentColor: '#2563eb' }}
                                />
                                I've written these words down somewhere safe
                            </label>

                            {error && (
                                <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                    {error}
                                </p>
                            )}

                            <button
                                onClick={handleSeedConfirmed}
                                disabled={!seedConfirmed || loading}
                                style={{
                                    width: '100%', padding: '0.85rem', borderRadius: '10px',
                                    border: 'none',
                                    background: !seedConfirmed ? '#334155' : loading ? '#555' : '#2563eb',
                                    color: 'var(--text-primary)', fontSize: '1rem',
                                    fontWeight: 600, cursor: !seedConfirmed ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit', transition: 'background 0.2s',
                                }}
                            >
                                {loading ? 'Continuing...' : 'Continue →'}
                            </button>
                        </>
                    ) : showRecovery ? (
                        /* ===== RECOVERY FROM 12 WORDS ===== */
                        <>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', textAlign: 'left' }}>
                                🔑 Recover with 12 Words
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem', lineHeight: 1.5, textAlign: 'left' }}>
                                Enter the 12 recovery words you wrote down when you first joined.
                            </p>

                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '0.35rem', marginBottom: '1rem',
                            }}>
                                {recoveryWords.map((word, i) => (
                                    <input
                                        key={i}
                                        type="text"
                                        value={word}
                                        onChange={(e) => {
                                            const updated = [...recoveryWords];
                                            updated[i] = e.target.value;
                                            setRecoveryWords(updated);
                                        }}
                                        placeholder={`${i + 1}`}
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        style={{
                                            padding: '0.45rem 0.3rem',
                                            borderRadius: 8,
                                            border: '1px solid var(--border-input, #334155)',
                                            background: 'var(--bg-secondary, #1e293b)',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.75rem',
                                            fontFamily: 'monospace',
                                            textAlign: 'center',
                                            outline: 'none',
                                        }}
                                    />
                                ))}
                            </div>

                            <input
                                type="text"
                                value={recoveryCallsign}
                                onChange={(e) => setRecoveryCallsign(e.target.value)}
                                placeholder="Your callsign"
                                maxLength={32}
                                style={inputStyle}
                            />

                            {error && (
                                <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                    {error}
                                </p>
                            )}

                            <button
                                onClick={handleRecover}
                                disabled={loading}
                                style={{
                                    width: '100%', padding: '0.85rem', borderRadius: '10px',
                                    border: 'none',
                                    background: loading ? '#555' : '#2563eb',
                                    color: 'var(--text-primary)', fontSize: '1rem',
                                    fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit', transition: 'background 0.2s',
                                }}
                            >
                                {loading ? 'Recovering...' : 'Recover Identity'}
                            </button>

                            <button
                                onClick={() => { setShowRecovery(false); setError(null); }}
                                style={{
                                    background: 'none', border: 'none',
                                    color: 'var(--text-muted)', fontSize: '0.85rem',
                                    cursor: 'pointer', marginTop: '1rem', fontFamily: 'inherit',
                                }}
                            >
                                ← Back
                            </button>
                        </>
                    ) : !showImport ? (
                        /* ===== MAIN JOIN FORM ===== */
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

                            <div style={{
                                marginTop: '1.5rem', paddingTop: '1.25rem',
                                borderTop: '1px solid var(--border-primary, #333)',
                            }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem', fontWeight: 600 }}>
                                    Already a member?
                                </p>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => { setShowImport(true); setError(null); }}
                                        style={{
                                            flex: 1, padding: '0.7rem 0.5rem', borderRadius: '10px',
                                            border: '1px solid #2563eb44',
                                            background: 'rgba(37,99,235,0.08)',
                                            color: '#60a5fa', fontSize: '0.8rem', fontWeight: 600,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                        }}
                                    >
                                        📥 Import from Device
                                    </button>
                                    <button
                                        onClick={() => { setShowRecovery(true); setError(null); }}
                                        style={{
                                            flex: 1, padding: '0.7rem 0.5rem', borderRadius: '10px',
                                            border: '1px solid #f59e0b44',
                                            background: 'rgba(245,158,11,0.08)',
                                            color: '#fbbf24', fontSize: '0.8rem', fontWeight: 600,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                        }}
                                    >
                                        🔑 Recover Identity
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        /* ===== IMPORT FROM DEVICE ===== */
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
