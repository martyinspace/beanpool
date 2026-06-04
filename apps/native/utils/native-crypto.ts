/**
 * Identity transfer for React Native (wrapper).
 *
 * Crypto lives in the shared ../../pwa/src/lib/transfer-crypto module (the same
 * code the PWA uses, so transfers interoperate). This file only does base64 +
 * URI wrapping. Importing ./crypto first installs the global.crypto.getRandomValues
 * polyfill (expo-crypto) that the shared module's randomBytes() relies on.
 */
import { BeanPoolIdentity } from './identity';
import { encodeBase64, decodeBase64 } from './crypto';
import {
    encryptIdentity,
    decryptIdentity as decryptEnvelope,
    generateTransferCode,
} from '../../pwa/src/lib/transfer-crypto';

export { generateTransferCode };

export async function nativeExportIdentity(identity: BeanPoolIdentity, code: string): Promise<string> {
    const envelope = await encryptIdentity(identity, code);
    // beanpool:// deep-link scheme so a phone-to-phone QR opens the native app.
    return `beanpool://import?d=${encodeURIComponent(encodeBase64(envelope))}`;
}

export async function nativeDecryptIdentity(uri: string, code: string): Promise<BeanPoolIdentity> {
    const httpsMatch = uri.match(/[?&]import=(.+?)(?:&|$)/);
    const legacyMatch = uri.match(/beanpool:\/\/import\?d=(.+)/);
    let b64: string;
    if (httpsMatch) {
        b64 = decodeURIComponent(httpsMatch[1]);
    } else if (legacyMatch) {
        b64 = decodeURIComponent(legacyMatch[1]);
    } else {
        throw new Error('Invalid import URI');
    }
    return decryptEnvelope(decodeBase64(b64), code);
}
