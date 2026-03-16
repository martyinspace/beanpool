/**
 * Sync Library — WebSocket connection to the BeanPool Node
 *
 * Maintains a persistent connection to the Node's state feed.
 * Stores latest state in localStorage for offline read-only access.
 */

export interface SyncState {
    connected: boolean;
    lastSyncTime: number | null;   // Unix timestamp
    merkleRoot: string | null;
    accountCount: number;
}

type SyncCallback = (state: SyncState) => void;

const STORAGE_KEY = 'beanpool-sync-state';
const RECONNECT_INTERVAL = 5000;

let ws: WebSocket | null = null;
let listeners: SyncCallback[] = [];
let currentState: SyncState = loadCachedState();

function loadCachedState(): SyncState {
    try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return { connected: false, lastSyncTime: null, merkleRoot: null, accountCount: 0 };
}

function cacheState(state: SyncState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function notify(): void {
    listeners.forEach((cb) => cb(currentState));
}

/**
 * Connect to the BeanPool node's WebSocket state feed.
 */
export function connectToAnchor(url?: string): void {
    // Use same-origin WebSocket (PWA is served by the node)
    const wsUrl = url ?? `wss://${window.location.host}/ws`;

    try {
        ws = new WebSocket(wsUrl);
    } catch {
        currentState = { ...currentState, connected: false };
        notify();
        scheduleReconnect(wsUrl);
        return;
    }

    ws.onopen = () => {
        currentState = { ...currentState, connected: true };
        notify();
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            currentState = {
                connected: true,
                lastSyncTime: Date.now(),
                merkleRoot: data.merkleRoot ?? currentState.merkleRoot,
                accountCount: data.accountCount ?? currentState.accountCount,
            };
            cacheState(currentState);
            notify();
        } catch { /* ignore malformed messages */ }
    };

    ws.onclose = () => {
        currentState = { ...currentState, connected: false };
        notify();
        scheduleReconnect(wsUrl);
    };

    ws.onerror = () => {
        ws?.close();
    };
}

function scheduleReconnect(url: string): void {
    setTimeout(() => connectToAnchor(url), RECONNECT_INTERVAL);
}

/**
 * Subscribe to sync state changes.
 */
export function onSyncChange(cb: SyncCallback): () => void {
    listeners.push(cb);
    cb(currentState); // Immediate callback with current state
    return () => {
        listeners = listeners.filter((l) => l !== cb);
    };
}

/**
 * Get the current sync state (for non-reactive reads).
 */
export function getSyncState(): SyncState {
    return currentState;
}
