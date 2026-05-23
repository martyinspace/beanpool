/**
 * BeanPool Sync Protocol
 *
 * Lazy state synchronization between mirrored nodes.
 *
 * Two protocol versions are registered:
 *
 *   /beanpool/sync/1.0.0          (legacy, single-roundtrip)
 *     Initiator pre-bundles full state and sends it alongside its hash.
 *     Responder short-circuits the return payload on hash match, but the
 *     initiator's payload is wasted on every quiet tick.
 *
 *   /beanpool/sync/hash/2.0.0     (hash probe)
 *   /beanpool/sync/payload/2.0.0  (full payload exchange — only on mismatch)
 *     Initiator first exchanges only the 16-char stateHash (~80 bytes each way).
 *     If the hashes match, no payload is built, signed, or transmitted.
 *     If they differ, a second stream is opened on the payload protocol and
 *     both sides exchange + import their full payloads — same semantics as v1.
 *
 * Initiators try v2 first and fall back to v1 if the peer doesn't speak it,
 * so nodes can be upgraded one at a time.
 *
 * Sync runs periodically (every 30s by default).
 */

import type { Libp2p } from 'libp2p';
import {
    getStateHash, exportSyncState, importRemoteState,
} from './state-engine.js';
import { logger } from './logger.js';

const PROTOCOL_V1 = '/beanpool/sync/1.0.0';
const PROTOCOL_V2_HASH = '/beanpool/sync/hash/2.0.0';
const PROTOCOL_V2_PAYLOAD = '/beanpool/sync/payload/2.0.0';

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
            reject(new Error('Sync read timeout'));
        }, timeoutMs);

        (async () => {
            const chunks: Uint8Array[] = [];
            try {
                for await (const chunk of stream) {
                    if (chunk instanceof Uint8Array) {
                        chunks.push(chunk);
                    } else if (typeof chunk.subarray === 'function') {
                        chunks.push(chunk.subarray());
                    } else {
                        chunks.push(Uint8Array.from(chunk));
                    }
                }
                clearTimeout(timer);
                const binaryData = Buffer.concat(chunks);
                resolve(decoder.decode(binaryData));
            } catch (err) {
                clearTimeout(timer);
                reject(err);
            }
        })();
    });
}

async function writeToStream(stream: any, data: string): Promise<void> {
    await stream.send(encoder.encode(data));
    if (typeof stream.closeWrite === 'function') {
        await stream.closeWrite();
    }
}

function closeStreamSafe(stream: any) {
    if (!stream) return;
    try { stream.close(); } catch {}
}

// libp2p surfaces protocol-negotiation failures with a few different codes/messages
// depending on transport; treat any of these as "peer doesn't speak v2".
function isUnsupportedProtocol(err: any): boolean {
    const msg = (err?.message || '').toLowerCase();
    const code = err?.code || '';
    return (
        code === 'ERR_UNSUPPORTED_PROTOCOL' ||
        msg.includes('unsupported protocol') ||
        msg.includes('protocol selection failed') ||
        msg.includes('protocols not supported')
    );
}

/* -------------------------------------------------------------------------- */
/*                          v2 — Hash-first protocol                           */
/* -------------------------------------------------------------------------- */

function registerHashHandlerV2(node: Libp2p): void {
    node.handle(PROTOCOL_V2_HASH, async (incomingData: any) => {
        const stream = incomingData.stream || incomingData;
        try {
            const raw = await readFromStream(stream, 15000);
            const request = JSON.parse(raw);

            if (request.type !== 'hash_req' || typeof request.stateHash !== 'string') {
                logger.warn('P2P', `[Sync v2] ← Malformed hash_req from peer`);
                return;
            }

            const ourHash = getStateHash();
            const match = request.stateHash === ourHash;

            await writeToStream(stream, JSON.stringify({
                type: 'hash_res',
                stateHash: ourHash,
                match,
            }));

            // Silent on match (runs every 30s — would flood the 2500-row log buffer).
            if (!match) {
                logger.sync('P2P', `[Sync v2] ← Hash mismatch (peer ${request.stateHash} vs ours ${ourHash}) — awaiting payload stream`);
            }
        } catch (e: any) {
            logger.error('P2P', `[Sync v2] Hash handler error: ${e.message || e}`);
        }
    });
}

function registerPayloadHandlerV2(node: Libp2p): void {
    node.handle(PROTOCOL_V2_PAYLOAD, async (incomingData: any) => {
        const stream = incomingData.stream || incomingData;
        try {
            const raw = await readFromStream(stream, 30000);
            const request = JSON.parse(raw);

            if (request.type !== 'payload' || !request.payload) {
                logger.warn('P2P', `[Sync v2] ← Malformed payload message from peer`);
                return;
            }

            // Send our payload back before importing so the initiator can read
            // and start importing in parallel with our own import work.
            const ourPayload = await exportSyncState(localNodeId);
            await writeToStream(stream, JSON.stringify({
                type: 'payload',
                payload: ourPayload,
            }));

            const result = await importRemoteState(request.payload);
            logger.sync('P2P', `[Sync v2] ← Imported: +${result.newMembers} members, +${result.newPosts} posts`);
        } catch (e: any) {
            logger.error('P2P', `[Sync v2] Payload handler error: ${e.message || e}`);
        }
    });
}

async function syncWithPeerV2(node: Libp2p, peerId: any): Promise<{
    synced: boolean;
    newMembers: number;
    newPosts: number;
}> {
    let hashStream: any = null;
    let payloadStream: any = null;
    try {
        hashStream = await node.dialProtocol(peerId, PROTOCOL_V2_HASH);

        const ourHash = getStateHash();
        const readHashPromise = readFromStream(hashStream, 15000);
        readHashPromise.catch(() => {});

        await writeToStream(hashStream, JSON.stringify({
            type: 'hash_req',
            stateHash: ourHash,
        }));

        const hashRaw = await readHashPromise;
        const hashResp = JSON.parse(hashRaw);

        if (hashResp.match) {
            // Silent on match (every-30s flood prevention).
            return { synced: false, newMembers: 0, newPosts: 0 };
        }

        logger.sync('P2P', `[Sync v2] → ${peerId.toString().slice(-8)}: hash mismatch (peer ${hashResp.stateHash} vs ours ${ourHash}) — exchanging payloads`);

        closeStreamSafe(hashStream);
        hashStream = null;

        payloadStream = await node.dialProtocol(peerId, PROTOCOL_V2_PAYLOAD);

        const ourPayload = await exportSyncState(localNodeId);
        const readPayloadPromise = readFromStream(payloadStream, 30000);
        readPayloadPromise.catch(() => {});

        await writeToStream(payloadStream, JSON.stringify({
            type: 'payload',
            payload: ourPayload,
        }));

        const payloadRaw = await readPayloadPromise;
        const payloadResp = JSON.parse(payloadRaw);

        if (payloadResp.type !== 'payload' || !payloadResp.payload) {
            logger.warn('P2P', `[Sync v2] → ${peerId.toString().slice(-8)}: malformed payload response`);
            return { synced: false, newMembers: 0, newPosts: 0 };
        }

        const result = await importRemoteState(payloadResp.payload);
        logger.sync('P2P', `[Sync v2] → ${peerId.toString().slice(-8)}: +${result.newMembers} members, +${result.newPosts} posts`);
        return { synced: true, ...result };
    } finally {
        closeStreamSafe(hashStream);
        closeStreamSafe(payloadStream);
    }
}

/* -------------------------------------------------------------------------- */
/*                            v1 — Legacy protocol                             */
/* -------------------------------------------------------------------------- */

function registerSyncHandlerV1(node: Libp2p): void {
    node.handle(PROTOCOL_V1, async (incomingData: any) => {
        const stream = incomingData.stream || incomingData;

        try {
            const raw = await readFromStream(stream, 15000);
            const request = JSON.parse(raw);

            if (request.type === 'sync_req') {
                const ourHash = getStateHash();

                if (request.stateHash === ourHash) {
                    await writeToStream(stream, JSON.stringify({
                        type: 'sync_res',
                        match: true,
                    }));
                    logger.sync('P2P', `[Sync v1] ← Hash match — no sync needed`);
                } else {
                    const payload = await exportSyncState(localNodeId);
                    await writeToStream(stream, JSON.stringify({
                        type: 'sync_res',
                        match: false,
                        payload,
                    }));

                    if (request.payload) {
                        const result = await importRemoteState(request.payload);
                        logger.sync('P2P', `[Sync v1] ← Imported: +${result.newMembers} members, +${result.newPosts} posts`);
                    }
                }
            }
        } catch (e: any) {
            logger.error('P2P', `[Sync v1] Handler error: ${e.message || e}`);
        }
    });
}

async function syncWithPeerV1(node: Libp2p, peerId: any): Promise<{
    synced: boolean;
    newMembers: number;
    newPosts: number;
}> {
    let stream: any = null;
    try {
        stream = await node.dialProtocol(peerId, PROTOCOL_V1);

        const ourHash = getStateHash();
        const ourPayload = await exportSyncState(localNodeId);

        const request = JSON.stringify({
            type: 'sync_req',
            stateHash: ourHash,
            payload: ourPayload,
        });

        const readPromise = readFromStream(stream);
        readPromise.catch(() => {});
        await writeToStream(stream, request);

        const raw = await readPromise;
        const response = JSON.parse(raw);

        if (response.match) {
            logger.sync('P2P', `[Sync v1] → ${peerId.toString().slice(-8)}: Already in sync ✓`);
            return { synced: false, newMembers: 0, newPosts: 0 };
        }

        if (response.payload) {
            const result = await importRemoteState(response.payload);
            logger.sync('P2P', `[Sync v1] → ${peerId.toString().slice(-8)}: +${result.newMembers} members, +${result.newPosts} posts`);
            return { synced: true, ...result };
        }

        return { synced: false, newMembers: 0, newPosts: 0 };
    } finally {
        closeStreamSafe(stream);
    }
}

/* -------------------------------------------------------------------------- */
/*                                Public API                                   */
/* -------------------------------------------------------------------------- */

/**
 * Register all sync protocol handlers (v1 + v2).
 */
export function registerSyncHandler(node: Libp2p): void {
    registerSyncHandlerV1(node);
    registerHashHandlerV2(node);
    registerPayloadHandlerV2(node);
    logger.info('P2P', `[Sync] Protocol handlers registered: ${PROTOCOL_V1}, ${PROTOCOL_V2_HASH}, ${PROTOCOL_V2_PAYLOAD}`);
}

/**
 * Initiate a sync with a connected peer.
 * Tries v2 first; falls back to v1 if the peer doesn't speak it.
 */
export async function syncWithPeer(node: Libp2p, peerId: any): Promise<{
    synced: boolean;
    newMembers: number;
    newPosts: number;
}> {
    try {
        return await syncWithPeerV2(node, peerId);
    } catch (e: any) {
        if (isUnsupportedProtocol(e)) {
            logger.info('P2P', `[Sync] Peer ${peerId.toString().slice(-8)} doesn't speak v2 — falling back to v1`);
            try {
                return await syncWithPeerV1(node, peerId);
            } catch (e2: any) {
                logger.error('P2P', `[Sync] v1 fallback failed with ${peerId.toString().slice(-8)}: ${e2.message || e2}`);
                return { synced: false, newMembers: 0, newPosts: 0 };
            }
        }
        logger.error('P2P', `[Sync] v2 failed with ${peerId.toString().slice(-8)}: ${e.message || e}`);
        return { synced: false, newMembers: 0, newPosts: 0 };
    }
}
