/**
 * SettingsPage — Identity management + export/import
 *
 * Shows the current identity details and provides
 * tools for transferring identity between devices.
 */

import { useState } from 'react';
import { type BeanPoolIdentity } from '../lib/identity';
import { exportIdentity, decryptIdentity } from '../lib/identity-transfer';
import { importIdentity } from '../lib/identity';
import { ProfilePage } from './ProfilePage';
import { type Theme } from '../lib/useTheme';

interface Props {
    identity: BeanPoolIdentity;
    onIdentityUpdated: (identity: BeanPoolIdentity) => void;
    onBack: () => void;
    theme: Theme;
    onToggleTheme: () => void;
}

export function SettingsPage({ identity, onIdentityUpdated, onBack, theme, onToggleTheme }: Props) {
    const [mode, setMode] = useState<'menu' | 'export' | 'import' | 'profile'>('menu');
    const [pin, setPin] = useState('');
    const [exportUri, setExportUri] = useState('');
    const [importData, setImportData] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const fingerprint = identity.publicKey.slice(0, 16) + '…';

    async function handleExport() {
        if (pin.length < 4) {
            setError('PIN must be at least 4 digits.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const uri = await exportIdentity(identity, pin);
            setExportUri(uri);
        } catch {
            setError('Export failed.');
        } finally {
            setLoading(false);
        }
    }

    async function handleImport() {
        if (pin.length < 4) {
            setError('PIN must be at least 4 digits.');
            return;
        }
        if (!importData.trim()) {
            setError('Paste the identity transfer code.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const imported = await decryptIdentity(importData.trim(), pin);
            await importIdentity(imported);
            setSuccess(`Imported identity: ${imported.callsign}`);
            onIdentityUpdated(imported);
        } catch {
            setError('Decryption failed — wrong PIN or invalid code.');
        } finally {
            setLoading(false);
        }
    }

    const cardStyle: React.CSSProperties = {
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: '16px',
        padding: '1.5rem',
        marginBottom: '1rem',
        boxShadow: 'var(--shadow-card)',
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: '10px',
        border: '1px solid var(--border-input)',
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        fontSize: '1rem',
        fontFamily: 'inherit',
        outline: 'none',
        marginBottom: '0.75rem',
    };

    const btnStyle = (active: boolean): React.CSSProperties => ({
        width: '100%',
        padding: '0.85rem',
        borderRadius: '10px',
        border: 'none',
        background: active ? '#2563eb' : '#333',
        color: 'var(--text-primary)',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: active ? 'pointer' : 'not-allowed',
        fontFamily: 'inherit',
        transition: 'background 0.2s',
    });

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '2rem',
            minHeight: '100vh',
        }}>
            <div style={{ maxWidth: '420px', width: '100%' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <button
                        onClick={onBack}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563eb',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            padding: '0.5rem',
                        }}
                    >
                        ← Back
                    </button>
                    <h2 style={{ flex: 1, textAlign: 'center', fontSize: '1.2rem', fontWeight: 700 }}>
                        Settings
                    </h2>
                    <div style={{ width: '60px' }} />
                </div>

                {/* Identity Card */}
                <div style={cardStyle}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Callsign</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.75rem' }}>{identity.callsign}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Public Key</div>
                    <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--accent)' }}>{fingerprint}</div>
                </div>

                {/* Theme Toggle */}
                <div style={{
                    ...cardStyle,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem 1.5rem',
                }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                        {theme === 'dark' ? '🌙 Dark Theme' : '☀️ Light Theme'}
                    </span>
                    <button
                        onClick={onToggleTheme}
                        style={{
                            width: '52px',
                            height: '28px',
                            borderRadius: '14px',
                            border: 'none',
                            background: theme === 'light' ? 'var(--accent)' : '#444',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.3s',
                            padding: 0,
                        }}
                    >
                        <span style={{
                            display: 'block',
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: '#fff',
                            position: 'absolute',
                            top: '3px',
                            left: theme === 'light' ? '27px' : '3px',
                            transition: 'left 0.3s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                    </button>
                </div>

                {mode === 'menu' && (
                    <>
                        <button
                            onClick={() => setMode('profile')}
                            style={{ ...btnStyle(true), marginBottom: '0.75rem' }}
                        >
                            👤 Edit Profile
                        </button>
                        <button
                            onClick={() => { setMode('export'); setPin(''); setExportUri(''); setError(null); }}
                            style={{ ...btnStyle(true), marginBottom: '0.75rem' }}
                        >
                            📤 Export Identity to Another Device
                        </button>
                        <button
                            onClick={() => { setMode('import'); setPin(''); setImportData(''); setError(null); }}
                            style={btnStyle(true)}
                        >
                            📥 Import Identity from Another Device
                        </button>
                    </>
                )}

                {mode === 'export' && (
                    <div style={cardStyle}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>📤 Export Identity</h3>
                        {!exportUri ? (
                            <>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                                    Choose a PIN to protect your identity during transfer.
                                    You'll need this same PIN on the receiving device.
                                </p>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    placeholder="Enter PIN (4+ digits)"
                                    style={inputStyle}
                                />
                                {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
                                <button onClick={handleExport} disabled={loading} style={btnStyle(!loading && pin.length >= 4)}>
                                    {loading ? 'Encrypting...' : 'Generate Transfer Code'}
                                </button>
                            </>
                        ) : (
                            <>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                                    Your encrypted identity link is ready. Send it to your other device.
                                </p>
                                <div style={{
                                    background: 'var(--bg-secondary)', borderRadius: '10px',
                                    border: '1px solid var(--border-input)', padding: '0.75rem',
                                    marginBottom: '0.75rem', wordBreak: 'break-all',
                                    fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-faint)',
                                    maxHeight: '80px', overflow: 'hidden',
                                }}>
                                    {exportUri.slice(0, 120)}...
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(exportUri);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            } catch {
                                                const el = document.createElement('textarea');
                                                el.value = exportUri;
                                                document.body.appendChild(el);
                                                el.select();
                                                document.execCommand('copy');
                                                document.body.removeChild(el);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            }
                                        }}
                                        style={{
                                            ...btnStyle(true),
                                            flex: 1,
                                            background: copied ? '#22c55e' : '#2563eb',
                                        }}
                                    >
                                        {copied ? '✓ Copied!' : '📋 Copy Link'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const shareData = {
                                                title: 'BeanPool Identity Transfer',
                                                text: `Import your BeanPool identity (PIN: ${pin})`,
                                                url: exportUri,
                                            };
                                            if (navigator.share) {
                                                try { await navigator.share(shareData); } catch { /* cancelled */ }
                                            } else {
                                                await navigator.clipboard.writeText(exportUri);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            }
                                        }}
                                        style={{ ...btnStyle(true), flex: 1, background: '#333' }}
                                    >
                                        📤 Share
                                    </button>
                                </div>
                                <p style={{ color: '#22c55e', fontSize: '0.85rem' }}>
                                    🔑 PIN: <strong>{pin}</strong> — you'll need this on the receiving device
                                </p>
                            </>
                        )}
                        <button
                            onClick={() => setMode('menu')}
                            style={{ ...btnStyle(true), background: '#333', marginTop: '0.5rem' }}
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {mode === 'import' && (
                    <div style={cardStyle}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>📥 Import Identity</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                            Paste the transfer code from your other device and enter the same PIN.
                        </p>
                        <textarea
                            value={importData}
                            onChange={(e) => setImportData(e.target.value)}
                            placeholder="Paste the identity transfer link here"
                            style={{
                                ...inputStyle,
                                minHeight: '100px',
                                resize: 'none',
                                fontSize: '0.8rem',
                                fontFamily: 'monospace',
                            }}
                        />
                        <input
                            type="password"
                            inputMode="numeric"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="Enter PIN"
                            style={inputStyle}
                        />
                        {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
                        {success && <p style={{ color: '#22c55e', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{success}</p>}
                        <button onClick={handleImport} disabled={loading} style={btnStyle(!loading && pin.length >= 4)}>
                            {loading ? 'Decrypting...' : 'Import Identity'}
                        </button>
                        <button
                            onClick={() => setMode('menu')}
                            style={{ ...btnStyle(true), background: '#333', marginTop: '0.5rem' }}
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {mode === 'profile' && (
                    <ProfilePage
                        identity={identity}
                        onBack={() => setMode('menu')}
                        onIdentityUpdated={onIdentityUpdated}
                    />
                )}
            </div>
        </div>
    );
}
