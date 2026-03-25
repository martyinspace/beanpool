import { BeanPoolIdentity } from './identity';
import { encodeBase64, decodeBase64 } from './crypto';

const SALT = new TextEncoder().encode('beanpool-identity-transfer-v1');

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

export async function exportIdentity(identity: BeanPoolIdentity, pin: string): Promise<string> {
    if (!crypto || !crypto.subtle) {
        throw new Error("WebCrypto API is not natively available in this environment.");
    }

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

    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    const b64 = encodeBase64(combined);
    
    return `beanpool://import?d=${encodeURIComponent(b64)}`;
}

export async function decryptIdentity(uri: string, pin: string): Promise<BeanPoolIdentity> {
    if (!crypto || !crypto.subtle) {
        throw new Error("WebCrypto API is not natively available in this environment.");
    }
    
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
    
    const combined = decodeBase64(b64);

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await deriveKey(pin);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    const identity = JSON.parse(new TextDecoder().decode(plaintext)) as BeanPoolIdentity;

    if (!identity.publicKey || !identity.privateKey || !identity.callsign) {
        throw new Error('Invalid identity data');
    }

    return identity;
}
