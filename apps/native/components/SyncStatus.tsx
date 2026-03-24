import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getLastSyncTime } from '../services/pillar-sync';

function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

export function SyncStatus() {
    const [lastSync, setLastSync] = useState<number | null>(null);

    useEffect(() => {
        async function checkSync() {
            const time = await getLastSyncTime();
            setLastSync(time);
        }
        
        checkSync();
        const interval = setInterval(checkSync, 10000);
        return () => clearInterval(interval);
    }, []);

    // For the native UI, if we synced within the last 5 minutes, we consider it 'Online / Synced'.
    const isOnline = lastSync !== null && (Date.now() - lastSync) < 5 * 60 * 1000;

    return (
        <View style={[styles.container, isOnline ? styles.onlineBorder : styles.offlineBorder]}>
            <View style={[styles.dot, isOnline ? styles.onlineDot : styles.offlineDot]} />
            <Text style={[styles.text, isOnline ? styles.onlineText : styles.offlineText]}>
                {isOnline ? 'Online' : 'Offline'}
            </Text>
            {lastSync && (
                <Text style={styles.timeText}>
                    {formatTimeAgo(lastSync)}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 9999,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderStyle: 'solid'
    },
    onlineBorder: { borderColor: 'rgba(16, 185, 129, 0.3)' },
    offlineBorder: { borderColor: 'rgba(239, 68, 68, 0.3)' },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    onlineDot: { backgroundColor: '#10b981' },
    offlineDot: { backgroundColor: '#ef4444' },
    text: { fontSize: 12, fontWeight: '600', marginRight: 6 },
    onlineText: { color: '#10b981' },
    offlineText: { color: '#ef4444' },
    timeText: { color: '#9ca3af', fontSize: 11, fontWeight: '500' }
});
