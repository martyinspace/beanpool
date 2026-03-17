/**
 * Local Configuration — Node Identity & Admin Auth
 *
 * First boot:
 *   - Reads ADMIN_PASSWORD env var → hashes with scrypt → saves to data/local-config.json
 *   - If no env var, auto-generates a random password and prints to console
 *
 * Subsequent boots:
 *   - Loads existing config from disk (env var ignored)
 *
 * Password reset:
 *   - SSH in, delete data/local-config.json, restart container
 */

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.BEANPOOL_DATA_DIR || path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'local-config.json');

export interface LocalConfig {
    isLocked: boolean;
    callsign: string | null;
    location: { lat: number; lng: number } | null;
    adminHash: string | null;
    salt: string | null;
    joinedAt: number | null;
    thresholds?: Thresholds;
}

export interface Thresholds {
    // Credit
    creditFloor: number;        // Max debt allowed (default: -100)
    demurrageRate: number;      // Monthly decay rate (default: 0.005 = 0.5%)
    demurrageEpochDays: number; // Days per epoch month (default: 30)
    // Network
    syncIntervalMin: number;    // Minutes between syncs (default: 15)
    initialSyncDelaySec: number;// Seconds after boot to first sync (default: 30)
    handshakeIntervalSec: number;// Seconds between handshakes (default: 10)
    retryIntervalSec: number;   // Seconds between retries (default: 30)
    maxRetryBackoffMin: number; // Max retry backoff in minutes (default: 5)
    // Health flags
    washTradingWindowHours: number;  // Window for wash trading detection (default: 24)
    washTradingMinTxns: number;      // Min txns in window to flag (default: 4)
    inactiveMemberDays: number;      // Days with no activity to flag (default: 30)
    isolatedBranchMinTxns: number;   // Min internal txns to flag isolation (default: 3)
}

const DEFAULT_CONFIG: LocalConfig = {
    isLocked: false,
    callsign: null,
    location: null,
    adminHash: null,
    salt: null,
    joinedAt: null,
};

export function getLocalConfig(): LocalConfig {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    } catch (e) {
        console.warn('[Config] Failed to read local config:', e);
    }
    return { ...DEFAULT_CONFIG };
}

export function saveLocalConfig(config: LocalConfig): void {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('[Config] Failed to save local config:', e);
    }
}

export function hashPassword(password: string): { hash: string; salt: string } {
    const salt = randomBytes(32).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
}

export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
    try {
        const hash = scryptSync(password, storedSalt, 64);
        const expected = Buffer.from(storedHash, 'hex');
        return timingSafeEqual(hash, expected);
    } catch {
        return false;
    }
}

/**
 * Initialize admin password on first boot.
 * - If config already locked → skip (password already set)
 * - If ADMIN_PASSWORD env var set → hash and save
 * - If no env var → auto-generate and print to logs
 */
export function initAdminPassword(): void {
    const config = getLocalConfig();

    if (config.isLocked) {
        console.log('🔒 Node is locked — admin password already configured.');
        return;
    }

    let password = process.env.ADMIN_PASSWORD;

    if (!password) {
        password = randomBytes(16).toString('hex');
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🔑 Auto-generated admin password:          ║');
        console.log(`║  ${password}  ║`);
        console.log('║                                              ║');
        console.log('║  Save this! It won\'t be shown again.        ║');
        console.log('╚══════════════════════════════════════════════╝');
        console.log('');
    }

    const { hash, salt } = hashPassword(password);

    saveLocalConfig({
        ...config,
        isLocked: true,
        adminHash: hash,
        salt: salt,
        joinedAt: Date.now(),
    });

    console.log('🔒 Admin password configured and saved.');
}

// ===================== THRESHOLDS =====================

export const DEFAULT_THRESHOLDS: Thresholds = {
    creditFloor: -100,
    demurrageRate: 0.005,
    demurrageEpochDays: 30,
    syncIntervalMin: 15,
    initialSyncDelaySec: 30,
    handshakeIntervalSec: 10,
    retryIntervalSec: 30,
    maxRetryBackoffMin: 5,
    washTradingWindowHours: 24,
    washTradingMinTxns: 4,
    inactiveMemberDays: 30,
    isolatedBranchMinTxns: 3,
};

export function getThresholds(): Thresholds {
    const config = getLocalConfig();
    return { ...DEFAULT_THRESHOLDS, ...(config.thresholds || {}) };
}

export function updateThresholds(updates: Partial<Thresholds>): Thresholds {
    const config = getLocalConfig();
    const current = { ...DEFAULT_THRESHOLDS, ...(config.thresholds || {}) };
    const merged = { ...current, ...updates };
    config.thresholds = merged;
    saveLocalConfig(config);
    console.log('⚙️ Thresholds updated:', merged);
    return merged;
}
