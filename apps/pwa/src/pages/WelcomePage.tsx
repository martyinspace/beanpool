/**
 * WelcomePage — First-run identity bootstrap
 *
 * Shown when no identity exists. User enters a Callsign,
 * and an Ed25519 keypair is generated in-browser.
 */

import { useState } from 'react';
import { createIdentity, importIdentity, type BeanPoolIdentity } from '../lib/identity';
import { decryptIdentity } from '../lib/identity-transfer';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
    onComplete: (identity: BeanPoolIdentity) => void;
}

export function WelcomePage({ onComplete }: Props) {
    const [callsign, setCallsign] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [importData, setImportData] = useState('');
    const [importPin, setImportPin] = useState('');
    const [showPoster, setShowPoster] = useState(false);

    async function handleCreate() {
        const trimmed = callsign.trim();
        if (trimmed.length < 2) {
            setError('Callsign must be at least 2 characters.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const identity = await createIdentity(trimmed);
            // Register with the BeanPool node
            try {
                const { registerMember } = await import('../lib/api');
                await registerMember(identity.publicKey, identity.callsign);
            } catch { /* offline — will register on next sync */ }
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
            // Register with the BeanPool node
            try {
                const { registerMember } = await import('../lib/api');
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
        border: '1px solid #444',
        background: '#0f0f0f',
        color: '#fff',
        fontSize: '1rem',
        fontFamily: 'inherit',
        outline: 'none',
        marginBottom: '1rem',
    };

    const mainContent = (
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
                <p style={{ color: '#888', marginBottom: '2rem', lineHeight: 1.6 }}>
                    Your identity is yours. It lives on this device,
                    backed by cryptography — no passwords, no central accounts.
                </p>

                <div style={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
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
                                color: '#aaa',
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
                                    color: '#fff',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'background 0.2s',
                                }}
                            >
                                {loading ? 'Generating Identity...' : 'Create Sovereign Identity'}
                            </button>

                            <p style={{ color: '#555', fontSize: '0.75rem', marginTop: '1rem' }}>
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

                            <button
                                onClick={() => setShowPoster(true)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#666',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    marginTop: '0.75rem',
                                    fontFamily: 'inherit',
                                }}
                            >
                                📱 Invite someone — show QR
                            </button>
                        </>
                    ) : (
                        <>
                            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', textAlign: 'left' }}>
                                📥 Import Identity
                            </h3>
                            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5, textAlign: 'left' }}>
                                Paste the transfer code from your other device and enter the PIN.
                            </p>
                            <textarea
                                value={importData}
                                onChange={(e) => setImportData(e.target.value)}
                                placeholder="Paste beanpool://import?d=... here"
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
                                    color: '#fff',
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
                                    color: '#888',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    marginTop: '1rem',
                                    fontFamily: 'inherit',
                                }}
                            >
                                ← Back to Create
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
    function PosterOverlay() {
        const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
        return (
            <div
                onClick={() => setShowPoster(false)}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: '#0a0a0a',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 9999,
                    padding: '2rem',
                    cursor: 'pointer',
                }}
            >
                <div style={{ maxWidth: '420px', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🫘</div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
                        Join BeanPool
                    </h1>
                    <p style={{ color: '#888', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: 1.5 }}>
                        Sovereign marketplace. No accounts, no passwords.<br />Your identity is yours.
                    </p>

                    <div style={{
                        background: '#fff',
                        borderRadius: '20px',
                        padding: '1.5rem',
                        display: 'inline-block',
                        marginBottom: '1.5rem',
                        boxShadow: '0 0 40px rgba(37, 99, 235, 0.15)',
                    }}>
                        {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                        {/* @ts-ignore - qrcode.react ForwardRef type incompatible with @types/react@19.1.0 */}
                        <QRCodeSVG value={currentUrl} size={260} />
                    </div>

                    <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        📱 Scan with your phone camera to join
                    </p>

                    <p style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '0.85rem', marginBottom: '1rem' }}>
                        {currentUrl.replace('https://', '')}
                    </p>

                    <p style={{ color: '#444', fontSize: '0.7rem' }}>
                        Tap anywhere to close
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            {showPoster && <PosterOverlay />}
            {mainContent}
        </>
    );
}
