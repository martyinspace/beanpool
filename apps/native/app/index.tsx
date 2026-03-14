/**
 * Pillar Dashboard — Sync status and manual trigger
 *
 * This is a minimal control surface for the background Pillar Toggle.
 * The primary user interface is the PWA.
 */

import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { performSync, getLastSyncTime, type SyncResult } from '../services/pillar-sync';

function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

export default function PillarDashboard() {
    const [lastSync, setLastSync] = useState<number | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [lastResult, setLastResult] = useState<SyncResult | null>(null);

    const refreshLastSync = useCallback(async () => {
        const time = await getLastSyncTime();
        setLastSync(time);
    }, []);

    useEffect(() => {
        refreshLastSync();
        const interval = setInterval(refreshLastSync, 10_000);
        return () => clearInterval(interval);
    }, [refreshLastSync]);

    async function handleManualSync() {
        setSyncing(true);
        try {
            const result = await performSync();
            setLastResult(result);
            await refreshLastSync();
        } catch (err) {
            console.error('Manual sync failed:', err);
        } finally {
            setSyncing(false);
        }
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>🫘 BeanPool Pillar</Text>
                <Text style={styles.subtitle}>Background Mesh Mirror</Text>
            </View>

            {/* Sync Status Card */}
            <View style={styles.card}>
                <View style={styles.statusRow}>
                    <View style={[
                        styles.statusDot,
                        { backgroundColor: lastSync ? '#10b981' : '#ef4444' },
                    ]} />
                    <Text style={styles.statusText}>
                        {lastSync ? `Last synced ${formatTimeAgo(lastSync)}` : 'Never synced'}
                    </Text>
                </View>

                {lastResult && (
                    <View style={styles.resultBox}>
                        <Text style={styles.resultLabel}>Last Result</Text>
                        <Text style={styles.resultText}>
                            {lastResult.success ? '✅ Synced' : lastResult.aborted ? '⏸ Aborted (timeout)' : '❌ Failed'}
                        </Text>
                        <Text style={styles.resultMeta}>
                            Delta: {lastResult.deltaCount} accounts · {lastResult.durationMs}ms
                        </Text>
                        {lastResult.merkleRoot && (
                            <Text style={styles.resultHash}>
                                Root: {lastResult.merkleRoot.substring(0, 20)}...
                            </Text>
                        )}
                    </View>
                )}
            </View>

            {/* Manual Sync Button */}
            <Pressable
                onPress={handleManualSync}
                disabled={syncing}
                style={({ pressed }) => [
                    styles.syncButton,
                    syncing && styles.syncButtonDisabled,
                    pressed && styles.syncButtonPressed,
                ]}
            >
                <Text style={styles.syncButtonText}>
                    {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
                </Text>
            </Pressable>

            {/* Info */}
            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>How Pillar Works</Text>
                <Text style={styles.infoText}>
                    This app mirrors the community ledger in the background.
                    Every 15 minutes, it wakes up and compares Merkle hashes
                    with the BeanPool node. If they match, sync costs 0 bytes.
                    If not, only the changed data is downloaded.
                </Text>
                <Text style={styles.infoText}>
                    History is pruned to the last 1,000 transactions to
                    protect your device storage.
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        padding: 16,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#888',
    },
    card: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#333',
        padding: 20,
        marginBottom: 16,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    statusText: {
        color: '#ccc',
        fontSize: 15,
        fontWeight: '500',
    },
    resultBox: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    resultLabel: {
        color: '#666',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    resultText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    resultMeta: {
        color: '#888',
        fontSize: 13,
    },
    resultHash: {
        color: '#555',
        fontSize: 11,
        fontFamily: 'monospace' as any,
        marginTop: 4,
    },
    syncButton: {
        backgroundColor: '#2563eb',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    syncButtonDisabled: {
        backgroundColor: '#555',
    },
    syncButtonPressed: {
        backgroundColor: '#1d4ed8',
    },
    syncButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    infoCard: {
        backgroundColor: '#111',
        borderRadius: 12,
        padding: 16,
        marginBottom: 32,
    },
    infoTitle: {
        color: '#aaa',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    infoText: {
        color: '#666',
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 8,
    },
});
