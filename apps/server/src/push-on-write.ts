/**
 * Push-on-write — best-effort low-latency replication to mirror peers.
 *
 * When a local write fires `broadcast()` (see state-engine.ts), the event is
 * translated into a single-row DeltaPayload and dialed to every connected
 * mirror peer over /beanpool/sync/event/2.0.0. Mirrors apply it inside their
 * normal import path.
 *
 * This is *best-effort*: failures are logged and swallowed. The 30-second
 * cursor-based delta pull is the correctness mechanism; pushes are an
 * optimization for sub-second visibility.
 *
 * Loop prevention has three layers:
 *   1. Self-echo guard: never dial ourselves (defensive, shouldn't happen)
 *   2. Origin skip: if the write was triggered by importing a remote delta
 *      (`getCurrentImportOrigin()` set), don't push back to that origin
 *   3. Recent-event LRU: each pushed delta is keyed by content hash; the
 *      event handler drops duplicates seen in the last 60s
 *
 * The peerId / nodeId mismatch concern: connector-manager tracks peers by their
 * libp2p PeerId string; state-engine tracks the import origin by the SAME
 * PeerId string (set via setLocalNodeId during P2P init). They are directly
 * comparable.
 */

import type { Libp2p } from 'libp2p';
import { getConnectorsByLevel } from './connector-manager.js';
import {
    getCurrentImportOrigin,
    exportSyncState,
    signSyncPayload,
    type SyncPayload,
} from './state-engine.js';
import { SYNC_EVENT_PROTOCOL } from './sync-protocol.js';
import { logger } from './logger.js';
import crypto from 'node:crypto';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let p2pNode: Libp2p | null = null;
let localNodeId: string | null = null;

/** Recent-event keys → first-seen-at epoch ms. Trimmed by size and age. */
const RECENT_EVENTS = new Map<string, number>();
const RECENT_EVENTS_MAX = 200;
const RECENT_EVENTS_TTL_MS = 60_000;

export function initPushOnWrite(node: Libp2p, nodeIdStr: string): void {
    p2pNode = node;
    localNodeId = nodeIdStr;
}

/**
 * Sink wired into state-engine's `setBroadcastHook`. Fires for every local
 * broadcast event. Maps to a delta and dispatches in the background; never
 * blocks the originating write.
 */
export function handleBroadcast(event: any): void {
    if (!p2pNode || !localNodeId) return;
    void (async () => {
        try {
            const delta = await mapEventToDelta(event);
            if (!delta) return;
            await pushDeltaToMirrors(delta);
        } catch (e: any) {
            logger.warn('P2P', `[Push] dispatch error for ${event?.type}: ${e.message || e}`);
        }
    })();
}

/**
 * Compute a stable content hash for a delta — used to detect echoed events.
 * The signature is excluded (it varies if re-signed) so equivalent content
 * coming through different paths hashes the same way.
 */
function eventKey(delta: SyncPayload): string {
    const { signature: _sig, publicKey: _pk, ...rest } = delta;
    void _sig; void _pk;
    return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
}

export function isRecentEvent(key: string): boolean {
    const seen = RECENT_EVENTS.get(key);
    if (seen === undefined) return false;
    if (Date.now() - seen > RECENT_EVENTS_TTL_MS) {
        RECENT_EVENTS.delete(key);
        return false;
    }
    return true;
}

export function markEventSeen(key: string): void {
    RECENT_EVENTS.set(key, Date.now());
    // Bound the map. Trimming on insert is cheaper than running a separate timer.
    if (RECENT_EVENTS.size > RECENT_EVENTS_MAX) {
        const cutoff = Date.now() - RECENT_EVENTS_TTL_MS;
        for (const [k, v] of RECENT_EVENTS) {
            if (v < cutoff) RECENT_EVENTS.delete(k);
        }
        // If still over budget, drop oldest insertions (Map iteration order = insertion).
        while (RECENT_EVENTS.size > RECENT_EVENTS_MAX) {
            const oldest = RECENT_EVENTS.keys().next().value;
            if (oldest === undefined) break;
            RECENT_EVENTS.delete(oldest);
        }
    }
}

/**
 * Push a delta to every connected mirror peer that we trust and that trusts us.
 * Best-effort: each dial happens independently and failures are logged + dropped.
 * The push is fire-and-forget from the caller's perspective.
 */
export async function pushDeltaToMirrors(delta: SyncPayload): Promise<void> {
    if (!p2pNode) return;

    const skipOrigin = getCurrentImportOrigin();
    const mirrors = getConnectorsByLevel('mirror').filter(c =>
        c.connected && c.mutualTrust && c.peerId
    );

    if (mirrors.length === 0) return;

    const key = eventKey(delta);
    markEventSeen(key);

    for (const mirror of mirrors) {
        if (!mirror.peerId) continue;
        if (mirror.peerId === skipOrigin) continue;       // don't echo back to origin
        if (mirror.peerId === localNodeId) continue;      // defensive self-echo guard
        dialAndPush(mirror.peerId, mirror.callsign || mirror.address, delta).catch(e => {
            logger.warn('P2P', `[Push] → ${mirror.callsign || mirror.address}: ${e.message || e}`);
        });
    }
}

async function dialAndPush(peerIdStr: string, label: string, delta: SyncPayload): Promise<void> {
    if (!p2pNode) return;
    const { peerIdFromString } = await import('@libp2p/peer-id');
    const peerId = peerIdFromString(peerIdStr);

    let stream: any = null;
    try {
        stream = await p2pNode.dialProtocol(peerId, SYNC_EVENT_PROTOCOL);

        const message = JSON.stringify({ type: 'event', delta });
        await stream.send(encoder.encode(message));
        if (typeof stream.closeWrite === 'function') {
            await stream.closeWrite();
        }

        // Read the ACK so we know the remote actually applied the write before
        // we report success. Same async-iterator + JSON-parse pattern as the
        // rest of the sync protocol.
        const chunks: Uint8Array[] = [];
        const ackPromise = (async () => {
            for await (const chunk of stream) {
                chunks.push(chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk));
                try {
                    const text = decoder.decode(Buffer.concat(chunks));
                    JSON.parse(text);
                    return text;
                } catch {
                    // incomplete JSON, keep reading
                }
            }
            return decoder.decode(Buffer.concat(chunks));
        })();
        const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('ack timeout')), 10_000)
        );
        const ackRaw = await Promise.race([ackPromise, timeoutPromise]);
        const ack = JSON.parse(ackRaw);
        if (ack.type !== 'ack') {
            throw new Error(`expected ack, got ${ack.type} (${ack.reason || 'no reason'})`);
        }
        logger.sync('P2P', `[Push] → ${label}: applied`);
    } finally {
        if (stream) {
            try { stream.close(); } catch {}
        }
    }
}

/* -------------------------------------------------------------------------- */
/*                broadcast() event → SyncPayload delta mapper                 */
/* -------------------------------------------------------------------------- */

/**
 * Translate a broadcast event into a one-row SyncPayload, or null if the event
 * type is a pure UI hint (state_synced, system_announcement, vote_cast, …).
 *
 * Only data-mutating event types are mapped here. For each, we wrap the event's
 * payload row in a delta envelope. The receiving mirror's importer applies it
 * via the same code path as cursor pulls — same LWW guards, same signature
 * verification, same trigger semantics.
 */
export async function mapEventToDelta(event: any): Promise<SyncPayload | null> {
    if (!localNodeId) return null;

    const base: Partial<SyncPayload> = { nodeId: localNodeId };

    switch (event.type) {
        case 'new_post':
        case 'post_updated': {
            const post = event.post;
            if (!post) return null;
            return await signSyncPayload({ ...base, posts: [post] } as SyncPayload);
        }
        case 'post_removed': {
            // post_removed only carries the id today; the soft-delete already
            // bumped `posts.updated_at` and flipped active=0, so a delta pull
            // would propagate it. For push-on-write we need the full row to
            // ride along. Fall back to a tiny full-export until the call site
            // is cleaned up to pass the row.
            // TODO once broadcast call site sends the row, replace with:
            //   return { ...base, posts: [event.post] }
            return await fullSyncFallback(base);
        }
        case 'new_message': {
            const msg = event.message;
            if (!msg) return null;
            return await signSyncPayload({ ...base, messages: [msg] } as SyncPayload);
        }
        case 'member_joined':
        case 'profile_updated': {
            const member = event.member;
            if (!member) {
                return await fullSyncFallback(base);
            }
            return await signSyncPayload({ ...base, members: [member] } as SyncPayload);
        }
        case 'transaction_requested':
        case 'transaction_approved':
        case 'transaction_rejected':
        case 'transaction_cancelled':
        case 'transaction_completed': {
            const tx = event.transaction;
            if (!tx) return null;
            return await signSyncPayload({ ...base, marketplaceTransactions: [tx] } as SyncPayload);
        }
        case 'project_created':
        case 'project_updated': {
            const project = event.project;
            if (!project) return null;
            return await signSyncPayload({ ...base, projects: [project] } as SyncPayload);
        }
        case 'project_deleted': {
            const projectId = event.projectId;
            if (!projectId) return null;
            return await signSyncPayload({
                ...base,
                tombstones: [{
                    tableName: 'projects',
                    rowKey: projectId,
                    deletedAt: new Date().toISOString(),
                }],
            } as SyncPayload);
        }
        // Pure UI hints — nothing to replicate.
        case 'state_synced':
        case 'system_announcement':
        case 'vote_cast':
        case 'user_pruned':
        case 'conversation_created':   // conversations propagate via accompanying new_message
        case 'post_accepted':          // covered by transaction_approved + post_updated
            return null;
        default:
            return null;
    }
}

/**
 * Last-resort fallback for events whose payload doesn't carry enough context
 * for a precise delta. Builds a fully-signed payload via exportSyncState (more
 * expensive but always correct). Used until the broadcast call sites are
 * cleaned up to carry full row objects.
 */
async function fullSyncFallback(_base: Partial<SyncPayload>): Promise<SyncPayload | null> {
    if (!localNodeId) return null;
    try {
        return await exportSyncState(localNodeId);
    } catch (e: any) {
        logger.warn('P2P', `[Push] fallback exportSyncState failed: ${e.message || e}`);
        return null;
    }
}
