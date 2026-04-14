/**
 * Identity Transfer — Export/Import via QR Code
 *
 * Unified XOR Cipher to ensure compatibility with React Native.
 */

import type { BeanPoolIdentity } from './identity';

async function sha256Hex(msg: string): Promise<string> {
    const buffer = new TextEncoder().encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKeyBytes(pin: string): Promise<Uint8Array> {
    const hash1 = await sha256Hex(`beanpool-v1:${pin}`);
    const hash2 = await sha256Hex(`${hash1}:beanpool-transfer:${pin}`);
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hash2.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function xorCipher(data: Uint8Array, key: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        result[i] = data[i] ^ key[i % key.length];
    }
    return result;
}

export async function exportIdentity(identity: BeanPoolIdentity, pin: string): Promise<string> {
    const payload = JSON.stringify({
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        callsign: identity.callsign,
        createdAt: identity.createdAt,
    });

    const key = await deriveKeyBytes(pin);
    const plaintext = new TextEncoder().encode(payload);
    const ciphertext = xorCipher(plaintext, key);

    // native-crypto uses a custom base64 encoder that maps correctly
    // btoa on Uint8Array directly
    let binary = '';
    for (let i = 0; i < ciphertext.byteLength; i++) {
        binary += String.fromCharCode(ciphertext[i]);
    }
    const b64 = btoa(binary);

    return `${window.location.origin}/?import=${encodeURIComponent(b64)}`;
}

export async function decryptIdentity(uri: string, pin: string): Promise<BeanPoolIdentity> {
    let b64: string;
    const httpsMatch = uri.match(/[?&]import=(.+?)(?:&|$)/);
    const legacyMatch = uri.match(/beanpool:\/\/import\?d=(.+)/);
    if (httpsMatch) {
        b64 = decodeURIComponent(httpsMatch[1]);
    } else if (legacyMatch) {
        b64 = decodeURIComponent(legacyMatch[1]);
    } else {
        throw new Error('Invalid import URI');
    }

    const binary = atob(b64);
    const ciphertext = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        ciphertext[i] = binary.charCodeAt(i);
    }

    const key = await deriveKeyBytes(pin);
    const plaintext = xorCipher(ciphertext, key);

    const json = new TextDecoder().decode(plaintext);
    const identity = JSON.parse(json) as BeanPoolIdentity;

    if (!identity.publicKey || !identity.privateKey || !identity.callsign) {
        throw new Error('Invalid identity data — wrong PIN?');
    }

    return identity;
}
