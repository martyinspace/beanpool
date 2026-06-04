/**
 * Shared identity-transfer crypto (v2) — the single source of truth used by BOTH
 * the PWA and the React Native app, so the two stay byte-for-byte interoperable.
 *
 *   KDF:    scrypt (memory-hard) over an auto-generated 4-word transfer code
 *   Cipher: XChaCha20-Poly1305 (AEAD — confidentiality + tamper detection)
 *
 * Envelope (before base64):
 *   [ version(1) | salt(16) | nonce(24) | ciphertext+tag ]
 *
 * Base64 + URI wrapping is done by each platform's thin wrapper (the apps use
 * different URI schemes), so this module deals only in bytes + the type.
 *
 * v1 was a repeating-key XOR cipher whose keystream could be recovered from the
 * (largely known) JSON plaintext — i.e. anyone who captured a transfer blob could
 * recover the private key WITHOUT the PIN. That scheme is intentionally
 * unsupported here: decrypt() rejects any envelope whose version byte != 2.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { randomBytes, concatBytes } from '@noble/hashes/utils.js';
import { WORDLIST } from './bip39-wordlist';
import type { BeanPoolIdentity } from './identity';

const VERSION = 2;
const SALT_LEN = 16;
const NONCE_LEN = 24; // XChaCha20 uses a 24-byte nonce — safe to pick at random
const TAG_LEN = 16; // Poly1305 tag
const HEADER_LEN = 1 + SALT_LEN + NONCE_LEN;

// scrypt cost. N=2^14 (16 MiB) keeps the one-shot derivation responsive even on
// the low-end Android devices we target, while remaining infeasible to grind
// against a high-entropy transfer code.
const SCRYPT_PARAMS = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 } as const;

// 4 words from a 2048-word list = 44 bits of entropy. With a memory-hard KDF
// that is far beyond brute-force reach if a transfer blob is ever captured.
const CODE_WORDS = 4;

// --- pure-JS UTF-8 (no TextEncoder/TextDecoder; safe on old Hermes / Android 8) ---

function utf8Encode(str: string): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) {
            out.push(c);
        } else if (c < 0x800) {
            out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else if (c < 0xd800 || c >= 0xe000) {
            out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        } else {
            i++;
            c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
    }
    return new Uint8Array(out);
}

function utf8Decode(bytes: Uint8Array): string {
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x80) {
            str += String.fromCharCode(b);
        } else if (b > 0xbf && b < 0xe0) {
            str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
            i += 1;
        } else if (b > 0xdf && b < 0xf0) {
            str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
            i += 2;
        } else {
            let cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            cp -= 0x10000;
            str += String.fromCharCode(0xd800 | (cp >> 10), 0xdc00 | (cp & 0x3ff));
            i += 3;
        }
    }
    return str;
}

/**
 * Reduce a transfer code to a canonical key-derivation input: lowercase the
 * letters and join words with single spaces. This makes import forgiving of
 * casing and separator differences (hyphens, spaces) while keeping the derived
 * key identical to what export used.
 */
function canonicalize(code: string): string {
    return (code.toLowerCase().match(/[a-z]+/g) ?? []).join(' ');
}

/** Generate a fresh, high-entropy transfer code (e.g. "anchor-velvet-ridge-amber"). */
export function generateTransferCode(): string {
    const words: string[] = [];
    for (let i = 0; i < CODE_WORDS; i++) {
        const b = randomBytes(2);
        // 11 bits → 0..2047, uniform over the 2048-word BIP-39 list.
        words.push(WORDLIST[((b[0] << 8) | b[1]) & 0x7ff]);
    }
    return words.join('-');
}

async function deriveKey(code: string, salt: Uint8Array): Promise<Uint8Array> {
    return scryptAsync(utf8Encode(canonicalize(code)), salt, SCRYPT_PARAMS);
}

/** Encrypt an identity into a self-describing envelope (bytes). */
export async function encryptIdentity(identity: BeanPoolIdentity, code: string): Promise<Uint8Array> {
    const salt = randomBytes(SALT_LEN);
    const nonce = randomBytes(NONCE_LEN);
    const key = await deriveKey(code, salt);
    const payload = utf8Encode(JSON.stringify({
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
        callsign: identity.callsign,
        createdAt: identity.createdAt,
    }));
    const ciphertext = xchacha20poly1305(key, nonce).encrypt(payload);
    return concatBytes(new Uint8Array([VERSION]), salt, nonce, ciphertext);
}

/** Decrypt an envelope back into an identity. Throws on bad format / wrong code / tampering. */
export async function decryptIdentity(envelope: Uint8Array, code: string): Promise<BeanPoolIdentity> {
    if (envelope.length < HEADER_LEN + TAG_LEN) {
        throw new Error('Invalid transfer code.');
    }
    if (envelope[0] !== VERSION) {
        throw new Error('Unsupported transfer code (old or invalid format).');
    }
    const salt = envelope.subarray(1, 1 + SALT_LEN);
    const nonce = envelope.subarray(1 + SALT_LEN, HEADER_LEN);
    const ciphertext = envelope.subarray(HEADER_LEN);
    const key = await deriveKey(code, salt);

    let plaintext: Uint8Array;
    try {
        plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);
    } catch {
        // Poly1305 tag mismatch — wrong code or corrupted/tampered blob.
        throw new Error('Wrong transfer code, or the code was corrupted.');
    }

    const identity = JSON.parse(utf8Decode(plaintext)) as BeanPoolIdentity;
    if (!identity.publicKey || !identity.privateKey || !identity.callsign) {
        throw new Error('Invalid identity data.');
    }
    return identity;
}
