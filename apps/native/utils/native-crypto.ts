/**
 * Native-compatible identity encryption for React Native.
 * Uses expo-crypto for SHA-256 key derivation + XOR stream cipher.
 * Produces transfer URIs compatible with native-to-native import.
 */
import * as Crypto from 'expo-crypto';
import { BeanPoolIdentity } from './identity';

/**
 * Derive a repeating key from PIN using SHA-256.
 * We hash the PIN multiple times to stretch it.
 */
async function deriveKeyBytes(pin: string): Promise<Uint8Array> {
    // Hash PIN -> SHA256 -> hash again with salt for extra stretching
    const hash1 = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `beanpool-v1:${pin}`,
        { encoding: Crypto.CryptoEncoding.HEX }
    );
    const hash2 = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${hash1}:beanpool-transfer:${pin}`,
        { encoding: Crypto.CryptoEncoding.HEX }
    );
    // Convert hex string to bytes (32 bytes = 256 bits)
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hash2.substr(i * 2, 2), 16);
    }
    return bytes;
}

/** XOR the data with a repeating key */
function xorCipher(data: Uint8Array, key: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        result[i] = data[i] ^ key[i % key.length];
    }
    return result;
}

import { encodeBase64, decodeBase64 } from './crypto';

/** Uint8Array to base64 (works in RN without btoa) */
function toBase64(bytes: Uint8Array): string {
    return encodeBase64(bytes);
}

/** base64 to Uint8Array */
function fromBase64(b64: string): Uint8Array {
    return decodeBase64(b64);
}

export async function nativeExportIdentity(identity: BeanPoolIdentity, pin: string): Promise<string> {
    const payload = JSON.stringify({
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        callsign: identity.callsign,
        createdAt: identity.createdAt,
    });

    const key = await deriveKeyBytes(pin);
    const plaintext = new TextEncoder().encode(payload);
    const ciphertext = xorCipher(plaintext, key);

    const b64 = toBase64(ciphertext);
    // Use beanpool:// deep link scheme — NOT the https domain.
    // The PWA uses AES-GCM encryption (WebCrypto), the native app uses XOR (expo-crypto).
    // If we used https://mullum.beanpool.org, someone pasting in a browser would hit the PWA
    // which can't decrypt XOR-encrypted data. The beanpool:// scheme ensures this only
    // works in the native app's import flow.
    return `beanpool://import?d=${encodeURIComponent(b64)}`;
}

export async function nativeDecryptIdentity(uri: string, pin: string): Promise<BeanPoolIdentity> {
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

    const key = await deriveKeyBytes(pin);
    const ciphertext = fromBase64(b64);
    const plaintext = xorCipher(ciphertext, key);

    const json = new TextDecoder().decode(plaintext);
    const identity = JSON.parse(json) as BeanPoolIdentity;

    if (!identity.publicKey || !identity.privateKey || !identity.callsign) {
        throw new Error('Invalid identity data — wrong PIN?');
    }

    return identity;
}
