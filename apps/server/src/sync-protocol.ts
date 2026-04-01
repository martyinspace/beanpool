/**
 * BeanPool Sync Protocol — /beanpool/sync/1.0.0
 *
 * Lazy state synchronization between connected nodes.
 *
 * Flow:
 *   1. Initiator sends { type: 'sync_req', stateHash }
 *   2. If hashes differ, responder sends { type: 'sync_res', payload: SyncPayload }
 *   3. Both sides import the other's state (dedup handled by importRemoteState)
 *
 * Runs periodically (every 15 minutes by default).
 */

import type { Libp2p } from 'libp2p';
import {
    getStateHash, exportSyncState, importRemoteState,
    type SyncPayload,
} from './state-engine.js';

const PROTOCOL = '/beanpool/sync/1.0.0';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let localNodeId = 'unknown';

export function setLocalNodeId(id: string) {
    localNodeId = id;
}

/**
 * Read data from a stream by polling readBuffer until data arrives.
 */
function readFromStream(stream: any, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            clearInterval(pollInterval);
            const bufLen = stream.readBuffer?.byteLength || 0;
            if (bufLen > 0) {
                resolve(decoder.decode(stream.readBuffer.subarray()));
            } else {
                reject(new Error('Sync read timeout'));
            }
        }, timeoutMs);

        let dataSeenAt = 0;
        const pollInterval = setInterval(() => {
            const bufLen = stream.readBuffer?.byteLength || 0;
            const remoteWriteClosed = stream.remoteWriteStatus === 'closed';

            if (bufLen > 0) {
                if (!dataSeenAt) dataSeenAt = Date.now();
                if (remoteWriteClosed || Date.now() - dataSeenAt > 500 || stream.status === 'closed') {
                    clearInterval(pollInterval);
                    clearTimeout(timer);
                    resolve(decoder.decode(stream.readBuffer.subarray()));
                }
            }
        }, 50);
    });
}

async function writeToStream(stream: any, data: string): Promise<void> {
    await stream.send(encoder.encode(data));
    if (typeof stream.closeWrite === 'function') {
        await stream.closeWrite();
    }
}

/**
 * Register the sync protocol handler (responder side).
 */
export function registerSyncHandler(node: Libp2p): void {
    node.handle(PROTOCOL, async (incomingData: any) => {
        const stream = incomingData.stream || incomingData;

        try {
            const raw = await readFromStream(stream, 15000);
            const request = JSON.parse(raw);

            if (request.type === 'sync_req') {
                const ourHash = getStateHash();

                if (request.stateHash === ourHash) {
                    // Hashes match — no sync needed
                    await writeToStream(stream, JSON.stringify({
                        type: 'sync_res',
                        match: true,
                    }));
                    console.log(`[Sync] ← Hash match — no sync needed`);
                } else {
                    // Hashes differ — send our state
                    const payload = exportSyncState(localNodeId);
                    await writeToStream(stream, JSON.stringify({
                        type: 'sync_res',
                        match: false,
                        payload,
                    }));

                    // Import their state if they included it
                    if (request.payload) {
                        const result = importRemoteState(request.payload);
                        console.log(`[Sync] ← Imported: +${result.newMembers} members, +${result.newPosts} posts`);
                    }
                }
            }
        } catch (e: any) {
            console.error(`[Sync] Handler error:`, e.message || e);
        }
    });

    console.log(`[Sync] Protocol handler registered: ${PROTOCOL}`);
}

/**
 * Initiate a sync with a connected peer.
 */
export async function syncWithPeer(node: Libp2p, peerId: any): Promise<{
    synced: boolean;
    newMembers: number;
    newPosts: number;
}> {
    try {
        const stream: any = await node.dialProtocol(peerId, PROTOCOL);

        const ourHash = getStateHash();
        const ourPayload = exportSyncState(localNodeId);

        // Send our hash + state
        const request = JSON.stringify({
            type: 'sync_req',
            stateHash: ourHash,
            payload: ourPayload,
        });

        const readPromise = readFromStream(stream);
        await writeToStream(stream, request);

        const raw = await readPromise;
        const response = JSON.parse(raw);

        if (response.match) {
            console.log(`[Sync] → ${peerId.toString().slice(-8)}: Already in sync ✓`);
            return { synced: false, newMembers: 0, newPosts: 0 };
        }

        if (response.payload) {
            const result = importRemoteState(response.payload);
            console.log(`[Sync] → ${peerId.toString().slice(-8)}: +${result.newMembers} members, +${result.newPosts} posts`);
            return { synced: true, ...result };
        }

        return { synced: false, newMembers: 0, newPosts: 0 };
    } catch (e: any) {
        console.error(`[Sync] Failed with ${peerId.toString().slice(-8)}:`, e.message || e);
        return { synced: false, newMembers: 0, newPosts: 0 };
    }
}
