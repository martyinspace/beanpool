/**
 * SettingsPage — Identity management + export/import
 *
 * Shows the current identity details and provides
 * tools for transferring identity between devices.
 */

import { useState } from 'react';
import { type BeanPoolIdentity } from '../lib/identity';
import { exportIdentity } from '../lib/identity-transfer';
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
    const [mode, setMode] = useState<'menu' | 'export' | 'profile'>('menu');
    const [pin, setPin] = useState('');
    const [exportUri, setExportUri] = useState('');
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



    return (
        <div className="flex justify-center p-4 min-h-screen bg-oat-50 dark:bg-nature-950 transition-colors">
            <div className="max-w-[420px] w-full mt-4">
                {/* Header */}
                <div className="flex items-center mb-6">
                    <div className="w-16" />
                    <h2 className="flex-1 text-center text-xl font-bold text-nature-950 dark:text-white tracking-tight m-0 transition-colors">
                        Settings
                    </h2>
                    <div className="w-16" />
                </div>

                {/* Identity Card */}
                <div className="bg-white dark:bg-nature-900 rounded-2xl p-6 mb-4 shadow-soft border border-nature-200 dark:border-nature-800 transition-colors">
                    <div className="text-xs font-semibold uppercase tracking-wider text-nature-500 dark:text-nature-400 mb-1">Callsign</div>
                    <div className="text-xl font-bold text-nature-950 dark:text-white mb-4 transition-colors">{identity.callsign}</div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-nature-500 dark:text-nature-400 mb-1">Public Key</div>
                    <div className="text-sm font-mono text-terra-600 dark:text-terra-400 bg-terra-50 dark:bg-terra-900/30 px-3 py-2 rounded-lg border border-terra-100 dark:border-terra-800/50 transition-colors break-all">{fingerprint}</div>
                </div>

                {/* Theme Toggle */}
                <div className="bg-white dark:bg-nature-900 rounded-2xl px-6 py-5 mb-6 shadow-soft border border-nature-200 dark:border-nature-800 flex justify-between items-center transition-colors">
                    <span className="text-[15px] font-bold text-nature-900 dark:text-white transition-colors">
                        {theme === 'dark' ? '🌙 Dark Theme' : '☀️ Light Theme'}
                    </span>
                    <button
                        onClick={onToggleTheme}
                        className={`w-14 h-[30px] rounded-full relative cursor-pointer outline-none transition-colors duration-300 ease-in-out border-2 shadow-inner ${
                            theme === 'light' ? 'bg-terra-100 border-terra-200' : 'bg-slate-700 border-slate-600'
                        }`}
                        aria-label="Toggle Theme"
                    >
                        <span className={`block w-[22px] h-[22px] rounded-full bg-white absolute top-[2px] shadow-sm transform transition-transform duration-300 ease-in-out ${
                            theme === 'dark' ? 'translate-x-[26px]' : 'translate-x-[2px] drop-shadow-[0_2px_4px_rgba(226,114,91,0.4)]'
                        }`} />
                    </button>
                </div>

                {mode === 'menu' && (
                    <div className="space-y-3">
                        <button
                            onClick={() => setMode('profile')}
                            className="w-full py-4 px-5 rounded-2xl bg-white dark:bg-nature-900 text-nature-900 dark:text-white font-bold border border-nature-200 dark:border-nature-800 shadow-sm hover:bg-nature-50 dark:hover:bg-nature-800 transition-colors text-left flex items-center justify-between group"
                        >
                            <span>👤 Edit Profile</span>
                            <span className="text-nature-400 dark:text-nature-500 group-hover:text-nature-600 dark:group-hover:text-nature-300 transition-colors">→</span>
                        </button>
                        <button
                            onClick={() => { setMode('export'); setPin(''); setExportUri(''); setError(null); }}
                            className="w-full py-4 px-5 rounded-2xl bg-white dark:bg-nature-900 text-nature-900 dark:text-white font-bold border border-nature-200 dark:border-nature-800 shadow-sm hover:bg-nature-50 dark:hover:bg-nature-800 transition-colors text-left flex items-center justify-between group"
                        >
                            <span>📤 Export Identity</span>
                            <span className="text-nature-400 dark:text-nature-500 group-hover:text-nature-600 dark:group-hover:text-nature-300 transition-colors">→</span>
                        </button>
                    </div>
                )}

                {mode === 'export' && (
                    <div className="bg-white dark:bg-nature-900 rounded-2xl p-6 shadow-soft border border-nature-200 dark:border-nature-800 animate-in fade-in slide-in-from-bottom-2 duration-300 transition-colors">
                        <h3 className="text-lg font-bold text-nature-950 dark:text-white mb-3 m-0 transition-colors">📤 Export Identity</h3>
                        {!exportUri ? (
                            <>
                                <p className="text-nature-600 dark:text-nature-400 text-[15px] mb-5 leading-relaxed transition-colors">
                                    Choose a PIN to protect your identity during transfer.
                                    You'll need this same PIN on the receiving device.
                                </p>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    placeholder="Enter PIN (4+ digits)"
                                    className="w-full py-3 px-4 mb-4 rounded-xl border border-nature-200 dark:border-nature-800 bg-oat-50/50 dark:bg-nature-950/50 text-nature-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-terra-300 dark:focus:ring-terra-600 transition-all font-mono text-center tracking-[0.2em] text-lg placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                                />
                                {error && <p className="text-red-500 dark:text-red-400 text-sm mb-4 font-medium px-1 animate-pulse">{error}</p>}
                                <button 
                                    onClick={handleExport} 
                                    disabled={loading || pin.length < 4} 
                                    className={`w-full py-3.5 rounded-xl font-bold transition-all shadow-sm ${
                                        !loading && pin.length >= 4 
                                            ? 'bg-nature-900 dark:bg-white text-white dark:text-nature-900 hover:bg-nature-800 dark:hover:bg-oat-100 hover:shadow-md' 
                                            : 'bg-oat-200 dark:bg-nature-800 text-oat-500 dark:text-nature-500 cursor-not-allowed'
                                    }`}
                                >
                                    {loading ? 'Encrypting...' : 'Generate Transfer Code'}
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-nature-600 dark:text-nature-400 text-[15px] mb-4 leading-relaxed transition-colors">
                                    Your encrypted identity link is ready. Send it to your other device.
                                </p>
                                <div className="bg-oat-50 dark:bg-nature-950 rounded-xl border border-nature-200 dark:border-nature-800 p-4 mb-4 break-all text-xs font-mono text-nature-500 dark:text-nature-400 h-24 overflow-hidden shadow-inner relative group transition-colors">
                                    <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-oat-50 dark:from-nature-950 to-transparent transition-colors"></div>
                                    {exportUri}
                                </div>
                                <div className="flex gap-2 mb-4">
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
                                        className={`flex-1 py-3 rounded-xl font-bold transition-all shadow-sm ${
                                            copied ? 'bg-emerald-500 dark:bg-emerald-600 text-white' : 'bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 text-white'
                                        }`}
                                    >
                                        {copied ? '✓ Copied!' : '📋 Copy'}
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
                                        className="flex-1 py-3 rounded-xl font-bold bg-nature-800 dark:bg-nature-700 hover:bg-nature-900 dark:hover:bg-nature-600 text-white shadow-sm transition-colors"
                                    >
                                        📤 Share
                                    </button>
                                </div>
                                <p className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 py-3 px-4 rounded-xl text-[15px] text-center mb-6 shadow-sm transition-colors">
                                    🔑 PIN: <strong className="font-mono text-lg tracking-widest bg-emerald-200/50 dark:bg-emerald-800/50 px-2 py-0.5 rounded mx-1 transition-colors">{pin}</strong>
                                </p>
                            </>
                        )}
                        <button
                            onClick={() => setMode('menu')}
                            className="w-full py-3 rounded-xl font-semibold bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-800 text-nature-600 dark:text-nature-400 hover:bg-nature-50 dark:hover:bg-nature-800 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                )}



                {mode === 'profile' && (
                    <div className="bg-white dark:bg-nature-900 rounded-2xl shadow-soft border border-nature-200 dark:border-nature-800 overflow-hidden transition-colors">
                        <ProfilePage
                            identity={identity}
                            onBack={() => setMode('menu')}
                            onIdentityUpdated={onIdentityUpdated}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
