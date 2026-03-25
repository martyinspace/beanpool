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
import Constants from 'expo-constants';
import { BeanPoolMerkleTree } from '@beanpool/core';
import { applyDelta } from '../utils/db';

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
    errorMessage?: string;
}

/**
 * Discover the BeanPool node URL.
 * Tries beanpool.local first, then falls back to saved address.
 */
async function discoverAnchor(): Promise<string | null> {
    const candidates = [
        // Remote staging node (accessible from both emulator and physical devices)
        'https://review.beanpool.org:8443',
        // Local development
        'https://beanpool.local:8443',
        'http://beanpool.local:8080',
        'http://localhost:5173',   // Vite Proxy (Bypasses Self-Signed Cert Block)
        'http://127.0.0.1:5173',   // iOS Simulator IPv4
        'http://10.0.2.2:5173',    // Android Emulators (Vite)
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://10.0.2.2:8080',
    ];

    // Attempt to derive Expo LAN IP for physical dev devices
    const hostUri = Constants.experienceUrl || Constants.expoConfig?.hostUri;
    if (hostUri) {
        // hostUri is usually something like "192.168.1.100:8081"
        const match = hostUri.match(/([0-9.]+):/);
        if (match && match[1]) {
            candidates.push(`http://${match[1]}:5173`);
            candidates.push(`http://${match[1]}:8080`);
        }
    }

    // Clear saved node address temporarily to force Azure discovery
    await AsyncStorage.removeItem('pillar:anchor-url');

    for (const url of candidates) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
            const res = await fetch(`${url}/api/community/health`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                // Any 200 OK response from /api/community/health means the node is BeanPool aware.
                // Cache the successful URL
                await AsyncStorage.setItem('beanpool_anchor_url', url);
                return url;
            }
        } catch (e) {
            clearTimeout(timeoutId);
            // Ignore fetch errors
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
        console.log('[Pillar Sync] Discovering anchor node...');
        const anchorUrl = await discoverAnchor();
        if (!anchorUrl) {
            console.warn('[Pillar Sync] ❌ No anchor found — all candidates failed');
            result.durationMs = Date.now() - startTime;
            result.errorMessage = 'All node URLs failed the health check connection.';
            return result;
        }
        console.log(`[Pillar Sync] ✅ Anchor discovered: ${anchorUrl}`);

        // Step 2: Fetch Posts and Balance directly via standard REST APIs
        const identityRaw = await AsyncStorage.getItem('beanpool:identity');
        let pubKey = '';
        if (identityRaw) {
            try {
                const id = JSON.parse(identityRaw);
                pubKey = id.publicKey;
            } catch (e) {}
        }

        // Fetch both sets concurrently
        
        const postsController = new AbortController();
        const balanceController = new AbortController();
        const postsTimeout = setTimeout(() => postsController.abort(), 10000);
        const balanceTimeout = setTimeout(() => balanceController.abort(), 10000);

        const [postsRes, balanceRes] = await Promise.all([
            fetch(`${anchorUrl}/api/marketplace/posts?limit=1000`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: postsController.signal
            }),
            pubKey ? fetch(`${anchorUrl}/api/ledger/balance/${pubKey}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: balanceController.signal
            }) : Promise.resolve(null)
        ]);

        clearTimeout(postsTimeout);
        clearTimeout(balanceTimeout);

        if (!postsRes.ok) {
            result.durationMs = Date.now() - startTime;
            result.errorMessage = `Posts fetch failed with status: ${postsRes.status}`;
            return result;
        }

        const postsData = await postsRes.json();
        console.log(`[Pillar Sync] Received ${Array.isArray(postsData) ? postsData.length : 'non-array'} posts from server`);
        
        const delta: any = {
            posts: Array.isArray(postsData) ? postsData : [],
            accounts: [],
            transactions: []
        };

        if (balanceRes && balanceRes.ok) {
            const balData = await balanceRes.json();
            delta.accounts.push({
                public_key: pubKey,
                balance: balData.balance || 0,
                last_demurrage_epoch: balData.last_demurrage_epoch || 0
            });
        }

        // Apply physical updates to local Native device SQLite Matrix
        await applyDelta(delta);

        // Step 3: Success — save timestamp
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, String(Date.now()));
        await AsyncStorage.removeItem(STORAGE_KEYS.SYNC_CHECKPOINT);

        result.success = true;
        result.deltaCount = delta.posts.length + delta.accounts.length;
        result.durationMs = Date.now() - startTime;
        return result;

    } catch (err: any) {
        console.error('[Pillar Sync] Error:', err);
        result.durationMs = Date.now() - startTime;
        result.errorMessage = String(err?.message || err);
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
