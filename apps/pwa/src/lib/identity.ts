/**
 * Identity Library — Ed25519 Keypair + Callsign Management
 *
 * On first run, generates an Ed25519 keypair in the browser
 * and stores it in IndexedDB. The public key acts as the DID.
 */

const DB_NAME = 'beanpool-identity';
const STORE_NAME = 'keys';
const KEY_ID = 'sovereign-identity';

export interface BeanPoolIdentity {
    publicKey: string;    // Hex-encoded Ed25519 public key
    privateKey: string;   // Hex-encoded Ed25519 private key (never leaves device)
    callsign: string;     // Human-readable name
    createdAt: string;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Load the existing identity from IndexedDB, or return null.
 */
export async function loadIdentity(): Promise<BeanPoolIdentity | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(KEY_ID);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Generate a new Ed25519 identity and store it in IndexedDB.
 */
export async function createIdentity(callsign: string): Promise<BeanPoolIdentity> {
    // Use WebCrypto to generate Ed25519 keypair
    // Note: Ed25519 support in WebCrypto is available in modern browsers
    const keypair = await crypto.subtle.generateKey(
        { name: 'Ed25519' } as any,
        true,  // extractable
        ['sign', 'verify']
    );

    const publicKeyRaw = await crypto.subtle.exportKey('raw', keypair.publicKey);
    const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keypair.privateKey);

    const publicKeyHex = bufToHex(new Uint8Array(publicKeyRaw));
    const privateKeyHex = bufToHex(new Uint8Array(privateKeyRaw));

    const identity: BeanPoolIdentity = {
        publicKey: publicKeyHex,
        privateKey: privateKeyHex,
        callsign,
        createdAt: new Date().toISOString(),
    };

    // Store in IndexedDB
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(identity, KEY_ID);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });

    return identity;
}

/**
 * Import a pre-existing identity (from another device) and store it in IndexedDB.
 * Overwrites any existing identity.
 */
export async function importIdentity(identity: BeanPoolIdentity): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(identity, KEY_ID);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function bufToHex(buf: Uint8Array): string {
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
