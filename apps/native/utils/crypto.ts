import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { getPublicKey, sign, verify, hashes } from '@noble/ed25519';

hashes.sha512 = sha512;
import * as Crypto from 'expo-crypto';
import { WORDLIST } from '../../pwa/src/lib/bip39-wordlist';

export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const b64lookup = new Uint8Array(256);
for (let i = 0; i < b64chars.length; i++) b64lookup[b64chars.charCodeAt(i)] = i;

export function encodeBase64(bytes: Uint8Array): string {
    let result = '';
    let i;
    const l = bytes.length;
    for (i = 2; i < l; i += 3) {
        result += b64chars[bytes[i - 2] >> 2];
        result += b64chars[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
        result += b64chars[((bytes[i - 1] & 0x0f) << 2) | (bytes[i] >> 6)];
        result += b64chars[bytes[i] & 0x3f];
    }
    if (i === l + 1) { // 1 byte remain
        result += b64chars[bytes[i - 2] >> 2];
        result += b64chars[(bytes[i - 2] & 0x03) << 4];
        result += '==';
    }
    if (i === l) { // 2 bytes remain
        result += b64chars[bytes[i - 2] >> 2];
        result += b64chars[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
        result += b64chars[(bytes[i - 1] & 0x0f) << 2];
        result += '=';
    }
    return result;
}

export function decodeBase64(b64: string): Uint8Array {
    let bufferLength = b64.length * 0.75;
    let len = b64.length;
    let p = 0;
    let encoded1, encoded2, encoded3, encoded4;
    if (b64[b64.length - 1] === '=') { bufferLength--; if (b64[b64.length - 2] === '=') bufferLength--; }
    const bytes = new Uint8Array(bufferLength);
    for (let i = 0; i < len; i += 4) {
        encoded1 = b64lookup[b64.charCodeAt(i)];
        encoded2 = b64lookup[b64.charCodeAt(i + 1)];
        encoded3 = b64lookup[b64.charCodeAt(i + 2)];
        encoded4 = b64lookup[b64.charCodeAt(i + 3)];
        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return bytes;
}

export function generateMnemonic(): string[] {
    const entropy = Crypto.getRandomBytes(16);
    const hash = sha256(entropy);
    let h = 0;
    for (let i = 0; i < 4; i++) {
        h = (h << 8) | hash[i];
    }
    const checkBits = ((h >>> 28) & 0xf).toString(2).padStart(4, '0');

    let bits = '';
    for (const byte of entropy) {
        bits += byte.toString(2).padStart(8, '0');
    }
    bits += checkBits;

    const words: string[] = [];
    for (let i = 0; i < 12; i++) {
        const index = parseInt(bits.slice(i * 11, (i + 1) * 11), 2);
        words.push(WORDLIST[index]);
    }
    return words;
}

export function validateMnemonic(words: string[]): boolean {
    if (words.length !== 12) return false;
    return words.every(w => WORDLIST.includes(w.toLowerCase().trim()));
}

export async function mnemonicToKeypair(words: string[]): Promise<{
    publicKeyHex: string;
    privateKeyHex: string;
}> {
    const phrase = words.map(w => w.toLowerCase().trim()).join(' ');
    const phraseBytes = new TextEncoder().encode(phrase);
    
    // Double SHA256 -> 32 byte seed
    const hash1 = sha256(phraseBytes);
    const privateKey = sha256(hash1); // 32 bytes

    const publicKeyRaw = await getPublicKey(privateKey);
    return {
        publicKeyHex: bytesToHex(publicKeyRaw),
        privateKeyHex: bytesToHex(privateKey)
    };
}
