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
import { connectToAnchor } from './lib/sync';
import { useTheme } from './lib/useTheme';
import { SyncStatus } from './components/SyncStatus';
import { PrivacyBadge } from './components/PrivacyBadge';
import { WelcomePage } from './pages/WelcomePage';
import { MarketplacePage } from './pages/MarketplacePage';
import { LedgerPage } from './pages/LedgerPage';
import { SettingsPage } from './pages/SettingsPage';
import { MapPage } from './pages/MapPage';
import { PeoplePage } from './pages/PeoplePage';
import { MessagesPage } from './pages/MessagesPage';
import { InstallPrompt } from './components/InstallPrompt';

type Tab = 'map' | 'marketplace' | 'messages' | 'people' | 'ledger';

export function App() {
    const [identity, setIdentity] = useState<BeanPoolIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('map');
    const [showSettings, setShowSettings] = useState(false);
    const [openConversationId, setOpenConversationId] = useState<string | null>(null);
    const [openNewPost, setOpenNewPost] = useState(false);
    const [theme, toggleTheme] = useTheme();

    function navigateToTab(tab: string, conversationId?: string) {
        if (tab === 'map-post') {
            setActiveTab('map');
            setOpenNewPost(true);
            return;
        }
        setActiveTab(tab as Tab);
        if (conversationId) setOpenConversationId(conversationId);
    }

    // Load existing identity on mount
    useEffect(() => {
        loadIdentity()
            .then(setIdentity)
            .finally(() => setLoading(false));
    }, []);

    // Connect to BeanPool Node once identity is loaded
    useEffect(() => {
        if (identity) {
            connectToAnchor();
            // Ensure existing users are registered with the node
            import('./lib/api').then(({ registerMember }) =>
                registerMember(identity.publicKey, identity.callsign).catch(() => {})
            );
        }
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
            {/* Header — overlay on map, normal on other tabs */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: activeTab === 'map' ? 'none' : '1px solid var(--border-secondary)',
                background: activeTab === 'map' ? 'var(--header-overlay)' : 'var(--header-bg)',
                position: activeTab === 'map' ? 'absolute' : 'sticky',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                backdropFilter: activeTab === 'map' ? 'blur(8px)' : 'none',
                WebkitBackdropFilter: activeTab === 'map' ? 'blur(8px)' : 'none',
            }}>
                <SyncStatus />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <PrivacyBadge />
                    <button
                        onClick={() => setShowSettings(true)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            padding: '0.25rem',
                        }}
                        title="Settings"
                    >
                        ⚙️
                    </button>
                </div>
            </header>

            {/* Content */}
            <main style={{
                flex: 1,
                minHeight: 0,
                overflowY: activeTab === 'map' ? 'hidden' : 'auto',
                paddingBottom: activeTab === 'map' ? '0' : '4rem',
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
                        {activeTab === 'map' && <MapPage identity={identity} openNewPost={openNewPost} onOpenNewPostHandled={() => setOpenNewPost(false)} onNavigate={(tab) => navigateToTab(tab)} />}
                        {activeTab === 'marketplace' && <MarketplacePage identity={identity} onNavigate={(tab, convId) => navigateToTab(tab, convId)} />}
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
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            flex: 1,
                            padding: '0.75rem',
                            background: 'transparent',
                            border: 'none',
                            color: activeTab === tab.id ? '#2563eb' : '#666',
                            fontSize: '0.75rem',
                            fontWeight: activeTab === tab.id ? 700 : 400,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.2rem',
                            transition: 'color 0.2s',
                            borderTop: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                    >
                        <span style={{ fontSize: '1.2rem' }}>{tab.emoji}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </nav>

            {/* PWA Install Banner */}
            <InstallPrompt />
        </div>
    );
}
