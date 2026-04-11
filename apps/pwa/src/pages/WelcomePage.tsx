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
import { redeemInvite, redeemOfflineTicket, registerMember } from '../lib/api';

interface Props {
    onComplete: (identity: BeanPoolIdentity) => void;
}

// ===================== INVITE CODE FORMATTING =====================

function extractInviteToken(raw: string): string {
    const inviteMatch = raw.match(/[?&]invite=([^&]+)/);
    if (inviteMatch) {
        return decodeURIComponent(inviteMatch[1]);
    }
    return raw;
}

/** Strip everything except alphanumeric, uppercase, and format as BP-XXXX-XXXX */
function formatInviteCode(raw: string): string {
    const extracted = extractInviteToken(raw);
    const trimmed = extracted.trim();
    if (trimmed.length > 20 && trimmed.startsWith('BP-')) {
        return trimmed; // It's an offline cryptographic ticket. Just return it cleanly.
    }

    // Strip non-alphanumeric
    const clean = extracted.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    // Legacy support for Node Genesis invites
    if (clean.startsWith('INV')) {
        const body = clean.slice(3);
        if (body.length === 0) return '';
        if (body.length <= 4) return `INV-${body}`;
        return `INV-${body.slice(0, 4)}-${body.slice(4, 8)}`;
    }

    const withoutPrefix = clean.startsWith('BP') ? clean.slice(2) : clean;
    const body = withoutPrefix.slice(0, 8);

    if (body.length === 0) return '';
    if (body.length <= 4) return `BP-${body}`;
    return `BP-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** Normalise any input to the canonical format for API submission */
function normaliseInviteCode(raw: string): string {
    const extracted = extractInviteToken(raw);
    const trimmed = extracted.trim();
    if (trimmed.length > 20 && trimmed.startsWith('BP-')) {
        return trimmed; // Offline cryptographic bulk token
    }

    const clean = extracted.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    if (clean.startsWith('INV')) {
        const body = clean.slice(3);
        if (body.length < 8) return extracted.trim().toUpperCase();
        return `INV-${body.slice(0, 4)}-${body.slice(4, 8)}`;
    }

    const withoutPrefix = clean.startsWith('BP') ? clean.slice(2) : clean;
    const body = withoutPrefix.slice(0, 8);
    if (body.length < 8) return extracted.trim().toUpperCase(); // partial — return as-is
    return `BP-${body.slice(0, 4)}-${body.slice(4)}`;
}

// ===================== FAQ DATA =====================

const FAQ_ITEMS = [
    {
        q: 'What is BeanPool?',
        a: 'BeanPool is a mutual credit marketplace for local communities. Members can post offers and needs, trade using community credits, and build local economic resilience — all without banks or corporations.',
    },
    {
        q: 'How do I get an invite?',
        a: 'Ask an existing community member to generate an invite code for you. They can share it as a link, QR code, or text. Each invite code works once.',
    },
    {
        q: 'Is my data private?',
        a: 'Your identity is an Ed25519 keypair stored only on your device — never on a server. Your posts and transactions are shared within your community, but your private key never leaves your device.',
    },
    {
        q: 'What are community credits?',
        a: 'Credits are a mutual credit currency. When you trade, credits transfer between members. Every member starts at zero. The system is designed to encourage reciprocity and keep value circulating locally.',
    },
    {
        q: 'Can I use this on my phone?',
        a: 'Yes! BeanPool is a Progressive Web App. Open the app link in your browser, then "Add to Home Screen" for the full native-like experience — works on Android, iOS, and desktop.',
    },
];

export function WelcomePage({ onComplete }: Props) {
    const [callsign, setCallsign] = useState('');
    const [inviteCode, setInviteCode] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('invite') || '';
        return raw ? formatInviteCode(raw) : '';
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showImport, setShowImport] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return !!params.get('import');
    });
    const [importData, setImportData] = useState(() => {
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
    const [showNewUser, setShowNewUser] = useState(() => {
        return false;
    });
    const [isTrampoline, setIsTrampoline] = useState(() => {
        // ALWAYS default to the native app trampoline page
        return true;
    });
    const [showMemberOptions, setShowMemberOptions] = useState(false);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    async function handleCreate() {
        const trimmedCallsign = callsign.trim();
        const trimmedCode = normaliseInviteCode(inviteCode);

        if (!trimmedCode) {
            setError('An invite code is required to join this node.');
            return;
        }

        if (trimmedCallsign.length < 2) {
            setError('Callsign must be at least 2 characters.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const identity = await createIdentity(trimmedCallsign);
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
                    if (pendingInviteCode.length > 20 && pendingInviteCode.startsWith('BP-')) {
                        // Offline ticket cryptographic redemption
                        const ticketB64 = pendingInviteCode.slice(3); // Remove 'BP-' prefix
                        await redeemOfflineTicket(ticketB64, pendingIdentity.publicKey, pendingIdentity.callsign);
                    } else {
                        // Legacy short-hash central database redemption
                        await redeemInvite(pendingInviteCode, pendingIdentity.publicKey, pendingIdentity.callsign);
                    }
                } catch (err: any) {
                    setError(err.message || 'Invalid invite code');
                    setLoading(false);
                    return;
                }
            } else {
                try {
                    await registerMember(pendingIdentity.publicKey, pendingIdentity.callsign);
                } catch (err: any) {
                    setError(err.message || 'Registration failed.');
                    setLoading(false);
                    return;
                }
            }
            
            // Onboarding complete — explicitly ask for location once
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(() => {}, () => {});
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
            
            // Recovery complete — explicitly ask for location once
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(() => {}, () => {});
            }
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
            
            // Import complete — explicitly ask for location once
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(() => {}, () => {});
            }
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
        <div className="bg-oat-50 dark:bg-nature-950 min-h-screen text-nature-950 dark:text-oat-50" style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '2rem',
        }}>
            <div style={{
                maxWidth: '420px',
                width: '100%',
                textAlign: 'center',
            }}>
                <img src="/assets/logo-192x192.png" alt="BeanPool Logo" style={{ width: '4rem', height: '4rem', objectFit: 'contain', margin: '0 auto 1rem' }} />
                <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Welcome to BeanPool
                </h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
                    Your identity is yours. It lives on this device,
                    backed by cryptography — no passwords, no central accounts.
                </p>

                <div className="bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 shadow-sm" style={{
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
                    ) : isTrampoline ? (
                        /* ===== DEEP LINK TRAMPOLINE GATEWAY ===== */
                        <>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                                {inviteCode ? "🎟️ You've been invited!" : "📱 Download the App"}
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                BeanPool is designed as a native mobile app. For the best experience, download the app from your store, then tap the button below to join the node instantly.
                            </p>

                            {/* NATIVE APP STORE DOWNLOAD BUTTONS */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                {/* Apple App Store */}
                                <a 
                                    href="https://apps.apple.com" 
                                    target="_blank" rel="noopener noreferrer"
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        padding: '0.85rem 0.5rem', borderRadius: '12px',
                                        background: '#000000', border: '1px solid #333', 
                                        textDecoration: 'none', color: 'white',
                                        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.4)', transition: 'transform 0.1s'
                                    }}
                                >
                                    <span style={{ fontSize: '0.65rem', color: '#a1a1aa', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '2px' }}>Download on the</span>
                                    <span style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <svg width="16" height="19" viewBox="0 0 384 512" fill="white"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7-44.5 0-80.4 20-101.9 61.4-23.9 44.8-12 112 11.6 142.4 12.3 15.6 28 32 44.7 32 15 0 22.8-9.4 46-9.4 22.8 0 29.8 9.4 46 9.4 21.2 0 33.7-16.7 44.7-32 11.8-16.7 16.7-32.5 16.7-33.5-3.3-1.6-47.6-17.7-47.6-61.9zm-46.7-183.1c11.8-15 20.3-34.9 18.2-54.6-17.2 1.3-40 12-53.5 27.5-11.8 13.5-21.7 33.9-19.2 53.6 19.3 1.8 39.7-11.8 54.5-26.5z"/></svg>
                                        App Store
                                    </span>
                                </a>

                                {/* Google Play Store */}
                                <a 
                                    href="https://play.google.com" 
                                    target="_blank" rel="noopener noreferrer"
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        padding: '0.85rem 0.5rem', borderRadius: '12px',
                                        background: '#000000', border: '1px solid #333', 
                                        textDecoration: 'none', color: 'white',
                                        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.4)', transition: 'transform 0.1s'
                                    }}
                                >
                                    <span style={{ fontSize: '0.65rem', color: '#a1a1aa', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '2px' }}>GET IT ON</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <svg width="18" height="19" viewBox="0 0 512 512" fill="#fff"><path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1 220.7 221.3z" fillRule="evenodd"/></svg>
                                        Google Play
                                    </span>
                                </a>
                            </div>

                            {/* OPEN IN NATIVE APP ESCAPE HATCH */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.5rem' }}>
                                <a
                                    href={`beanpool://welcome?invite=${inviteCode || new URLSearchParams(window.location.search).get('invite')}`}
                                    style={{
                                        display: 'block', width: '100%', padding: '1rem', borderRadius: '12px',
                                        border: '1px solid #3b82f6', background: 'transparent', textDecoration: 'none',
                                        color: '#3b82f6', fontSize: '1rem', fontWeight: 700, 
                                        cursor: 'pointer', fontFamily: 'inherit'
                                    }}
                                >
                                    🚀 I already have the BeanPool App
                                </a>
                            </div>

                            <button
                                onClick={() => setIsTrampoline(false)}
                                style={{
                                    background: 'none', border: 'none',
                                    color: '#64748b', fontSize: '0.85rem',
                                    cursor: 'pointer', marginTop: '2rem', fontFamily: 'inherit',
                                    textDecoration: 'underline'
                                }}
                            >
                                Continue in Web Browser Instead
                            </button>
                        </>
                    ) : showNewUser ? (
                        /* ===== NEW USER SIGNUP + FAQs ===== */
                        <>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                🎟️ Join with Invite Code
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                                Got an invite code or scanned a QR? Enter it below with your chosen callsign to join.
                            </p>

                            <label style={{
                                display: 'block', textAlign: 'left',
                                fontSize: '0.85rem', fontWeight: 600,
                                color: 'var(--text-secondary)', marginBottom: '0.5rem',
                            }}>
                                Invite Code
                            </label>
                            <input
                                type="text"
                                value={inviteCode}
                                onChange={(e) => setInviteCode(formatInviteCode(e.target.value))}
                                placeholder="e.g. BP-7K3X-9M2W"
                                maxLength={800}
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
                                display: 'block', textAlign: 'left',
                                fontSize: '0.85rem', fontWeight: 600,
                                color: 'var(--text-secondary)', marginBottom: '0.5rem',
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
                                    width: '100%', padding: '0.85rem', borderRadius: '10px',
                                    border: 'none',
                                    background: loading ? '#555' : '#2563eb',
                                    color: 'var(--text-primary)', fontSize: '1rem',
                                    fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit', transition: 'background 0.2s',
                                }}
                            >
                                {loading ? 'Joining...' : inviteCode.trim()
                                    ? 'Join with Invite'
                                    : 'Create Sovereign Identity'}
                            </button>

                            {/* ===== FAQs ===== */}
                            <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-primary, #333)', paddingTop: '1.25rem' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                                    ❓ Frequently Asked Questions
                                </h4>
                                {FAQ_ITEMS.map((faq, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            borderTop: i > 0 ? '1px solid var(--border-primary, #222)' : 'none',
                                            padding: '0.65rem 0',
                                        }}
                                    >
                                        <div
                                            onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                            style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                                                color: 'var(--text-primary)',
                                                textAlign: 'left',
                                            }}
                                        >
                                            {faq.q}
                                            <span style={{
                                                fontSize: '0.7rem', color: 'var(--text-muted)',
                                                transition: 'transform 0.2s',
                                                transform: openFaq === i ? 'rotate(90deg)' : 'none',
                                                flexShrink: 0, marginLeft: '0.5rem',
                                            }}>▶</span>
                                        </div>
                                        {openFaq === i && (
                                            <p style={{
                                                fontSize: '0.78rem', color: 'var(--text-muted)',
                                                lineHeight: 1.5, marginTop: '0.4rem', textAlign: 'left',
                                            }}>
                                                {faq.a}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => { setShowNewUser(false); setError(null); }}
                                style={{
                                    background: 'none', border: 'none',
                                    color: 'var(--text-muted)', fontSize: '0.8rem',
                                    cursor: 'pointer', marginTop: '1rem', fontFamily: 'inherit',
                                }}
                            >
                                ← Back
                            </button>
                        </>
                    ) : !showImport ? (
                        /* ===== MAIN WELCOME — two simple choices ===== */
                        <>
                            {!showMemberOptions ? (
                                /* DEFAULT: Two clear choices */
                                <>
                                    <button
                                        onClick={() => setShowMemberOptions(true)}
                                        style={{
                                            width: '100%', padding: '1.1rem 1rem', borderRadius: '14px',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                            color: '#fff', fontSize: '1.1rem', fontWeight: 700,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                            marginBottom: '1rem',
                                            boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
                                            transition: 'transform 0.15s',
                                        }}
                                        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                                        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                    >
                                        I'm Already a Member →
                                    </button>

                                    <button
                                        onClick={() => setShowNewUser(true)}
                                        style={{
                                            width: '100%', padding: '0.9rem 1rem', borderRadius: '14px',
                                            border: '1px solid var(--border-primary, #333)',
                                            background: 'transparent',
                                            color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                            transition: 'transform 0.15s',
                                        }}
                                        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                                        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                    >
                                        I'm New Here
                                    </button>
                                </>
                            ) : (
                                /* MEMBER SUB-OPTIONS */
                                <>
                                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                        Sign in to your account
                                    </h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                                        Choose how to restore your identity on this device:
                                    </p>

                                    <button
                                        onClick={() => { setShowImport(true); setError(null); }}
                                        style={{
                                            width: '100%', padding: '1rem 1rem', borderRadius: '14px',
                                            border: '1px solid #2563eb66',
                                            background: 'linear-gradient(135deg, rgba(37,99,235,0.2), rgba(37,99,235,0.06))',
                                            color: '#93bbfc', fontSize: '1.05rem', fontWeight: 700,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                                            marginBottom: '0.75rem',
                                            transition: 'transform 0.15s',
                                        }}
                                        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                                        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                    >
                                        📲 I have a Transfer Link
                                    </button>

                                    <button
                                        onClick={() => { setShowRecovery(true); setError(null); }}
                                        style={{
                                            width: '100%', padding: '1rem 1rem', borderRadius: '14px',
                                            border: '1px solid #f59e0b66',
                                            background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.06))',
                                            color: '#fcd171', fontSize: '1.05rem', fontWeight: 700,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                                            transition: 'transform 0.15s',
                                        }}
                                        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                                        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                    >
                                        🔑 Recover with 12 Words
                                    </button>

                                    <button
                                        onClick={() => setShowMemberOptions(false)}
                                        style={{
                                            background: 'none', border: 'none',
                                            color: 'var(--text-muted)', fontSize: '0.8rem',
                                            cursor: 'pointer', marginTop: '1rem', fontFamily: 'inherit',
                                        }}
                                    >
                                        ← Back
                                    </button>
                                </>
                            )}
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
