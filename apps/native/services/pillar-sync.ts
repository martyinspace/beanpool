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
import { getDatabaseFilenameForNode } from '../utils/nodes';

const SYNC_TIMEOUT_MS = 20_000;
const MAX_STORED_TRANSACTIONS = 1000;
const StorageKeysConfig = {
    MERKLE_ROOT: 'merkle-root',
    LAST_SYNC: 'last-sync',
    ACCOUNTS: 'accounts',
    TRANSACTIONS: 'transactions',
    SYNC_CHECKPOINT: 'checkpoint',
};

export async function getSyncCursorKey(keyId: string): Promise<string> {
    const url = await AsyncStorage.getItem('beanpool_anchor_url');
    return `pillar_sync_${getDatabaseFilenameForNode(url)}_${keyId}`;
}

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
    const candidates: string[] = [];
    
    // Explicit saved anchor takes absolute priority
    try {
        const savedAnchor = await AsyncStorage.getItem('beanpool_anchor_url');
        if (savedAnchor) {
            // NEVER fallback to a different community if an explicit anchor has been set via Invite.
            return savedAnchor;
        }
    } catch (e) {}

    candidates.push(

        // Local development (Highest Priority)
        'https://beanpool.local:8443',
        'http://beanpool.local:8080',
        'http://localhost:5173',   // Vite Proxy (Bypasses Self-Signed Cert Block)
        'http://127.0.0.1:5173',   // iOS Simulator IPv4
        'http://10.0.2.2:5173',    // Android Emulators (Vite)
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://10.0.2.2:8080',
        // Remote staging node (accessible from both emulator and physical devices - Fallback)
        'https://review.beanpool.org:8443',
    );

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

let isSyncing = false;

/**
 * Perform the delta-only sync.
 * Returns immediately if hashes match (0 bytes transferred).
 */
export async function performSync(): Promise<SyncResult> {
    if (isSyncing) return { success: false, merkleRoot: null, deltaCount: 0, durationMs: 0, aborted: true, errorMessage: 'Already syncing' };
    isSyncing = true;
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
        
        let lastSyncParam = '';
        try {
            const kLastSync = await getSyncCursorKey(StorageKeysConfig.LAST_SYNC);
            const lastSync = await AsyncStorage.getItem(kLastSync);
            if (lastSync) {
                // Incorporate a 5-minute time buffer to account for clock drift between client and server
                const driftAdjusted = Math.max(0, parseInt(lastSync, 10) - 300_000);
                // Convert numeric timestamp to ISO-8601 string for SQLite comparison
                const isoSync = new Date(driftAdjusted).toISOString();
                lastSyncParam = `&updatedAfter=${encodeURIComponent(isoSync)}`;
            }
        } catch (e) {}

        const postsController = new AbortController();
        const balanceController = new AbortController();
        const postsTimeout = setTimeout(() => postsController.abort(), 30000); // Extended for heavy initial payloads
        const balanceTimeout = setTimeout(() => balanceController.abort(), 30000);

        const [postsRes, balanceRes, directoryRes, projectsRes, txRes, mkptxRes] = await Promise.all([
            fetch(`${anchorUrl}/api/marketplace/posts?limit=1000${lastSyncParam}&_t=${Date.now()}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: postsController.signal
            }),
            pubKey ? fetch(`${anchorUrl}/api/ledger/balance/${pubKey}?_t=${Date.now()}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: balanceController.signal
            }) : Promise.resolve(null),
            fetch(`${anchorUrl}/api/members`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: postsController.signal
            }),
            fetch(`${anchorUrl}/api/crowdfund/projects?limit=1000${lastSyncParam}&_t=${Date.now()}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: postsController.signal
            }),
            pubKey ? fetch(`${anchorUrl}/api/ledger/transactions?publicKey=${pubKey}&limit=200&_t=${Date.now()}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: balanceController.signal
            }) : Promise.resolve(null),
            pubKey ? fetch(`${anchorUrl}/api/marketplace/transactions?publicKey=${pubKey}&limit=50&_t=${Date.now()}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: postsController.signal
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
            transactions: [],
            members: [],
            projects: []
        };
        
        if (directoryRes && directoryRes.ok) {
            try {
                const dirData = await directoryRes.json();
                if (Array.isArray(dirData)) {
                    delta.members = dirData;
                }
            } catch (e) {}
        }

        if (projectsRes && projectsRes.ok) {
            try {
                const projData = await projectsRes.json();
                if (projData && Array.isArray(projData.projects)) {
                    delta.projects = projData.projects;
                    if (projData.maxProjectExpiryDays) {
                        await AsyncStorage.setItem('beanpool_max_expiry_days', String(projData.maxProjectExpiryDays));
                    }
                } else if (Array.isArray(projData)) {
                    delta.projects = projData;
                }
            } catch (e) {}
        }

        if (balanceRes && balanceRes.ok) {
            const balData = await balanceRes.json();
            delta.accounts.push({
                public_key: pubKey,
                balance: balData.balance || 0,
                last_demurrage_epoch: balData.last_demurrage_epoch || 0
            });
        }

        if (txRes && txRes.ok) {
            try {
                const txData = await txRes.json();
                if (Array.isArray(txData)) {
                    delta.transactions = txData;
                }
            } catch (e) {}
        }
        
        if (mkptxRes && mkptxRes.ok) {
            try {
                const mkptxData = await mkptxRes.json();
                console.log(`[Pillar Sync] Fetched ${mkptxData?.length} marketplaceTransactions from server`);
                if (Array.isArray(mkptxData)) {
                    delta.marketplaceTransactions = mkptxData;
                }
            } catch (e) {
                console.error('[Pillar Sync] Failed to parse marketplaceTransactions response:', e);
            }
        } else if (mkptxRes && !mkptxRes.ok) {
            console.error(`[Pillar Sync] market transactions fetch failed: status ${mkptxRes.status}`);
        }

        // Apply physical updates to local Native device SQLite Matrix
        await applyDelta(delta);

        // Notify active screens to re-render if we received new posts, projects, or balance changes
        if (delta.posts?.length > 0 || delta.projects?.length > 0 || delta.accounts?.length > 0 || delta.transactions?.length > 0 || delta.marketplaceTransactions?.length > 0) {
            try {
                const { DeviceEventEmitter } = require('react-native');
                DeviceEventEmitter.emit('sync_data_updated');
            } catch (e) {}
        }

        // Step 3: Success — save timestamp
        const kLastSync = await getSyncCursorKey(StorageKeysConfig.LAST_SYNC);
        const kCheckpoint = await getSyncCursorKey(StorageKeysConfig.SYNC_CHECKPOINT);
        await AsyncStorage.setItem(kLastSync, String(Date.now()));
        await AsyncStorage.removeItem(kCheckpoint);

        result.success = true;
        result.deltaCount = delta.posts.length + delta.accounts.length;
        result.durationMs = Date.now() - startTime;
        return result;

    } catch (err: any) {
        console.log('[Pillar Sync] Offline or Sync Error:', err.message || err);
        result.durationMs = Date.now() - startTime;
        result.errorMessage = String(err?.message || err);
        return result;
    } finally {
        isSyncing = false;
    }
}

export async function getLastSyncTime(): Promise<number | null> {
    const kLastSync = await getSyncCursorKey(StorageKeysConfig.LAST_SYNC);
    const raw = await AsyncStorage.getItem(kLastSync);
    return raw ? Number(raw) : null;
}

/**
 * Get cached accounts for offline display.
 */
export async function getCachedAccounts(): Promise<any[]> {
    const kAccounts = await getSyncCursorKey(StorageKeysConfig.ACCOUNTS);
    const raw = await AsyncStorage.getItem(kAccounts);
    return raw ? JSON.parse(raw) : [];
}

/**
 * Get cached transactions (pruned to ~1,000).
 */
export async function getCachedTransactions(): Promise<any[]> {
    const kTransactions = await getSyncCursorKey(StorageKeysConfig.TRANSACTIONS);
    const raw = await AsyncStorage.getItem(kTransactions);
    return raw ? JSON.parse(raw) : [];
}
