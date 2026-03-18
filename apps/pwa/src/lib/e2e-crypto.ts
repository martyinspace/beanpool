/**
 * E2E Crypto — End-to-end encryption for BeanPool messaging
 *
 * v1: Plaintext encoding (base64) for same-node messaging
 * v2: Will add X25519 DH + AES-256-GCM when cross-node messaging ships
 *
 * The server stores messages as opaque ciphertext — even in v1,
 * the data model is E2E-ready. When we add real encryption,
 * only this module changes.
 */

/**
 * Encode a message for sending. V1 uses base64 encoding.
 * Future: encrypt with shared secret derived from X25519 DH.
 */
export function encodePlaintext(text: string): { ciphertext: string; nonce: string } {
    return {
        ciphertext: btoa(unescape(encodeURIComponent(text))),
        nonce: 'plaintext-v1',
    };
}

/**
 * Decode a received message.
 */
export function decodePlaintext(ciphertext: string, nonce: string): string {
    if (nonce.startsWith('plaintext')) {
        return decodeURIComponent(escape(atob(ciphertext)));
    }
    // Future: E2E decryption with shared secret
    throw new Error('E2E decryption not yet implemented — requires shared secret');
}
