/**
 * BeanPool Handshake Protocol — /beanpool/handshake/1.0.0
 *
 * A lightweight request/response protocol for:
 *   1. Mutual trust verification — each side checks if the other trusts them
 *   2. RTT measurement — round-trip time gives latency
 *
 * Uses AbstractStream's send() for writing and readBuffer polling for reading.
 */

import type { Libp2p } from 'libp2p';
import { isPeerTrusted, type TrustLevel } from './connector-manager.js';

const PROTOCOL = '/beanpool/handshake/1.0.0';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface HandshakeResult {
    mutualTrust: boolean;
    remoteTrustLevel: TrustLevel | null;
    latencyMs: number;
}

/**
 * Read data from a stream by polling readBuffer until data arrives
 * and the remote write side is closed (or we have data after a short wait).
 */
function readFromStream(stream: any, timeoutMs = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            clearInterval(pollInterval);
            const bufLen = stream.readBuffer?.byteLength || 0;
            if (bufLen > 0) {
                resolve(decoder.decode(stream.readBuffer.subarray()));
            } else {
                reject(new Error('Read timeout'));
            }
        }, timeoutMs);

        let dataSeenAt = 0;
        const pollInterval = setInterval(() => {
            const bufLen = stream.readBuffer?.byteLength || 0;
            const remoteWriteClosed = stream.remoteWriteStatus === 'closed';

            if (bufLen > 0) {
                if (!dataSeenAt) dataSeenAt = Date.now();
                // Resolve when:
                //  - remote closed their write side (we have all data), OR
                //  - we've had data for 100ms (allow for trailing frames), OR
                //  - stream is fully closed
                if (remoteWriteClosed || Date.now() - dataSeenAt > 100 || stream.status === 'closed') {
                    clearInterval(pollInterval);
                    clearTimeout(timer);
                    resolve(decoder.decode(stream.readBuffer.subarray()));
                }
            }
        }, 10); // Poll every 10ms for responsive latency
    });
}

/**
 * Write data to a stream using AbstractStream's send() and close write side.
 */
async function writeToStream(stream: any, data: string): Promise<void> {
    await stream.send(encoder.encode(data));
    if (typeof stream.closeWrite === 'function') {
        await stream.closeWrite();
    }
}

/**
 * Register the handshake protocol handler on the libp2p node.
 */
export function registerHandshakeHandler(node: Libp2p): void {
    node.handle(PROTOCOL, async (incomingData: any) => {
        const stream = incomingData.stream || incomingData;
        const connection = incomingData.connection;

        // Extract remote peer ID from connection
        let remotePeerId = 'unknown';
        if (connection?.remotePeer) {
            remotePeerId = connection.remotePeer.toString();
        }

        try {
            // Read request
            const raw = await readFromStream(stream, 5000);

            let request: any;
            try {
                request = JSON.parse(raw);
            } catch {
                console.error(`[Handshake] Invalid JSON from ${remotePeerId.slice(-8)}: "${raw.substring(0, 80)}"`);
                return;
            }

            // If we didn't get remotePeerId from connection, try from the request payload
            if (remotePeerId === 'unknown' && request.peerId) {
                remotePeerId = request.peerId;
            }

            // Check if the remote peer is in OUR connectors list
            const { trusted, trustLevel } = isPeerTrusted(remotePeerId);

            const response = JSON.stringify({
                type: 'handshake_res',
                ts: Date.now(),
                youAreTrusted: trusted,
                trustLevel: trustLevel,
            });

            await writeToStream(stream, response);
            console.log(`[Handshake] ← ${remotePeerId.slice(-8)}: trust=${trusted} level=${trustLevel || 'none'}`);
        } catch (e: any) {
            console.error(`[Handshake] Handler error:`, e.message || e);
        }
    });

    console.log(`[Handshake] Protocol handler registered: ${PROTOCOL}`);
}

/**
 * Send a handshake request to a connected peer.
 */
export async function sendHandshake(node: Libp2p, peerId: any): Promise<HandshakeResult> {
    const start = performance.now();

    const stream: any = await node.dialProtocol(peerId, PROTOCOL);

    const request = JSON.stringify({
        type: 'handshake_req',
        ts: Date.now(),
        peerId: node.peerId.toString(), // Include our peerId so handler can identify us
    });

    // Start reading before writing (duplex stream — concurrent read/write)
    const readPromise = readFromStream(stream);

    // Write request
    await writeToStream(stream, request);

    // Wait for response
    const raw = await readPromise;
    const latencyMs = Math.round(performance.now() - start);

    let response: any;
    try {
        response = JSON.parse(raw);
    } catch {
        console.error(`[Handshake] Failed to parse response: "${raw.substring(0, 80)}"`);
        return { mutualTrust: false, remoteTrustLevel: null, latencyMs };
    }

    console.log(`[Handshake] → ${peerId.toString().slice(-8)}: mutual=${!!response.youAreTrusted} latency=${latencyMs}ms`);

    return {
        mutualTrust: !!response.youAreTrusted,
        remoteTrustLevel: response.trustLevel || null,
        latencyMs,
    };
}
