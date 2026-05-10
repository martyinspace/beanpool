import { getDirectoryInfo, getNodeConfig, updateNodeConfig } from './state-engine.js';
import { getLocalConfig } from './local-config.js';
import crypto from 'node:crypto';

// The URL of the directory registry Edge Function
const DIRECTORY_REGISTRY_URL = process.env.DIRECTORY_REGISTRY_URL || 'https://dpemwoermzkaxoctafzg.supabase.co/functions/v1/directory-register';
const DIRECTORY_API_KEY = process.env.DIRECTORY_API_KEY;

let pushTimer: ReturnType<typeof setInterval> | null = null;

export function initDirectoryPublisher() {
    const config = getNodeConfig();
    const intervalHours = config.directoryPushIntervalHours || 12;
    
    // Convert hours to milliseconds
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    if (pushTimer) {
        clearInterval(pushTimer);
    }
    
    pushTimer = setInterval(pushDirectoryNow, intervalMs);
    
    // Initial push 30s after boot
    setTimeout(pushDirectoryNow, 30_000);
    console.log(`[Directory] 📡 Push publisher initialized (Interval: ${intervalHours}h)`);
}

export async function pushDirectoryNow() {
    try {
        if (!DIRECTORY_API_KEY) {
            console.log(`[Directory] ℹ️ DIRECTORY_API_KEY not configured. Skipping push.`);
            return { success: false, error: 'DIRECTORY_API_KEY is not configured' };
        }

        const config = getNodeConfig();
        
        // Check if node wants to publish anything at all
        // If everything is turned off, we should still push, but with empty fields?
        // Actually, if it's off, it just won't be on the map. We can skip it,
        // and the TTL will naturally prune it, OR we could push an explicitly empty state.
        // For now, if all are false, we can skip or send nulls.
        if (!config.publishLocation && !config.publishMembers && !config.publishContacts && !config.publishHealth) {
            console.log(`[Directory] ℹ️ All privacy toggles off. Pushing empty state to clear registry.`);
            // We no longer return early here. We want to push the nulls to overwrite existing data!
        }
        
        const directoryInfo = getDirectoryInfo();
        const localConfig = getLocalConfig();
        
        // Provide a stable node ID based on the node's adminHash (which is generated on first boot)
        const nodeId = crypto.createHash('sha256').update(localConfig.adminHash || localConfig.communityName || 'unknown').digest('hex');
        
        const payload = {
            nodeId,
            callsign: localConfig.communityName,
            ...directoryInfo
        };
        
        const res = await fetch(DIRECTORY_REGISTRY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DIRECTORY_API_KEY}`
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        
        // Update lastDirectoryPush
        updateNodeConfig({ lastDirectoryPush: new Date().toISOString() });
        
        console.log(`[Directory] ✅ Successfully published to directory registry`);
        return { success: true, timestamp: new Date().toISOString() };
    } catch (err: any) {
        console.error(`[Directory] ❌ Failed to push directory info:`, err.message);
        return { success: false, error: err.message };
    }
}
