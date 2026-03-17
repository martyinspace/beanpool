/**
 * HTTPS Server — PWA Host + Settings API + Community API (Port 8443)
 *
 * Serves:
 * - PWA static files over HTTPS
 * - /settings — Admin settings page (HTML)
 * - /api/local/* — Settings & Connector API endpoints
 * - /api/community/* — Community info, member registration
 * - /api/ledger/* — Balance, transfers, transactions
 * - /api/marketplace/* — Posts (needs & offers)
 * - /ws — WebSocket real-time state feed
 *
 * Public nodes: Let's Encrypt certs
 * LAN nodes: Self-signed certs + /trust for CA download
 */

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import Koa from 'koa';
import Router from '@koa/router';
import serve from 'koa-static';
import { getCaCertPem, getServerCertPem, getServerKeyPem, isUsingLetsEncrypt } from './tls.js';
import {
    getLocalConfig, saveLocalConfig, hashPassword, verifyPassword,
    getThresholds, updateThresholds, DEFAULT_THRESHOLDS,
} from './local-config.js';
import {
    getConnectors, addConnector, removeConnector,
    connectToAddress, disconnectFromAddress,
    type TrustLevel,
} from './connector-manager.js';
import { getP2PNode } from './p2p.js';
import { WebSocketServer } from 'ws';
import {
    registerMember, getMembers, getMember,
    getBalance, transfer, getTransactions,
    createPost, getPosts, removePost,
    getCommunityInfo, addWsClient, removeWsClient,
    generateInvite, redeemInvite, getInviteTree, getInvitesByMember,
    updateProfile, getProfile,
    createConversation, sendMessage, getConversationsByMember,
    getConversationMessages, getConversation,
    getCommunityHealth,
} from './state-engine.js';

const PUBLIC_DIR = path.resolve('public');
const SETTINGS_PATH = path.resolve('public/settings.html');

// Rate limiter for auth endpoints (3 attempts per minute per IP)
const authAttempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ctx: Koa.Context): boolean {
    const ip = ctx.ip || 'unknown';
    const now = Date.now();
    const entry = authAttempts.get(ip);
    if (entry && now < entry.resetAt) {
        if (entry.count >= 3) {
            const waitSec = Math.ceil((entry.resetAt - now) / 1000);
            ctx.status = 429;
            ctx.body = { error: `Too many attempts. Try again in ${waitSec}s` };
            return false;
        }
        entry.count++;
    } else {
        authAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    }
    return true;
}

export async function startHttpsServer(port: number): Promise<void> {
    const app = new Koa();
    const router = new Router();

    // JSON body parser middleware
    app.use(async (ctx, next) => {
        if (ctx.method === 'POST' || ctx.method === 'PUT' || ctx.method === 'DELETE') {
            if (ctx.request.type === 'application/json' || ctx.get('content-type')?.includes('json')) {
                try {
                    const body = await readBody(ctx.req);
                    (ctx as any).requestBody = JSON.parse(body);
                } catch {
                    (ctx as any).requestBody = {};
                }
            } else {
                (ctx as any).requestBody = {};
            }
        }
        await next();
    });

    // Trust endpoint — only for self-signed mode
    if (!isUsingLetsEncrypt()) {
        router.get('/trust', async (ctx) => {
            ctx.type = 'application/x-pem-file';
            ctx.set('Content-Disposition', 'attachment; filename="beanpool-ca.pem"');
            ctx.body = getCaCertPem();
        });
    }

    // ===================== SETTINGS PAGE =====================

    router.get('/settings', async (ctx) => {
        if (fs.existsSync(SETTINGS_PATH)) {
            ctx.type = 'html';
            ctx.body = fs.createReadStream(SETTINGS_PATH);
        } else {
            ctx.status = 404;
            ctx.body = 'Settings page not found. Ensure settings.html is in the public directory.';
        }
    });

    // ===================== LOCAL STATUS API =====================

    router.get('/api/local/status', async (ctx) => {
        const config = getLocalConfig();
        ctx.body = {
            isLocked: config.isLocked,
            callsign: config.callsign || null,
            location: config.location || null,
        };
    });

    // ===================== AUTH API =====================

    router.post('/api/local/verify-password', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password } = (ctx as any).requestBody || {};

        if (!password) {
            ctx.status = 400;
            ctx.body = { error: 'Password required' };
            return;
        }

        if (!config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }

        ctx.body = { success: true };
    });

    // ===================== IDENTITY API =====================

    router.post('/api/local/update-identity', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password, callsign, lat, lng } = (ctx as any).requestBody || {};

        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }

        if (callsign !== undefined) config.callsign = (callsign || '').slice(0, 20);
        if (lat !== undefined && lng !== undefined) {
            config.location = { lat: parseFloat(lat), lng: parseFloat(lng) };
        }
        saveLocalConfig(config);
        ctx.body = { success: true };
    });

    router.post('/api/local/change-password', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { currentPassword, newPassword } = (ctx as any).requestBody || {};

        if (!currentPassword || !config.adminHash || !config.salt ||
            !verifyPassword(currentPassword, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid current password' };
            return;
        }

        if (!newPassword || newPassword.length < 4) {
            ctx.status = 400;
            ctx.body = { error: 'New password must be at least 4 characters' };
            return;
        }

        const { hash, salt } = hashPassword(newPassword);
        config.adminHash = hash;
        config.salt = salt;
        saveLocalConfig(config);
        ctx.body = { success: true };
    });

    // ===================== DASHBOARD API =====================

    router.get('/api/local/dashboard', async (ctx) => {
        const config = getLocalConfig();
        const node = getP2PNode();

        ctx.body = {
            identity: {
                peerId: node?.peerId?.toString() || 'unknown',
                callsign: config.callsign,
                location: config.location,
                joinedAt: config.joinedAt,
            },
            connectors: getConnectors(),
        };
    });

    // ===================== CONNECTOR API =====================

    router.get('/api/local/connectors', async (ctx) => {
        ctx.body = getConnectors();
    });

    router.post('/api/local/connectors', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password, address, trustLevel, callsign } = (ctx as any).requestBody || {};

        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }

        if (!address) {
            ctx.status = 400;
            ctx.body = { error: 'Address is required' };
            return;
        }

        const validTrustLevels: TrustLevel[] = ['full_sync', 'credit_verification', 'read_only'];
        const level: TrustLevel = validTrustLevels.includes(trustLevel) ? trustLevel : 'credit_verification';

        const connector = addConnector(address, level, callsign);
        ctx.body = { success: true, connector };
    });

    router.post('/api/local/connectors/connect', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password, address } = (ctx as any).requestBody || {};

        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }

        if (!address) {
            ctx.status = 400;
            ctx.body = { error: 'Address is required' };
            return;
        }

        const success = await connectToAddress(address);
        ctx.body = { success };
    });

    router.post('/api/local/connectors/disconnect', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password, address } = (ctx as any).requestBody || {};

        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }

        if (!address) {
            ctx.status = 400;
            ctx.body = { error: 'Address is required' };
            return;
        }

        await disconnectFromAddress(address);
        ctx.body = { success: true };
    });

    router.post('/api/local/connectors/remove', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password, address } = (ctx as any).requestBody || {};

        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }

        if (!address) {
            ctx.status = 400;
            ctx.body = { error: 'Address is required' };
            return;
        }

        await disconnectFromAddress(address);
        const removed = removeConnector(address);
        ctx.body = { success: removed };
    });

    // ===================== RESET =====================

    router.post('/api/local/reset', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password } = (ctx as any).requestBody || {};

        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }

        saveLocalConfig({
            isLocked: false,
            callsign: null,
            location: null,
            adminHash: null,
            salt: null,
            joinedAt: null,
        });

        ctx.body = { success: true, message: 'Node reset. Restart to reconfigure.' };
    });

    // ===================== COMMUNITY API (PUBLIC) =====================

    router.get('/api/community/info', async (ctx) => {
        ctx.body = getCommunityInfo();
    });

    router.get('/api/community/health', async (ctx) => {
        ctx.body = getCommunityHealth();
    });

    router.get('/api/community/members', async (ctx) => {
        ctx.body = getMembers();
    });

    router.post('/api/community/register', async (ctx) => {
        const { publicKey, callsign } = (ctx as any).requestBody || {};
        if (!publicKey || !callsign) {
            ctx.status = 400;
            ctx.body = { error: 'publicKey and callsign are required' };
            return;
        }
        const member = registerMember(publicKey, callsign.slice(0, 20));
        ctx.body = { success: true, member };
    });

    // ===================== INVITE API (PUBLIC) =====================

    router.post('/api/invite/generate', async (ctx) => {
        const { publicKey } = (ctx as any).requestBody || {};
        if (!publicKey) {
            ctx.status = 400;
            ctx.body = { error: 'publicKey is required' };
            return;
        }
        const invite = generateInvite(publicKey);
        if (!invite) {
            ctx.status = 403;
            ctx.body = { error: 'Only registered members can generate invites' };
            return;
        }
        ctx.body = { success: true, invite };
    });

    router.post('/api/invite/redeem', async (ctx) => {
        const { code, publicKey, callsign } = (ctx as any).requestBody || {};
        if (!code || !publicKey || !callsign) {
            ctx.status = 400;
            ctx.body = { error: 'code, publicKey, and callsign are required' };
            return;
        }
        const result = redeemInvite(code, publicKey, callsign.slice(0, 20));
        if (!result.success) {
            ctx.status = 400;
            ctx.body = { error: result.error };
            return;
        }
        ctx.body = { success: true, member: result.member };
    });

    router.get('/api/invite/tree', async (ctx) => {
        ctx.body = getInviteTree();
    });

    router.get('/api/invite/mine/:publicKey', async (ctx) => {
        const { publicKey } = ctx.params;
        const invites = getInvitesByMember(publicKey);
        ctx.body = { invites };
    });

    // ===================== PROFILE API (PUBLIC) =====================

    router.post('/api/profile/update', async (ctx) => {
        const { publicKey, avatar, bio, contact } = (ctx as any).requestBody || {};
        if (!publicKey) {
            ctx.status = 400;
            ctx.body = { error: 'publicKey is required' };
            return;
        }
        const profile = updateProfile(publicKey, { avatar, bio, contact });
        if (!profile) {
            ctx.status = 404;
            ctx.body = { error: 'Member not found' };
            return;
        }
        ctx.body = { success: true, profile };
    });

    router.get('/api/profile/:publicKey', async (ctx) => {
        const { publicKey } = ctx.params;
        const requester = ctx.query.requester as string | undefined;
        const profile = getProfile(publicKey, requester);
        if (!profile) {
            ctx.status = 404;
            ctx.body = { error: 'Member not found' };
            return;
        }
        ctx.body = profile;
    });

    // ===================== LEDGER API (PUBLIC) =====================

    router.get('/api/ledger/balance/:publicKey', async (ctx) => {
        const { publicKey } = ctx.params;
        const member = getMember(publicKey);
        if (!member) {
            ctx.status = 404;
            ctx.body = { error: 'Member not found' };
            return;
        }
        ctx.body = { ...getBalance(publicKey), callsign: member.callsign };
    });

    router.post('/api/ledger/transfer', async (ctx) => {
        const { from, to, amount, memo } = (ctx as any).requestBody || {};
        if (!from || !to || !amount) {
            ctx.status = 400;
            ctx.body = { error: 'from, to, and amount are required' };
            return;
        }
        const txn = transfer(from, to, Number(amount), memo || '');
        if (!txn) {
            ctx.status = 400;
            ctx.body = { error: 'Transfer failed — insufficient credit or unknown member' };
            return;
        }
        ctx.body = { success: true, transaction: txn };
    });

    router.get('/api/ledger/transactions', async (ctx) => {
        const publicKey = ctx.query.publicKey as string | undefined;
        const limit = Number(ctx.query.limit) || 50;
        ctx.body = getTransactions(publicKey, limit);
    });

    // ===================== MESSAGING API (PUBLIC) =====================

    router.post('/api/messages/conversation', async (ctx) => {
        const { type, participants, createdBy, name } = (ctx as any).requestBody || {};
        if (!type || !participants || !createdBy) {
            ctx.status = 400;
            ctx.body = { error: 'type, participants, and createdBy are required' };
            return;
        }
        if (type === 'dm' && participants.length !== 2) {
            ctx.status = 400;
            ctx.body = { error: 'DM conversations must have exactly 2 participants' };
            return;
        }
        const conv = createConversation(type, participants, createdBy, name);
        if (!conv) {
            ctx.status = 400;
            ctx.body = { error: 'Failed to create conversation — check all participants are registered' };
            return;
        }
        ctx.body = { success: true, conversation: conv };
    });

    router.post('/api/messages/send', async (ctx) => {
        const { conversationId, authorPubkey, ciphertext, nonce } = (ctx as any).requestBody || {};
        if (!conversationId || !authorPubkey || !ciphertext || !nonce) {
            ctx.status = 400;
            ctx.body = { error: 'conversationId, authorPubkey, ciphertext, and nonce are required' };
            return;
        }
        const msg = sendMessage(conversationId, authorPubkey, ciphertext, nonce);
        if (!msg) {
            ctx.status = 400;
            ctx.body = { error: 'Failed to send — conversation not found or not a participant' };
            return;
        }
        ctx.body = { success: true, message: msg };
    });

    router.get('/api/messages/conversations/:publicKey', async (ctx) => {
        const { publicKey } = ctx.params;
        ctx.body = { conversations: getConversationsByMember(publicKey) };
    });

    router.get('/api/messages/:conversationId', async (ctx) => {
        const { conversationId } = ctx.params;
        const conv = getConversation(conversationId);
        if (!conv) {
            ctx.status = 404;
            ctx.body = { error: 'Conversation not found' };
            return;
        }
        const limit = Number(ctx.query.limit) || 50;
        ctx.body = {
            conversation: conv,
            messages: getConversationMessages(conversationId, limit),
        };
    });

    // ===================== MARKETPLACE API (PUBLIC) =====================

    router.get('/api/marketplace/posts', async (ctx) => {
        const type = ctx.query.type as string | undefined;
        const category = ctx.query.category as string | undefined;
        ctx.body = getPosts({ type, category });
    });

    router.post('/api/marketplace/posts', async (ctx) => {
        const { type, category, title, description, credits, authorPublicKey, lat, lng } =
            (ctx as any).requestBody || {};
        if (!type || !title || !authorPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'type, title, and authorPublicKey are required' };
            return;
        }
        const post = createPost(
            type, category || 'other', title, description || '',
            Number(credits) || 0, authorPublicKey,
            lat != null ? Number(lat) : undefined,
            lng != null ? Number(lng) : undefined,
        );
        if (!post) {
            ctx.status = 400;
            ctx.body = { error: 'Failed — author must be a registered member' };
            return;
        }
        ctx.body = { success: true, post };
    });

    router.post('/api/marketplace/posts/remove', async (ctx) => {
        const { id, authorPublicKey } = (ctx as any).requestBody || {};
        if (!id || !authorPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'id and authorPublicKey are required' };
            return;
        }
        const removed = removePost(id, authorPublicKey);
        ctx.body = { success: removed };
    });

    // ===================== VERSION & UPDATES =====================

    // Read version from root package.json
    function getVersion(): string {
        try {
            // In Docker, cwd is /app/apps/server, so root is ../../package.json
            let pkgPath = path.resolve('../../package.json');
            if (!fs.existsSync(pkgPath)) {
                // Fallback for local dev if cwd is already root or something else
                pkgPath = path.resolve('package.json');
            }
            const rootPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            return rootPkg.version || '0.0.0';
        } catch { return '0.0.0'; }
    }

    // Get git commit hash
    function getCommitHash(): string {
        try {
            return execSync('git rev-parse --short HEAD 2>/dev/null').toString().trim();
        } catch { return 'unknown'; }
    }

    router.get('/api/version', (ctx) => {
        ctx.body = {
            version: getVersion(),
            commit: getCommitHash(),
            buildTime: new Date().toISOString(),
            node: process.env.CF_RECORD_NAME || 'local',
        };
    });

    // ===================== THRESHOLDS API =====================

    router.post('/api/admin/thresholds', async (ctx) => {
        const config = getLocalConfig();
        const { password, ...updates } = (ctx as any).requestBody || {};
        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }
        // Only allow known threshold keys
        const allowed = Object.keys(DEFAULT_THRESHOLDS);
        const filtered: Record<string, number> = {};
        for (const [k, v] of Object.entries(updates)) {
            if (allowed.includes(k) && typeof v === 'number') {
                filtered[k] = v;
            }
        }
        const result = updateThresholds(filtered);
        ctx.body = { thresholds: result };
    });

    router.get('/api/admin/thresholds', async (ctx) => {
        ctx.body = { thresholds: getThresholds(), defaults: DEFAULT_THRESHOLDS };
    });

    function semverGreater(a: string, b: string): boolean {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if ((pa[i] || 0) > (pb[i] || 0)) return true;
            if ((pa[i] || 0) < (pb[i] || 0)) return false;
        }
        return false;
    }

    router.post('/api/admin/check-update', async (ctx) => {
        const config = getLocalConfig();
        const { password } = (ctx as any).requestBody || {};
        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }
        try {
            const response = await fetch(
                'https://api.github.com/repos/martyinspace/beanpool/releases/latest',
                { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'BeanPool-Node' } }
            );
            if (response.ok) {
                const release = await response.json() as any;
                const latestVersion = (release.tag_name || '').replace(/^v/, '');
                const currentVersion = getVersion();
                const isNewer = semverGreater(latestVersion, currentVersion);
                ctx.body = {
                    currentVersion,
                    latestVersion,
                    updateAvailable: isNewer,
                    releaseUrl: release.html_url || '',
                    releaseNotes: release.body || '',
                    publishedAt: release.published_at || '',
                };
            } else {
                // No releases yet — check tags instead
                const tagsResponse = await fetch(
                    'https://api.github.com/repos/martyinspace/beanpool/tags?per_page=1',
                    { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'BeanPool-Node' } }
                );
                if (tagsResponse.ok) {
                    const tags = await tagsResponse.json() as any[];
                    const latestTag = tags[0]?.name?.replace(/^v/, '') || '';
                    const currentVersion = getVersion();
                    ctx.body = {
                        currentVersion,
                        latestVersion: latestTag,
                        updateAvailable: semverGreater(latestTag, currentVersion),
                        releaseUrl: '',
                        releaseNotes: '',
                        publishedAt: '',
                    };
                } else {
                    ctx.body = {
                        currentVersion: getVersion(),
                        latestVersion: '',
                        updateAvailable: false,
                        error: 'Could not reach GitHub',
                    };
                }
            }
        } catch (e: any) {
            ctx.body = {
                currentVersion: getVersion(),
                latestVersion: '',
                updateAvailable: false,
                error: e.message || 'Failed to check',
            };
        }
    });

    router.post('/api/admin/update', async (ctx) => {
        const config = getLocalConfig();
        const { password } = (ctx as any).requestBody || {};
        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }
        try {
            // Signal-file approach: write a marker to the shared /data volume.
            // The host-side update.sh (running as a cron job) detects this file,
            // runs `docker pull` for the latest GHCR image, and restarts the container.
            const dataDir = process.env.BEANPOOL_DATA_DIR || '/data';
            const signalPath = path.join(dataDir, '.update-requested');
            fs.writeFileSync(signalPath, JSON.stringify({
                requestedAt: new Date().toISOString(),
                currentVersion: getVersion(),
            }));
            ctx.body = {
                success: true,
                message: 'Update requested. The node will pull the latest image and restart within 60 seconds.',
            };
        } catch (e: any) {
            ctx.status = 500;
            ctx.body = { success: false, error: e.message || 'Update request failed' };
        }
    });

    // ===================== MIDDLEWARE =====================

    app.use(router.routes());
    app.use(router.allowedMethods());

    // Serve the PWA static files
    app.use(serve(PUBLIC_DIR, {
        index: 'index.html',
        gzip: true,
    }));

    // SPA fallback — return index.html for any unmatched route (except /settings and /api)
    app.use(async (ctx) => {
        if (ctx.method === 'GET' && !ctx.path.startsWith('/api') && ctx.path !== '/settings' && ctx.path !== '/ws') {
            const indexPath = path.join(PUBLIC_DIR, 'index.html');
            if (fs.existsSync(indexPath)) {
                ctx.type = 'html';
                ctx.body = fs.createReadStream(indexPath);
            }
        }
    });

    const serverOptions: https.ServerOptions = {
        cert: getServerCertPem(),
        key: getServerKeyPem(),
    };

    return new Promise((resolve) => {
        const server = https.createServer(serverOptions, app.callback());

        // WebSocket upgrade handler
        const wss = new WebSocketServer({ noServer: true });
        server.on('upgrade', (req, socket, head) => {
            if (req.url === '/ws') {
                wss.handleUpgrade(req, socket, head, (ws) => {
                    addWsClient(ws);
                    ws.on('close', () => removeWsClient(ws));
                    ws.on('error', () => removeWsClient(ws));
                });
            } else {
                socket.destroy();
            }
        });

        server.listen(port, () => {
            console.log(`🔒 PWA + Settings + API (HTTPS) listening on https://0.0.0.0:${port}`);
            resolve();
        });
    });
}

/**
 * Read raw request body as a string
 */
function readBody(req: import('node:http').IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}
