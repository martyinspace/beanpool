/**
 * SyncStatus — Highly visible sync indicator
 *
 * Shows connected/disconnected state and "Last synced X ago"
 * so users know when their Pillar-Sync is complete before
 * leaving Wi-Fi range.
 */

import { useState, useEffect } from 'react';
import { onSyncChange, type SyncState } from '../lib/sync';

function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

export function SyncStatus() {
    const [sync, setSync] = useState<SyncState>({
        connected: false,
        lastSyncTime: null,
        merkleRoot: null,
        accountCount: 0,
    });

    useEffect(() => {
        const unsub = onSyncChange(setSync);
        return unsub;
    }, []);

    // Auto-update the "time ago" label
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick((t) => t + 1), 10000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.75rem',
            borderRadius: '9999px',
            background: 'var(--bg-card)',
            border: `1px solid ${sync.connected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            fontSize: '0.75rem',
            fontWeight: 500,
            transition: 'all 0.3s ease',
        }}>
            <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: sync.connected ? '#10b981' : '#ef4444',
                animation: sync.connected ? 'pulse 2s infinite' : 'none',
                flexShrink: 0,
            }} />
            <span style={{ color: sync.connected ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>
                {sync.connected ? 'Online' : 'Offline'}
            </span>
            {sync.lastSyncTime && (
                <span style={{ color: 'var(--text-faint)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {formatTimeAgo(sync.lastSyncTime)}
                </span>
            )}
        </div>
    );
}
