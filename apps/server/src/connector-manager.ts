/**
 * Connector Manager — Sovereign Peer Connections
 *
 * Each node admin manually configures which peers to trust and connect to.
 * No automatic discovery, no bootstrap lists, no central coordination.
 *
 * Trust is MUTUAL — both sides must add each other as connectors
 * for credit verification to work. The handshake protocol verifies this.
 *
 * Connectors are stored in data/connectors.json and persist across restarts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { multiaddr } from '@multiformats/multiaddr';
import type { Libp2p } from 'libp2p';
import { sendHandshake } from './handshake.js';

const DATA_DIR = process.env.BEANPOOL_DATA_DIR || path.join(process.cwd(), 'data');
const CONNECTORS_PATH = path.join(DATA_DIR, 'connectors.json');
const HANDSHAKE_INTERVAL_MS = 10_000; // 10 seconds
const RETRY_INTERVAL_MS = 30_000;     // 30 seconds
const MAX_RETRY_DELAY_MS = 5 * 60_000; // 5 minutes max backoff

export type TrustLevel = 'full_sync' | 'credit_verification' | 'read_only';

export interface ConnectorConfig {
    address: string;         // multiaddr or hostname:port (e.g. "us.beanpool.org:4001")
    trustLevel: TrustLevel;
    enabled: boolean;
    callsign?: string;       // friendly name for the UI
    addedAt: number;
}

export interface ConnectorStatus extends ConnectorConfig {
    connected: boolean;
    mutualTrust: boolean;        // true = both sides trust each other
    remoteTrustLevel: TrustLevel | null;  // what trust level the OTHER node has for us
    latencyMs: number | null;
    lastVerified: number | null;
    peerId: string | null;
    error: string | null;
}

interface StatusEntry {
    connected: boolean;
    mutualTrust: boolean;
    remoteTrustLevel: TrustLevel | null;
    latencyMs: number | null;
    lastVerified: number | null;
    peerId: string | null;
    error: string | null;
}

let connectors: ConnectorConfig[] = [];
let statuses = new Map<string, StatusEntry>();
let retryState = new Map<string, { count: number; nextRetry: number }>();
let p2pNode: Libp2p | null = null;
let handshakeTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Resolve address to a libp2p multiaddr.
 * Accepts: "hostname:port" or full multiaddr string
 */
function resolveMultiaddr(address: string): string {
    if (address.startsWith('/')) {
        return address; // already a multiaddr
    }
    // hostname:port → /dns4/hostname/tcp/port
    const [host, port] = address.split(':');
    return `/dns4/${host}/tcp/${port || '4001'}`;
}

function loadConnectors(): void {
    try {
        if (fs.existsSync(CONNECTORS_PATH)) {
            connectors = JSON.parse(fs.readFileSync(CONNECTORS_PATH, 'utf-8'));
            console.log(`[Connectors] Loaded ${connectors.length} connector(s) from disk.`);
        }
    } catch (e) {
        console.warn('[Connectors] Failed to load connectors:', e);
        connectors = [];
    }
}

function saveConnectors(): void {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(CONNECTORS_PATH, JSON.stringify(connectors, null, 2));
    } catch (e) {
        console.error('[Connectors] Failed to save connectors:', e);
    }
}

function newStatus(): StatusEntry {
    return {
        connected: false,
        mutualTrust: false,
        remoteTrustLevel: null,
        latencyMs: null,
        lastVerified: null,
        peerId: null,
        error: null,
    };
}

export function initConnectorManager(node: Libp2p): void {
    p2pNode = node;
    loadConnectors();

    // Track connection/disconnection events
    node.addEventListener('peer:connect', (evt) => {
        const peerId = evt.detail.toString();
        for (const [addr, status] of statuses.entries()) {
            if (status.peerId === peerId) {
                status.connected = true;
                status.error = null;
                // Reset retry state on successful connection
                retryState.delete(addr);
            }
        }
    });

    node.addEventListener('peer:disconnect', (evt) => {
        const peerId = evt.detail.toString();
        for (const [addr, status] of statuses.entries()) {
            if (status.peerId === peerId) {
                status.connected = false;
                status.mutualTrust = false;
                status.latencyMs = null;
            }
        }
    });

    // Start periodic handshake for trust verification + latency
    handshakeTimer = setInterval(handshakeConnectedPeers, HANDSHAKE_INTERVAL_MS);

    // Auto-connect all enabled connectors after a short delay (let libp2p fully init)
    if (connectors.some(c => c.enabled)) {
        console.log(`[Connectors] 🔄 Auto-connecting ${connectors.filter(c => c.enabled).length} enabled connector(s) in 5s...`);
        setTimeout(() => {
            connectAll().catch(e => console.warn('[Connectors] Auto-connect error:', e));
        }, 5000);
    }

    // Start retry loop for failed connections
    startRetryLoop();
}

/**
 * Send handshake to all connected peers to verify mutual trust and measure RTT.
 */
async function handshakeConnectedPeers(): Promise<void> {
    if (!p2pNode) return;

    for (const connector of connectors) {
        if (!connector.enabled) continue;

        const status = statuses.get(connector.address);
        if (!status?.connected || !status.peerId) continue;

        try {
            const { peerIdFromString } = await import('@libp2p/peer-id');
            const peerId = peerIdFromString(status.peerId);

            const result = await sendHandshake(p2pNode, peerId);

            status.mutualTrust = result.mutualTrust;
            status.remoteTrustLevel = result.remoteTrustLevel;
            status.latencyMs = result.latencyMs;
            status.lastVerified = Date.now();
            status.error = null;
        } catch (e: any) {
            status.mutualTrust = false;
            status.remoteTrustLevel = null;
            status.error = 'Handshake failed';
        }
    }
}

/**
 * Retry loop — periodically attempts to reconnect failed/disconnected connectors.
 * Uses exponential backoff: 30s → 60s → 120s → 300s max.
 */
function startRetryLoop(): void {
    retryTimer = setInterval(async () => {
        if (!p2pNode) return;

        for (const connector of connectors) {
            if (!connector.enabled) continue;

            const status = statuses.get(connector.address);
            if (status?.connected) continue; // Already connected

            // Check backoff
            const retry = retryState.get(connector.address) || { count: 0, nextRetry: 0 };
            if (Date.now() < retry.nextRetry) continue; // Not time yet

            console.log(`[Connectors] 🔄 Retry #${retry.count + 1} → ${connector.callsign || connector.address}`);
            const success = await connectToAddress(connector.address);

            if (success) {
                retryState.delete(connector.address);
                console.log(`[Connectors] ✅ Reconnected to ${connector.callsign || connector.address}`);
            } else {
                // Exponential backoff
                retry.count++;
                const delay = Math.min(RETRY_INTERVAL_MS * Math.pow(2, retry.count - 1), MAX_RETRY_DELAY_MS);
                retry.nextRetry = Date.now() + delay;
                retryState.set(connector.address, retry);
                console.log(`[Connectors] ⏳ Next retry for ${connector.callsign || connector.address} in ${Math.round(delay / 1000)}s`);
            }
        }
    }, RETRY_INTERVAL_MS);
}

export async function connectAll(): Promise<void> {
    for (const connector of connectors) {
        if (connector.enabled) {
            await connectToAddress(connector.address);
        }
    }
}

export async function connectToAddress(address: string): Promise<boolean> {
    if (!p2pNode) return false;

    const status = statuses.get(address) || newStatus();
    statuses.set(address, status);

    try {
        const ma = multiaddr(resolveMultiaddr(address));
        const conn = await p2pNode.dial(ma);
        status.connected = true;
        status.peerId = conn.remotePeer.toString();
        status.lastVerified = Date.now();
        status.error = null;
        console.log(`[Connectors] ✅ Connected to ${address} (PeerId: ${status.peerId})`);

        // Immediately run handshake to check mutual trust
        try {
            const result = await sendHandshake(p2pNode, conn.remotePeer);
            status.mutualTrust = result.mutualTrust;
            status.remoteTrustLevel = result.remoteTrustLevel;
            status.latencyMs = result.latencyMs;
            console.log(`[Connectors] 🤝 Handshake with ${address}: mutual=${result.mutualTrust} latency=${result.latencyMs}ms`);
        } catch (e: any) {
            console.warn(`[Connectors] ⚠️  Handshake failed with ${address} — peer may not support protocol yet`);
            console.warn(`    ${e.stack || e.message || e}`);
            status.mutualTrust = false;
        }

        return true;
    } catch (e: any) {
        status.connected = false;
        status.error = e.message || 'Connection failed';
        console.warn(`[Connectors] ❌ Failed to connect to ${address}: ${status.error}`);
        return false;
    }
}

export async function disconnectFromAddress(address: string): Promise<void> {
    if (!p2pNode) return;

    const status = statuses.get(address);
    if (status?.peerId) {
        try {
            const { peerIdFromString } = await import('@libp2p/peer-id');
            const peerId = peerIdFromString(status.peerId);
            await p2pNode.hangUp(peerId);
        } catch (e) {
            // Ignore — peer may already be disconnected
        }
    }

    if (status) {
        status.connected = false;
        status.mutualTrust = false;
        status.latencyMs = null;
        status.error = null;
    }
    console.log(`[Connectors] Disconnected from ${address}`);
}

export function addConnector(address: string, trustLevel: TrustLevel, callsign?: string): ConnectorConfig {
    // Prevent duplicates
    const existing = connectors.find(c => c.address === address);
    if (existing) {
        existing.trustLevel = trustLevel;
        if (callsign) existing.callsign = callsign;
        saveConnectors();
        return existing;
    }

    const connector: ConnectorConfig = {
        address,
        trustLevel,
        enabled: true,
        callsign: callsign || undefined,
        addedAt: Date.now(),
    };

    connectors.push(connector);
    saveConnectors();
    console.log(`[Connectors] Added connector: ${address} (trust: ${trustLevel})`);
    return connector;
}

export function removeConnector(address: string): boolean {
    const idx = connectors.findIndex(c => c.address === address);
    if (idx === -1) return false;

    connectors.splice(idx, 1);
    statuses.delete(address);
    saveConnectors();
    console.log(`[Connectors] Removed connector: ${address}`);
    return true;
}

export function getConnectors(): ConnectorStatus[] {
    return connectors.map(c => {
        const status = statuses.get(c.address) || newStatus();
        return { ...c, ...status };
    });
}

export function getConnectorByAddress(address: string): ConnectorStatus | null {
    const connector = connectors.find(c => c.address === address);
    if (!connector) return null;

    const status = statuses.get(connector.address) || newStatus();
    return { ...connector, ...status };
}

/**
 * Check if a remote peer (by PeerId string) is trusted by this node.
 * Used by the handshake handler to respond to trust queries.
 */
export function isPeerTrusted(peerId: string): { trusted: boolean; trustLevel: TrustLevel | null } {
    const status = getConnectors().find(c => c.peerId === peerId);
    if (status) {
        return { trusted: true, trustLevel: status.trustLevel };
    }
    return { trusted: false, trustLevel: null };
}
