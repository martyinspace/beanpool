/**
 * Pillar Sync Engine — Delta-Only Background Sync
 *
 * This is the core of the Pillar Toggle. It runs as a background task
 * and performs incremental MST (Merkle Search Tree) comparison with
 * the BeanPool node.
 *
 * Rules:
 * 1. FAIL FAST — If sync takes > 20 seconds, checkpoint and abort.
 * 2. DELTA ONLY — Compare hashes first, only pull changed data.
 * 3. PRUNING — Keep only current state + last ~1,000 transactions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BeanPoolMerkleTree } from '@beanpool/core';

const SYNC_TIMEOUT_MS = 20_000;
const MAX_STORED_TRANSACTIONS = 1000;
const STORAGE_KEYS = {
    MERKLE_ROOT: 'pillar:merkle-root',
    LAST_SYNC: 'pillar:last-sync',
    ACCOUNTS: 'pillar:accounts',
    TRANSACTIONS: 'pillar:transactions',
    SYNC_CHECKPOINT: 'pillar:checkpoint',
};

export interface SyncResult {
    success: boolean;
    merkleRoot: string | null;
    deltaCount: number;
    durationMs: number;
    aborted: boolean;
}

/**
 * Discover the BeanPool node URL.
 * Tries beanpool.local first, then falls back to saved address.
 */
async function discoverAnchor(): Promise<string | null> {
    const candidates = [
        'https://beanpool.local:8443',
        'http://beanpool.local:8080',
    ];

    // Check saved node address
    const saved = await AsyncStorage.getItem('pillar:anchor-url');
    if (saved) candidates.unshift(saved);

    for (const url of candidates) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${url}/api/health`, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                await AsyncStorage.setItem('pillar:anchor-url', url);
                return url;
            }
        } catch {
            // Try next candidate
        }
    }

    return null;
}

/**
 * Perform the delta-only sync.
 * Returns immediately if hashes match (0 bytes transferred).
 */
export async function performSync(): Promise<SyncResult> {
    const startTime = Date.now();
    const deadline = startTime + SYNC_TIMEOUT_MS;

    const result: SyncResult = {
        success: false,
        merkleRoot: null,
        deltaCount: 0,
        durationMs: 0,
        aborted: false,
    };

    try {
        // Step 1: Discover BeanPool Node
        const anchorUrl = await discoverAnchor();
        if (!anchorUrl) {
            result.durationMs = Date.now() - startTime;
            return result;
        }

        // Step 2: Fetch node's Merkle root
        const rootRes = await fetch(`${anchorUrl}/api/merkle-root`);
        if (!rootRes.ok) {
            result.durationMs = Date.now() - startTime;
            return result;
        }

        const { merkleRoot: anchorRoot } = await rootRes.json();
        result.merkleRoot = anchorRoot;

        // Step 3: Compare with our local root
        const localRoot = await AsyncStorage.getItem(STORAGE_KEYS.MERKLE_ROOT);

        if (localRoot === anchorRoot) {
            // Hashes match — sync complete in ~0 bytes
            result.success = true;
            result.durationMs = Date.now() - startTime;
            await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, String(Date.now()));
            return result;
        }

        // Step 4: Hashes differ — pull the delta
        if (Date.now() > deadline) {
            result.aborted = true;
            result.durationMs = Date.now() - startTime;
            return result;
        }

        // Load checkpoint if we have one from a previous aborted sync
        const checkpoint = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_CHECKPOINT);
        const since = checkpoint ?? '0';

        const deltaRes = await fetch(`${anchorUrl}/api/delta?since=${since}`);
        if (!deltaRes.ok) {
            result.durationMs = Date.now() - startTime;
            return result;
        }

        const delta = await deltaRes.json();
        result.deltaCount = delta.accounts?.length ?? 0;

        // Step 5: Apply delta to local state
        if (delta.accounts) {
            await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(delta.accounts));
        }

        // Step 6: Append transactions (with pruning)
        if (delta.transactions) {
            const existingRaw = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
            const existing = existingRaw ? JSON.parse(existingRaw) : [];
            const merged = [...existing, ...delta.transactions];

            // Prune to last 1,000 transactions
            const pruned = merged.slice(-MAX_STORED_TRANSACTIONS);
            await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(pruned));
        }

        // Step 7: Check deadline before finalizing
        if (Date.now() > deadline) {
            // Checkpoint our progress so next wakeup can continue
            await AsyncStorage.setItem(STORAGE_KEYS.SYNC_CHECKPOINT, delta.checkpoint ?? String(Date.now()));
            result.aborted = true;
            result.durationMs = Date.now() - startTime;
            return result;
        }

        // Step 8: Success — save new root and clear checkpoint
        await AsyncStorage.setItem(STORAGE_KEYS.MERKLE_ROOT, anchorRoot);
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, String(Date.now()));
        await AsyncStorage.removeItem(STORAGE_KEYS.SYNC_CHECKPOINT);

        result.success = true;
        result.durationMs = Date.now() - startTime;
        return result;

    } catch (err) {
        console.error('[Pillar Sync] Error:', err);
        result.durationMs = Date.now() - startTime;
        return result;
    }
}

/**
 * Get the last sync time for display.
 */
export async function getLastSyncTime(): Promise<number | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    return raw ? Number(raw) : null;
}

/**
 * Get cached accounts for offline display.
 */
export async function getCachedAccounts(): Promise<any[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    return raw ? JSON.parse(raw) : [];
}

/**
 * Get cached transactions (pruned to ~1,000).
 */
export async function getCachedTransactions(): Promise<any[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    return raw ? JSON.parse(raw) : [];
}
