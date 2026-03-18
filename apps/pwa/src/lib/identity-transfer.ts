/**
 * Identity Transfer — Export/Import via QR Code
 *
 * Exports the identity as a PIN-encrypted JSON payload encoded in a QR-friendly
 * format. The receiving device scans the QR and enters the same PIN to decrypt.
 *
 * Format: beanpool://import?d=<base64-encoded-encrypted-JSON>
 * Encryption: AES-GCM with PBKDF2-derived key from PIN
 */

import type { BeanPoolIdentity } from './identity';

const SALT = new TextEncoder().encode('beanpool-identity-transfer-v1');

/**
 * Derive an AES-GCM key from a PIN string using PBKDF2.
 */
async function deriveKey(pin: string): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Export an identity as an encrypted URI string (for embedding in a QR code).
 */
export async function exportIdentity(identity: BeanPoolIdentity, pin: string): Promise<string> {
    const key = await deriveKey(pin);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify({
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        callsign: identity.callsign,
        createdAt: identity.createdAt,
    }));

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintext
    );

    // Combine IV + ciphertext and base64-encode
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    const b64 = btoa(String.fromCharCode(...combined));
    return `beanpool://import?d=${encodeURIComponent(b64)}`;
}

/**
 * Import an identity from an encrypted URI string.
 * Returns the decrypted identity or throws on wrong PIN / corrupt data.
 */
export async function decryptIdentity(uri: string, pin: string): Promise<BeanPoolIdentity> {
    // Parse the URI
    const match = uri.match(/beanpool:\/\/import\?d=(.+)/);
    if (!match) throw new Error('Invalid import URI');

    const b64 = decodeURIComponent(match[1]);
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    // Split IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await deriveKey(pin);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    const identity = JSON.parse(new TextDecoder().decode(plaintext)) as BeanPoolIdentity;

    // Validate required fields
    if (!identity.publicKey || !identity.privateKey || !identity.callsign) {
        throw new Error('Invalid identity data');
    }

    return identity;
}
