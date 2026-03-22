/**
 * App Shell — Main layout with bottom navigation
 *
 * Handles:
 * - Identity gate (first-run → WelcomePage)
 * - Tab routing (Marketplace / Ledger)
 * - Persistent header with SyncStatus + PrivacyBadge
 */

import { useState, useEffect } from 'react';
import { loadIdentity, type BeanPoolIdentity } from './lib/identity';
import { connectToAnchor, onSystemAnnouncement } from './lib/sync';
import { getConversations } from './lib/api';
import { useTheme } from './lib/useTheme';
import { SyncStatus } from './components/SyncStatus';
import { WelcomePage } from './pages/WelcomePage';
import { MarketplacePage } from './pages/MarketplacePage';
import { LedgerPage } from './pages/LedgerPage';
import { SettingsPage } from './pages/SettingsPage';
import { MapPage } from './pages/MapPage';
import { PeoplePage } from './pages/PeoplePage';
import { MessagesPage } from './pages/MessagesPage';
import { InstallPrompt } from './components/InstallPrompt';

function HeaderControls({ showSettings, setShowSettings }: { showSettings: boolean, setShowSettings: (v: boolean) => void }) {
    const [locationEnabled, setLocationEnabled] = useState(() => {
        // Tie to legacy tier 3 (Live) vs tier 0 (Ghost) logic
        const saved = localStorage.getItem('beanpool-privacy-tier');
        return saved === '3';
    });

    const toggleLocation = () => {
        const nextState = !locationEnabled;
        setLocationEnabled(nextState);
        localStorage.setItem('beanpool-privacy-tier', nextState ? '3' : '0');
        if ('vibrate' in navigator) navigator.vibrate(50);
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.6rem',
            borderRadius: '9999px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-secondary)',
            height: '26px', // Geometric balance with SyncStatus
        }}>
            <button
                onClick={toggleLocation}
                title={locationEnabled ? "Location: On (Live)" : "Location: Off (Ghost)"}
                className="text-nature-600 dark:text-nature-400 hover:text-nature-900 dark:hover:text-nature-200 transition-colors flex items-center justify-center p-0"
            >
                {locationEnabled ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                    </svg>
                )}
            </button>

            <div className="w-[1px] h-[12px] bg-nature-200 dark:bg-nature-700 mx-[1px]" />

            <button
                onClick={() => setShowSettings(!showSettings)}
                title="Settings"
                className={`flex items-center justify-center transition-colors p-0 ${
                    showSettings 
                        ? 'text-accent dark:text-accent' 
                        : 'text-nature-600 dark:text-nature-400 hover:text-nature-900 dark:hover:text-nature-200'
                }`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
            </button>
        </div>
    );
}

type Tab = 'map' | 'marketplace' | 'messages' | 'people' | 'ledger';

export function App() {
    const [identity, setIdentity] = useState<BeanPoolIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('map');
    const [showSettings, setShowSettings] = useState(false);
    const [openConversationId, setOpenConversationId] = useState<string | null>(null);
    const [openMarketPostId, setOpenMarketPostId] = useState<string | null>(null);
    const [openNewPost, setOpenNewPost] = useState(false);
    const [theme, toggleTheme] = useTheme();
    const [sysAnnouncement, setSysAnnouncement] = useState<{ title: string, body: string, severity: string } | null>(null);
    const [totalUnread, setTotalUnread] = useState(0);
    const [marketClickCount, setMarketClickCount] = useState(0);

    function navigateToTab(tab: string, contextId?: string) {
        if (tab === 'map-post') {
            setActiveTab('map');
            setOpenNewPost(true);
            return;
        }
        setActiveTab(tab as Tab);
        if (tab === 'messages' && contextId) setOpenConversationId(contextId);
        if (tab === 'marketplace' && contextId) setOpenMarketPostId(contextId);
    }

    // Load existing identity on mount
    useEffect(() => {
        loadIdentity()
            .then(setIdentity)
            .finally(() => setLoading(false));
    }, []);

    // Connect to BeanPool Node once identity is loaded
    useEffect(() => {
        let unsub = () => { };
        if (identity) {
            connectToAnchor();
            unsub = onSystemAnnouncement((a) => {
                setSysAnnouncement({ title: a.title, body: a.body, severity: a.severity });
            });
            // Ensure existing users are registered with the node
            import('./lib/api').then(({ registerMember }) =>
                registerMember(identity.publicKey, identity.callsign).catch(() => { })
            );
        }
        return unsub;
    }, [identity]);

    // Poll unread message count
    useEffect(() => {
        if (!identity) return;
        const pollUnread = async () => {
            try {
                const result = await getConversations(identity.publicKey);
                setTotalUnread(result.totalUnread || 0);
            } catch { /* offline */ }
        };
        pollUnread();
        const interval = setInterval(pollUnread, 10000);
        return () => clearInterval(interval);
    }, [identity]);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                color: '#888',
                fontSize: '1.1rem',
            }}>
                Loading...
            </div>
        );
    }

    // First-run gate
    if (!identity) {
        return <WelcomePage onComplete={setIdentity} />;
    }

    const TABS: { id: Tab; label: string; emoji: string }[] = [
        { id: 'map', label: 'Map', emoji: '🗺️' },
        { id: 'marketplace', label: 'Market', emoji: '🤝' },
        { id: 'messages', label: 'Chat', emoji: '💬' },
        { id: 'people', label: 'People', emoji: '👥' },
        { id: 'ledger', label: 'Ledger', emoji: '📊' },
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
        }}>
            {/* Header with Premium Dynamic AI Banner */}
            <header className="relative shadow-md" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.3rem 0.75rem',
                borderBottom: (activeTab === 'map' && !showSettings) ? 'none' : '1px solid rgba(255,255,255,0.1)',
                position: (activeTab === 'map' && !showSettings) ? 'absolute' : 'sticky',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                backgroundImage: "url('/assets/header-bg.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}>
                {/* Subtle dark overlay to ensure text/buttons pop against the complex glowing mesh */}
                <div className="absolute inset-0 bg-black/10 dark:bg-black/50 pointer-events-none" />

                <div className="relative z-10">
                    <SyncStatus />
                </div>

                {/* Dynamic Page Title or Map Banner (Absolutely Centered) */}
                <div className="absolute left-1/2 -translate-x-1/2 flex justify-center items-center pointer-events-none z-10">
                    {activeTab !== 'map' || showSettings ? (
                        <span className="font-extrabold text-[1.2rem] tracking-tight text-nature-900 dark:text-white drop-shadow-md dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] pointer-events-auto">
                            {TABS.find(t => t.id === activeTab)?.label === 'Market' ? 'Marketplace' : TABS.find(t => t.id === activeTab)?.label}
                        </span>
                    ) : (
                        <div className="bg-white/60 dark:bg-nature-900/80 backdrop-blur-md px-5 py-1.5 rounded-full border border-white/50 dark:border-nature-700 shadow-sm pointer-events-auto flex items-center">
                            <span className="font-bold text-sm tracking-widest text-nature-900 dark:text-white lowercase drop-shadow-sm">
                                beanpool<span className="text-terra-600 dark:text-terra-400">.org</span>
                            </span>
                        </div>
                    )}
                </div>

                <div className="relative z-10" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <HeaderControls showSettings={showSettings} setShowSettings={setShowSettings} />
                </div>
            </header>

            {/* Content */}
            <main style={{
                flex: 1,
                minHeight: 0,
                overflowY: (activeTab === 'map' && !showSettings) ? 'hidden' : 'auto',
                paddingBottom: (activeTab === 'map' && !showSettings) ? '0' : '4rem',
                position: 'relative',
            }}>
                {showSettings ? (
                    <SettingsPage
                        identity={identity}
                        onIdentityUpdated={(updated) => { setIdentity(updated); setShowSettings(false); }}
                        onBack={() => setShowSettings(false)}
                        theme={theme}
                        onToggleTheme={toggleTheme}
                    />
                ) : (
                    <>
                        {activeTab === 'map' && <MapPage identity={identity} openNewPost={openNewPost} onOpenNewPostHandled={() => setOpenNewPost(false)} onNavigate={(tab, ctxId) => navigateToTab(tab, ctxId)} />}
                        {activeTab === 'marketplace' && <MarketplacePage identity={identity} marketClickCount={marketClickCount} openPostId={openMarketPostId} onPostOpened={() => setOpenMarketPostId(null)} onNavigate={(tab, ctxId) => navigateToTab(tab, ctxId)} />}
                        {activeTab === 'messages' && <MessagesPage identity={identity} openConversationId={openConversationId} onConversationOpened={() => setOpenConversationId(null)} />}
                        {activeTab === 'people' && <PeoplePage identity={identity} />}
                        {activeTab === 'ledger' && <LedgerPage identity={identity} />}
                    </>
                )}
            </main>

            {/* Bottom nav */}
            <nav style={{
                display: 'flex',
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'var(--nav-bg)',
                borderTop: '1px solid var(--border-secondary)',
                zIndex: 100,
            }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id && !showSettings;
                    return (
                    <button
                        key={tab.id}
                        onClick={() => {
                            if (tab.id === 'marketplace') {
                                setMarketClickCount(c => c + 1);
                            }
                            setActiveTab(tab.id);
                            setShowSettings(false);
                        }}
                        style={{
                            flex: 1,
                            padding: '0.4rem',
                            background: 'transparent',
                            border: 'none',
                            color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                            fontSize: '0.7rem',
                            fontWeight: isActive ? 700 : 400,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.2rem',
                            transition: 'color 0.2s',
                            borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                    >
                        <span style={{ fontSize: '1.2rem', position: 'relative' }}>
                            {tab.emoji}
                            {tab.id === 'messages' && totalUnread > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: '-6px',
                                    right: '-10px',
                                    background: 'var(--danger)',
                                    color: '#fff',
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    minWidth: '16px',
                                    height: '16px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0 3px',
                                    lineHeight: 1,
                                    boxShadow: '0 0 6px var(--danger)',
                                }}>
                                    {totalUnread > 99 ? '99+' : totalUnread}
                                </span>
                            )}
                        </span>
                        <span>{tab.label}</span>
                    </button>
                    );
                })}
            </nav>

            {/* System Announcement Modal */}
            {sysAnnouncement && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem', backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: 'var(--bg-primary)',
                        border: `2px solid ${sysAnnouncement.severity === 'critical' ? '#ef4444' : sysAnnouncement.severity === 'warning' ? '#f59e0b' : '#3b82f6'}`,
                        borderRadius: '12px', padding: '1.5rem',
                        maxWidth: '400px', width: '100%',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        textAlign: 'center'
                    }}>
                        <h2 style={{
                            margin: '0 0 1rem', fontSize: '1.5rem',
                            color: sysAnnouncement.severity === 'critical' ? '#ef4444' : sysAnnouncement.severity === 'warning' ? '#f59e0b' : '#3b82f6'
                        }}>
                            {sysAnnouncement.severity === 'critical' ? '🚨 ' : sysAnnouncement.severity === 'warning' ? '⚠️ ' : 'ℹ️ '}
                            {sysAnnouncement.title}
                        </h2>
                        <p style={{ margin: '0 0 1.5rem', lineHeight: 1.5, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            {sysAnnouncement.body}
                        </p>
                        <button
                            onClick={() => setSysAnnouncement(null)}
                            style={{
                                width: '100%', padding: '0.8rem',
                                background: sysAnnouncement.severity === 'critical' ? '#ef4444' : sysAnnouncement.severity === 'warning' ? '#f59e0b' : '#3b82f6',
                                color: '#fff', border: 'none', borderRadius: '8px',
                                fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer'
                            }}
                        >
                            Acknowledge
                        </button>
                    </div>
                </div>
            )}

            {/* PWA Install Banner */}
            <InstallPrompt />
        </div>
    );
}
