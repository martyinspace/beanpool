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
    exportDeltaState, hasDeltaContent,
    getSyncCursor, setSyncCursor,
    type ImportResult, type SyncPayload,
} from './state-engine.js';
import { logger } from './logger.js';

/**
 * Format an ImportResult into a compact log fragment that only mentions
 * categories with actual activity. Falls back to "no changes" if everything
 * is zero (the importer ran but the source DB had nothing new for us).
 *
 * `+N` = new rows, `~N` = updated rows.
 */
function formatImportResult(r: ImportResult): string {
    const parts: string[] = [];
    if (r.newMembers || r.updatedMembers) parts.push(`members+${r.newMembers}/~${r.updatedMembers}`);
    if (r.newPosts || r.updatedPosts) parts.push(`posts+${r.newPosts}/~${r.updatedPosts}`);
    if (r.newTransactions) parts.push(`txns+${r.newTransactions}`);
    if (r.accountChanges) parts.push(`accounts~${r.accountChanges}`);
    if (r.marketplaceTxns) parts.push(`escrow~${r.marketplaceTxns}`);
    if (r.newMessages) parts.push(`msgs+${r.newMessages}`);
    if (r.tombstonesApplied) parts.push(`deletes-${r.tombstonesApplied}`);
    if (r.conflictsSkipped) parts.push(`skipped:${r.conflictsSkipped}`);
    return parts.length === 0 ? 'no changes' : parts.join(', ');
}

const PROTOCOL_V1 = '/beanpool/sync/1.0.0';
const PROTOCOL_V2_HASH = '/beanpool/sync/hash/2.0.0';
const PROTOCOL_V2_PAYLOAD = '/beanpool/sync/payload/2.0.0';
const PROTOCOL_V2_DELTA = '/beanpool/sync/delta/2.0.0';
const PROTOCOL_V2_EVENT = '/beanpool/sync/event/2.0.0';

/** A cursor older than this triggers a fullResyncRequired fallback. */
const STALE_CURSOR_MS = 7 * 24 * 60 * 60 * 1000;

function isCursorStale(cursor: string): boolean {
    const t = Date.parse(cursor);
    if (Number.isNaN(t)) return true;
    return Date.now() - t > STALE_CURSOR_MS;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let localNodeId = 'unknown';

export function setLocalNodeId(id: string) {
    localNodeId = id;
}

/**
 * Read data from a stream by polling readBuffer until data arrives.
 */
export function readFromStream(stream: any, timeoutMs = 30000): Promise<string> {
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

                    // Try parsing as JSON to see if we have the complete payload
                    const text = decoder.decode(Buffer.concat(chunks));
                    try {
                        JSON.parse(text);
                        clearTimeout(timer);
                        resolve(text);
                        return;
                    } catch (e) {
                        // Incomplete JSON, continue reading chunks
                    }
                }

                clearTimeout(timer);
                const finalRaw = decoder.decode(Buffer.concat(chunks));
                if (!finalRaw || !finalRaw.trim()) {
                    reject(new Error('Empty response from peer'));
                } else {
                    try {
                        JSON.parse(finalRaw);
                        resolve(finalRaw);
                    } catch (e: any) {
                        reject(new Error(`Invalid JSON payload: ${e.message}`));
                    }
                }
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
            logger.sync('P2P', `[Sync v2] ← Imported: ${formatImportResult(result)}`);
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

        closeStreamSafe(hashStream);
        hashStream = null;

        const peerIdStr = peerId.toString();
        const peerIdShort = peerIdStr.slice(-8);

        // Delta-first: if we have a non-stale cursor for this peer, attempt a
        // cursor-based delta exchange. On any failure path (peer doesn't speak
        // delta, returns fullResyncRequired, or throws), fall through to the
        // existing v2-full-payload exchange.
        const cursor = getSyncCursor(peerIdStr);
        if (cursor && !isCursorStale(cursor)) {
            try {
                const deltaResult = await syncWithPeerDelta(node, peerId, peerIdShort, cursor);
                if (deltaResult.kind === 'success') {
                    return { synced: deltaResult.synced, newMembers: deltaResult.result.newMembers, newPosts: deltaResult.result.newPosts };
                }
                // fullResyncRequired falls through to full-payload exchange
                logger.info('P2P', `[Sync v2] → ${peerIdShort}: delta declined (${deltaResult.reason}), falling back to full payload`);
            } catch (e: any) {
                if (isUnsupportedProtocol(e)) {
                    logger.info('P2P', `[Sync v2] → ${peerIdShort}: peer doesn't speak delta protocol — falling back to full payload`);
                } else {
                    logger.warn('P2P', `[Sync v2] → ${peerIdShort}: delta exchange failed (${e.message || e}), falling back to full payload`);
                }
            }
        } else {
            logger.sync('P2P', `[Sync v2] → ${peerIdShort}: no cursor (or stale) — using full payload`);
        }

        return await syncWithPeerFullPayload(node, peerId, peerIdShort);
    } finally {
        closeStreamSafe(hashStream);
    }
}

/**
 * Cursor-based delta exchange. Returns either a success (with the new cursor
 * recorded in sync_cursors) or a fullResyncRequired signal that tells the
 * caller to fall back to the full-payload protocol.
 */
async function syncWithPeerDelta(
    node: Libp2p,
    peerId: any,
    peerIdShort: string,
    since: string,
): Promise<
    | { kind: 'success'; synced: boolean; result: ImportResult }
    | { kind: 'fullResyncRequired'; reason: string }
> {
    let stream: any = null;
    try {
        stream = await node.dialProtocol(peerId, PROTOCOL_V2_DELTA);

        // Build our own delta to push alongside the request so the peer can
        // apply our writes in the same round-trip (mirrors the payload protocol's
        // bidirectional pattern).
        const ourDelta = await exportDeltaState(localNodeId, since);

        const readPromise = readFromStream(stream, 30000);
        readPromise.catch(() => {});

        await writeToStream(stream, JSON.stringify({
            type: 'delta_req',
            since,
            payload: ourDelta,
        }));

        const raw = await readPromise;
        const resp = JSON.parse(raw);

        if (resp.type === 'delta_res' && resp.fullResyncRequired) {
            return { kind: 'fullResyncRequired', reason: resp.reason || 'unspecified' };
        }
        if (resp.type !== 'delta_res' || !resp.payload) {
            logger.warn('P2P', `[Sync v2] → ${peerIdShort}: malformed delta response`);
            return { kind: 'fullResyncRequired', reason: 'malformed_response' };
        }

        const result = await importRemoteState(resp.payload);
        if (resp.payload.cursor) {
            setSyncCursor(peerId.toString(), resp.payload.cursor);
        }
        logger.sync('P2P', `[Sync v2 Δ] → ${peerIdShort}: ${formatImportResult(result)}`);
        const synced = (result.newMembers + result.updatedMembers + result.newPosts + result.updatedPosts +
                        result.newTransactions + result.accountChanges + result.marketplaceTxns +
                        result.newMessages + result.tombstonesApplied) > 0;
        return { kind: 'success', synced, result };
    } finally {
        closeStreamSafe(stream);
    }
}

/**
 * Full-payload exchange — the existing Deploy 1 behavior. Always used for the
 * first sync with a peer (no cursor recorded yet) and as the safety-net
 * fallback when delta is unavailable or stale.
 */
async function syncWithPeerFullPayload(
    node: Libp2p,
    peerId: any,
    peerIdShort: string,
): Promise<{ synced: boolean; newMembers: number; newPosts: number }> {
    let stream: any = null;
    try {
        stream = await node.dialProtocol(peerId, PROTOCOL_V2_PAYLOAD);

        const ourPayload = await exportSyncState(localNodeId);
        const readPromise = readFromStream(stream, 30000);
        readPromise.catch(() => {});

        await writeToStream(stream, JSON.stringify({
            type: 'payload',
            payload: ourPayload,
        }));

        const raw = await readPromise;
        const resp = JSON.parse(raw);

        if (resp.type !== 'payload' || !resp.payload) {
            logger.warn('P2P', `[Sync v2] → ${peerIdShort}: malformed payload response`);
            return { synced: false, newMembers: 0, newPosts: 0 };
        }

        const result = await importRemoteState(resp.payload);
        // After a successful full reconcile, record the cursor so future ticks
        // can drop back to delta mode.
        setSyncCursor(peerId.toString(), new Date().toISOString());
        logger.sync('P2P', `[Sync v2] → ${peerIdShort}: ${formatImportResult(result)}`);
        return { synced: true, ...result };
    } finally {
        closeStreamSafe(stream);
    }
}

/* -------------------------------------------------------------------------- */
/*                  v2 — Delta protocol (cursor-based deltas)                  */
/* -------------------------------------------------------------------------- */

function registerDeltaHandlerV2(node: Libp2p): void {
    node.handle(PROTOCOL_V2_DELTA, async (incomingData: any) => {
        const stream = incomingData.stream || incomingData;
        try {
            const raw = await readFromStream(stream, 30000);
            const request = JSON.parse(raw);

            if (request.type !== 'delta_req' || typeof request.since !== 'string') {
                logger.warn('P2P', `[Sync v2 Δ] ← Malformed delta_req from peer`);
                return;
            }

            if (isCursorStale(request.since)) {
                await writeToStream(stream, JSON.stringify({
                    type: 'delta_res',
                    fullResyncRequired: true,
                    reason: 'cursor_too_old',
                }));
                logger.sync('P2P', `[Sync v2 Δ] ← cursor_too_old (${request.since}), instructed peer to full-resync`);
                return;
            }

            // Build our delta from the requester's cursor forward.
            const ourDelta = await exportDeltaState(localNodeId, request.since);
            await writeToStream(stream, JSON.stringify({
                type: 'delta_res',
                payload: ourDelta,
            }));

            // Apply the peer's delta (if any) in the same round-trip.
            if (request.payload) {
                const result = await importRemoteState(request.payload);
                if (hasDeltaContent(ourDelta) || result.newMembers + result.updatedMembers + result.newPosts + result.updatedPosts > 0) {
                    logger.sync('P2P', `[Sync v2 Δ] ← Imported: ${formatImportResult(result)}`);
                }
            }
        } catch (e: any) {
            logger.error('P2P', `[Sync v2 Δ] Delta handler error: ${e.message || e}`);
        }
    });
}

/* -------------------------------------------------------------------------- */
/*                  v2 — Event protocol (push-on-write)                        */
/* -------------------------------------------------------------------------- */

function registerEventHandlerV2(node: Libp2p): void {
    node.handle(PROTOCOL_V2_EVENT, async (incomingData: any) => {
        const stream = incomingData.stream || incomingData;
        try {
            const raw = await readFromStream(stream, 15000);
            const request = JSON.parse(raw);

            if (request.type !== 'event' || !request.delta) {
                logger.warn('P2P', `[Sync v2 ⚡] ← Malformed event message`);
                await writeToStream(stream, JSON.stringify({ type: 'nack', reason: 'malformed' }));
                return;
            }

            // Self-echo guard: a misconfigured peer (or buggy forwarder) might
            // echo our own event back. The signature on the payload is bound to
            // the original sender's libp2p key; localNodeId is our PeerId.
            if (request.delta.nodeId === localNodeId) {
                await writeToStream(stream, JSON.stringify({ type: 'nack', reason: 'self_echo' }));
                return;
            }

            // ACK only after the write transaction has landed. If the import
            // throws, the sender will see no ACK and the 30s delta-pull catches up.
            const result = await importRemoteState(request.delta);
            await writeToStream(stream, JSON.stringify({ type: 'ack' }));
            logger.sync('P2P', `[Sync v2 ⚡] ← Pushed: ${formatImportResult(result)}`);
        } catch (e: any) {
            logger.error('P2P', `[Sync v2 ⚡] Event handler error: ${e.message || e}`);
            // Best-effort NACK; if the stream is already torn down this throws and we swallow.
            try {
                await writeToStream(stream, JSON.stringify({ type: 'nack', reason: 'import_failed' }));
            } catch {}
        }
    });
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
                        logger.sync('P2P', `[Sync v1] ← Imported: ${formatImportResult(result)}`);
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
            logger.sync('P2P', `[Sync v1] → ${peerId.toString().slice(-8)}: ${formatImportResult(result)}`);
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
 * Register all sync protocol handlers (v1 + v2 + v2-delta + v2-event).
 */
export function registerSyncHandler(node: Libp2p): void {
    registerSyncHandlerV1(node);
    registerHashHandlerV2(node);
    registerPayloadHandlerV2(node);
    registerDeltaHandlerV2(node);
    registerEventHandlerV2(node);
    logger.info('P2P', `[Sync] Protocol handlers registered: ${PROTOCOL_V1}, ${PROTOCOL_V2_HASH}, ${PROTOCOL_V2_PAYLOAD}, ${PROTOCOL_V2_DELTA}, ${PROTOCOL_V2_EVENT}`);
}

/** Exposed so push-on-write can dial the event protocol from outside this module. */
export const SYNC_EVENT_PROTOCOL = PROTOCOL_V2_EVENT;

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
