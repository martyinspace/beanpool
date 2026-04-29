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
import { getConversations, getMarketplacePosts, getMyMarketplaceTransactions } from './lib/api';
import { useTheme } from './lib/useTheme';
import { SyncStatus } from './components/SyncStatus';
import { WelcomePage } from './pages/WelcomePage';
import { MarketplacePage } from './pages/MarketplacePage';
import { LedgerPage } from './pages/LedgerPage';
import { SettingsPage } from './pages/SettingsPage';
import { lazy, Suspense } from 'react';
const MapPage = lazy(() => import('./pages/MapPage').then(m => ({ default: m.MapPage })));
import { PeoplePage } from './pages/PeoplePage';
import { MessagesPage } from './pages/MessagesPage';
import { ProjectsPage } from './pages/ProjectsPage';
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
        
        // Explicitly request location permission when toggling ON
        if (nextState && 'geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(() => {}, () => {});
        }
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
            width: '72px',
            justifyContent: 'center',
        }}>
            <button
                onClick={toggleLocation}
                title={locationEnabled ? "Location: On (Live)" : "Location: Off (Ghost)"}
                aria-label="Toggle Location"
                aria-pressed={locationEnabled}
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
                aria-label="Settings"
                aria-expanded={showSettings}
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

type Tab = 'map' | 'marketplace' | 'messages' | 'people' | 'ledger' | 'projects';

export function App() {
    const [identity, setIdentity] = useState<BeanPoolIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('map');
    const [peopleSubView, setPeopleSubView] = useState<'friends' | 'community' | 'invites' | 'guardians'>('friends');
    const [showSettings, setShowSettings] = useState(false);
    const [openConversationId, setOpenConversationId] = useState<string | null>(null);
    const [openMarketPostId, setOpenMarketPostId] = useState<string | null>(null);
    const [openNewPost, setOpenNewPost] = useState(false);
    const [theme, toggleTheme] = useTheme();
    const [sysAnnouncement, setSysAnnouncement] = useState<{ title: string, body: string, severity: string } | null>(null);
    const [totalUnread, setTotalUnread] = useState(0);
    const [pendingDealsCount, setPendingDealsCount] = useState(0);
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

    // Poll unread message count and active deals
    useEffect(() => {
        if (!identity) return;
        const pollUnread = async () => {
            try {
                const result = await getConversations(identity.publicKey);
                setTotalUnread(result.totalUnread || 0);

                // Poll marketplace for active deals + inbound requests
                const [posts, txs] = await Promise.all([
                    getMarketplacePosts(),
                    getMyMarketplaceTransactions(identity.publicKey)
                ]);
                
                const activeDeals = posts.filter(p => 
                    p.status === 'pending' && 
                    (p.authorPublicKey === identity.publicKey || p.acceptedBy === identity.publicKey)
                ).length;
                
                const pendingRequests = txs.filter(t => 
                    t.buyerPublicKey === identity.publicKey && t.status === 'requested'
                ).length;

                setPendingDealsCount(activeDeals + pendingRequests);
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
        { id: 'projects', label: 'Projects', emoji: '🌱' },
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
                backgroundImage: "url('/assets/neon-vines-banner.png')",
                backgroundSize: '150% auto',
                backgroundPosition: 'center',
            }}>
                {/* Subtle dark overlay to ensure text/buttons pop against the complex glowing mesh */}
                <div className="absolute inset-0 bg-black/10 dark:bg-black/50 pointer-events-none" />

                <div className="relative z-10" style={{ marginTop: '12px' }}>
                    <SyncStatus />
                </div>

                {/* Dynamic Page Title or Map Banner (Absolutely Centered) */}
                <div className="absolute left-1/2 -translate-x-1/2 flex justify-center items-center pointer-events-none z-10">
                    {activeTab !== 'map' || showSettings ? (
                        <span className="font-extrabold text-[1.4rem] tracking-tight text-rainbow drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] pointer-events-auto text-center" style={{ marginTop: '8px' }}>
                            {TABS.find(t => t.id === activeTab)?.label === 'Market' ? 'Marketplace' : TABS.find(t => t.id === activeTab)?.label}
                        </span>
                    ) : (
                        <div className="relative flex flex-col items-center pointer-events-auto" style={{ transform: 'translateX(-12px) translateY(-8px)' }}>
                            <img src="/logo.png" alt="BeanPool" style={{ width: '280px', height: '76px', marginTop: '-8px', marginBottom: '-12px', objectFit: 'contain' }} className="drop-shadow-sm" />
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ position: 'absolute', bottom: '-10px', right: '90px', width: '20px', height: '20px', opacity: 0.9, color: 'white' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                        </div>
                    )}
                </div>

                <div className="relative z-10" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '12px' }}>
                    <button
                        onClick={() => { setActiveTab('people'); setPeopleSubView('invites'); setShowSettings(false); }}
                        className="flex items-center justify-center px-3 bg-white dark:bg-nature-900 border border-nature-200 dark:border-nature-700 rounded-full shadow-sm cursor-pointer transition-transform hover:scale-105"
                        style={{ height: '26px' }}
                    >
                        <span className="text-nature-900 dark:text-white font-semibold text-[11px] tracking-wide uppercase">Invite</span>
                    </button>
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
                        {activeTab === 'map' && <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading map...</div>}><MapPage identity={identity} openNewPost={openNewPost} onOpenNewPostHandled={() => setOpenNewPost(false)} onNavigate={(tab, ctxId) => navigateToTab(tab, ctxId)} /></Suspense>}
                        {activeTab === 'marketplace' && <MarketplacePage identity={identity} marketClickCount={marketClickCount} openPostId={openMarketPostId} onPostOpened={() => setOpenMarketPostId(null)} onNavigate={(tab, ctxId) => navigateToTab(tab, ctxId)} />}
                        {activeTab === 'messages' && <MessagesPage identity={identity} openConversationId={openConversationId} onConversationOpened={() => setOpenConversationId(null)} />}
                        {activeTab === 'people' && <PeoplePage identity={identity} initialView={peopleSubView} />}
                        {activeTab === 'ledger' && <LedgerPage identity={identity} />}
                        {activeTab === 'projects' && <ProjectsPage identity={identity} />}
                    </>
                )}
            </main>

            {/* Bottom nav */}
            <nav className="relative" style={{
                display: 'flex',
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundImage: "url('/assets/neon-vines-banner.png')",
                backgroundSize: '150% auto',
                backgroundPosition: 'center',
                borderTop: '1px solid #111',
                zIndex: 100,
                padding: '0.2rem 4px',
            }}>
                <div className="absolute inset-0 bg-black/30 pointer-events-none" />
                <div className="relative z-10 w-full flex gap-1">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id && !showSettings;
                    return (
                    <button
                        key={tab.id}
                        onClick={() => {
                            if (tab.id === 'marketplace') {
                                setMarketClickCount(c => c + 1);
                            }
                            if (tab.id === 'people' && activeTab !== 'people') {
                                setPeopleSubView('friends');
                            }
                            setActiveTab(tab.id);
                            setShowSettings(false);
                        }}
                        style={{
                            flex: 1,
                            padding: 0,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto',
                            gap: '0.1rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '10px',
                            background: 'rgba(0,0,0,0.45)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                            color: isActive ? undefined : '#fefefe',
                            transition: 'all 0.2s',
                        }}>
                            <span className="text-dark-aura" style={{ fontSize: '1.2rem', position: 'relative' }}>
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
                                        textShadow: 'none', // Reset shadow for badge readability
                                    }}>
                                        {totalUnread > 99 ? '99+' : totalUnread}
                                    </span>
                                )}
                                {tab.id === 'marketplace' && pendingDealsCount > 0 && (
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
                                        textShadow: 'none',
                                    }}>
                                        {pendingDealsCount}
                                    </span>
                                )}
                            </span>
                            <span className={isActive ? 'text-rainbow text-dark-aura' : 'text-dark-aura'} style={{ fontSize: '0.65rem', fontWeight: isActive ? 800 : 500 }}>
                                {tab.label}
                            </span>
                        </div>
                    </button>
                    );
                })}
                </div>
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
