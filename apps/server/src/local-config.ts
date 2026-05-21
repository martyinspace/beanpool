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
    communityName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    currencyType?: 'text' | 'image';
    currencyValue?: string;
}

export interface Thresholds {
    // Credit
    circulationRate: number;    // Base monthly decay rate (unused with brackets, kept for legacy UI)
    circulationEpochDays: number; // Days per epoch month (default: 30)
    
    // Legacy mapping support
    demurrageRate?: number;
    demurrageEpochDays?: number;

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
    maxProjectExpiryDays: number;    // Max days allowed for crowdfund expiry (default: 365)
    // Sybil funnel detection
    sybilFunnelMinInvitees: number;  // Min invitees funneling back to flag (default: 2)
    sybilFunnelMinAmount: number;    // Min total beans funneled to flag (default: 100)
    sybilFunnelWindowDays: number;   // Rolling window in days (default: 30)
    // Ghost velocity gate
    ghostVelocityTier1Hours: number;   // First tier cutoff in hours (default: 24)
    ghostVelocityTier1Limit: number;   // Max daily spend in tier 1 (default: 20)
    ghostVelocityTier2Hours: number;   // Second tier cutoff in hours (default: 72)
    ghostVelocityTier2Limit: number;   // Max daily spend in tier 2 (default: 40)
}

const DEFAULT_CONFIG: LocalConfig = {
    isLocked: false,
    callsign: null,
    location: null,
    adminHash: null,
    salt: null,
    joinedAt: null,
    communityName: null,
    contactEmail: null,
    contactPhone: null,
    currencyType: 'image',
    currencyValue: 'bean',
};

export function getLocalConfig(): LocalConfig {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as LocalConfig;
            
            // Backward compatibility for demurrage -> circulation renaming
            if (raw.thresholds) {
                if (raw.thresholds.demurrageRate !== undefined && raw.thresholds.circulationRate === undefined) {
                    raw.thresholds.circulationRate = raw.thresholds.demurrageRate;
                }
                if (raw.thresholds.demurrageEpochDays !== undefined && raw.thresholds.circulationEpochDays === undefined) {
                    raw.thresholds.circulationEpochDays = raw.thresholds.demurrageEpochDays;
                }
            }
            return raw;
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
 * Validate password complexity:
 * - Minimum 8 characters
 * - Uppercase, lowercase, number, symbol
 */
export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
    if (!password) {
        return { valid: false, error: 'Password is required' };
    }
    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters long' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one number' };
    }
    if (!/[!@#$%^&*(),.?":{}|<>\-_]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one special character (!@#$%^&*(),.?":{}|<>_-)' };
    }
    return { valid: true };
}

/**
 * Generates a high-entropy 20-character password satisfying the strength validator
 */
export function generateStrongPassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()';
    const all = uppercase + lowercase + numbers + symbols;

    let password = '';
    // Ensure at least one from each required category
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill up the rest of the 20 character length
    for (let i = 0; i < 16; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }

    // Shuffle the characters
    return password.split('').sort(() => 0.5 - Math.random()).join('');
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

    if (password) {
        const validation = validatePasswordStrength(password);
        if (!validation.valid) {
            throw new Error(`[Config] ADMIN_PASSWORD environment variable is invalid: ${validation.error}`);
        }
    } else {
        password = generateStrongPassword();
        console.log('');
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║  🔑 Auto-generated admin password:          ║');
        console.log(`║  ${password}                ║`);
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
    circulationRate: 0.005,
    circulationEpochDays: 30,
    syncIntervalMin: 15,
    initialSyncDelaySec: 30,
    handshakeIntervalSec: 10,
    retryIntervalSec: 30,
    maxRetryBackoffMin: 5,
    washTradingWindowHours: 24,
    washTradingMinTxns: 4,
    inactiveMemberDays: 30,
    isolatedBranchMinTxns: 3,
    maxProjectExpiryDays: 365,
    sybilFunnelMinInvitees: 2,
    sybilFunnelMinAmount: 100,
    sybilFunnelWindowDays: 30,
    ghostVelocityTier1Hours: 24,
    ghostVelocityTier1Limit: 20,
    ghostVelocityTier2Hours: 72,
    ghostVelocityTier2Limit: 40,
};

export function getThresholds(): Thresholds {
    const config = getLocalConfig();
    return { ...DEFAULT_THRESHOLDS, ...(config.thresholds || {}) };
}

export function updateThresholds(updates: Partial<Thresholds>): Thresholds {
    const config = getLocalConfig();
    const current = { ...DEFAULT_THRESHOLDS, ...(config.thresholds || {}) };
    
    // Support saving old keys by mapping them to new ones if passed
    if (updates.demurrageRate !== undefined) updates.circulationRate = updates.demurrageRate;
    if (updates.demurrageEpochDays !== undefined) updates.circulationEpochDays = updates.demurrageEpochDays;
    
    const merged = { ...current, ...updates };
    config.thresholds = merged;
    saveLocalConfig(config);
    console.log('⚙️ Thresholds updated:', merged);
    return merged;
}
