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
import crypto from 'node:crypto';
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
import { federationCors, mountFederationRoutes } from './federation-api.js';
import { federatedRelayMessage, federatedVerifyMember } from './federation-protocol.js';
import { getP2PNode } from './p2p.js';
import { WebSocketServer } from 'ws';
import {
    registerMember, getMembers, getAllMembers, getMember,
    getBalance, transfer, getTransactions,
    createPost, getPosts, removePost, updatePost,
    acceptPost, completePostTransaction, cancelPostTransaction,
    pausePost, resumePost, getMarketplaceTransactions,
    requestPost, approvePostRequest, rejectPostRequest, cancelPostRequest,
    getCommunityInfo, addWsClient, removeWsClient,
    generateInvite, redeemInvite, redeemOfflineTicket, getInviteTree, getInvitesByMember,
    createShortlink, getShortlink,
    updateProfile, getProfile,
    createConversation, sendMessage, getConversationsByMember,
    getConversationMessages, getConversation,
    getCommunityHealth,
    seedGenesisMember,
    addRating, getRatings, getAverageRating,
    submitReport, getReports,
    getFriends, addFriend, removeFriend, setGuardian,
    adminSetUserStatus, adminDeletePost, adminPruneUser,
    adminPruneBranch, adminBroadcastAnnouncement, adminSendMessage,
    getAdminPubkey, recordActivity,
    markConversationRead, getUnreadCounts,
    createProject, updateProject, deleteProject, voteForProject, createVotingRound, closeVotingRound,
    getProjects, getAllProjects, getVotingRounds, getActiveRound, getCommonsBalance,
    adminRejectProject,
    getNodeConfig, updateNodeConfig, getDirectoryInfo, exportLedgerAudit
} from './state-engine.js';
import { getCrowdfundProjects, getCrowdfundProject, createCrowdfundProject, updateCrowdfundProject, pledgeToProject, deleteCrowdfundProject } from './db/db.js';

const PUBLIC_DIR = path.resolve('public');
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Rate limiter for auth endpoints (15 attempts per minute per IP)
const authAttempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ctx: Koa.Context): boolean {
    const ip = ctx.ip || 'unknown';
    const now = Date.now();
    const entry = authAttempts.get(ip);
    if (entry && now < entry.resetAt) {
        if (entry.count >= 15) {
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

    // Federation CORS middleware (must be before body parser for fast OPTIONS handling)
    app.use(federationCors());

    // JSON body parser middleware
    app.use(async (ctx, next) => {
        if (ctx.method === 'POST' || ctx.method === 'PUT' || ctx.method === 'DELETE') {
            if (ctx.request.type === 'application/json' || ctx.get('content-type')?.includes('json')) {
                try {
                    const body = await readBody(ctx.req);
                    const parsed = JSON.parse(body);
                    (ctx as any).requestBody = parsed;

                    const sender = parsed.publicKey || parsed.authorPublicKey || parsed.buyerPublicKey || parsed.from || parsed.memberPublicKey || parsed.voterPublicKey;
                    if (sender && typeof sender === 'string' && sender.length >= 32) {
                        recordActivity(sender);
                    }
                } catch {
                    (ctx as any).requestBody = {};
                }
            } else {
                (ctx as any).requestBody = {};
            }
        }
        await next();
    });

    // Cryptographic Signature Verification Middleware
    async function requireSignature(ctx: Koa.Context, next: Koa.Next) {
        if (ctx.method !== 'POST') {
            return await next();
        }

        const isProtected = 
            ctx.path.startsWith('/api/profile/update') ||
            ctx.path.startsWith('/api/ledger/transfer') ||
            ctx.path.startsWith('/api/marketplace/posts') ||
            ctx.path.startsWith('/api/marketplace/accept') ||
            ctx.path.startsWith('/api/marketplace/complete') ||
            ctx.path.startsWith('/api/marketplace/cancel') ||
            ctx.path.startsWith('/api/messages/conversation') ||
            ctx.path.startsWith('/api/messages/send') ||
            ctx.path.startsWith('/api/messages/mark-read') ||
            ctx.path.startsWith('/api/commons/projects') ||
            ctx.path.startsWith('/api/crowdfund/projects') ||
            ctx.path.startsWith('/api/invite/generate') ||
            ctx.path.startsWith('/api/community/register');

        if (!isProtected) {
            return await next();
        }

        const pubKeyHex = ctx.get('X-Public-Key');
        const signatureBase64 = ctx.get('X-Signature');

        if (!pubKeyHex || !signatureBase64) {
            ctx.status = 401;
            ctx.body = { error: 'Missing cryptographic signature headers' };
            return;
        }

        try {
            const payloadString = JSON.stringify((ctx as any).requestBody || {});
            
            // Convert hex pubkey to SPKI format for Node.js verify
            const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
            const spki = Buffer.concat([spkiHeader, Buffer.from(pubKeyHex, 'hex')]);
            const publicKeyObject = crypto.createPublicKey({
                key: spki,
                format: 'der',
                type: 'spki'
            });

            const isValid = crypto.verify(
                undefined,
                Buffer.from(payloadString),
                publicKeyObject,
                Buffer.from(signatureBase64, 'base64')
            );

            if (!isValid) {
                ctx.status = 403;
                ctx.body = { error: 'Invalid cryptographic signature' };
                return;
            }

            // Reject spoofed body identifiers
            const body = (ctx as any).requestBody;
            if (body.publicKey && body.publicKey !== pubKeyHex) throw new Error('Spoofed publicKey');
            if (body.authorPublicKey && body.authorPublicKey !== pubKeyHex) throw new Error('Spoofed authorPublicKey');
            if (body.authorPubkey && body.authorPubkey !== pubKeyHex) throw new Error('Spoofed authorPubkey');
            if (body.buyerPublicKey && body.buyerPublicKey !== pubKeyHex) throw new Error('Spoofed buyerPublicKey');
            if (body.from && body.from !== pubKeyHex) throw new Error('Spoofed from');
            if (body.proposerPubkey && body.proposerPubkey !== pubKeyHex) throw new Error('Spoofed proposerPubkey');
            if (body.pubkey && body.pubkey !== pubKeyHex) throw new Error('Spoofed pubkey');

        } catch (err: any) {
            ctx.status = 403;
            ctx.body = { error: `Signature validation failed: ${err.message}` };
            return;
        }

        await next();
    }
    app.use(requireSignature);

    // Trust endpoint — only for self-signed mode
    if (!isUsingLetsEncrypt()) {
        router.get('/trust', async (ctx) => {
            ctx.type = 'application/x-pem-file';
            ctx.set('Content-Disposition', 'attachment; filename="beanpool-ca.pem"');
            ctx.body = getCaCertPem();
        });
    }

    // ===================== UNIVERSAL DEEP LINKS (AASA / ASSETLINKS) =====================
    // Apple App Site Association
    router.get('/.well-known/apple-app-site-association', async (ctx) => {
        const teamId = process.env.APPLE_TEAM_ID || '485XM2R33S';
        const bundleId = 'org.beanpool.pillar';

        ctx.type = 'application/json';
        ctx.body = {
            applinks: {
                apps: [],
                details: [
                    {
                        appID: `${teamId}.${bundleId}`,
                        paths: ['/i/*', '/?invite=*', '/app*']
                    }
                ]
            }
        };
    });

    // Android App Links
    router.get('/.well-known/assetlinks.json', async (ctx) => {
        // Fallback to the known SHA256 of org.beanpool.pillar if env is missing
        const sha256 = process.env.ANDROID_CERT_SHA256 || 'FA:55:52:D6:8C:4A:D6:19:2F:AD:A6:A7:78:39:B4:E8:4D:50:FE:E9:FD:6C:C5:DF:6B:0F:51:E7:CB:DC:03:2B';
        const packageName = 'org.beanpool.pillar';

        ctx.type = 'application/json';
        ctx.body = [
            {
                relation: ["delegate_permission/common.handle_all_urls"],
                target: {
                    namespace: "android_app",
                    package_name: packageName,
                    sha256_cert_fingerprints: [sha256]
                }
            }
        ];
    });

    // ===================== SETTINGS PAGE =====================

    router.get('/settings', async (ctx) => {
        const publicPath = path.join(__dirname, '../public/settings.html');
        const staticPath = path.join(__dirname, '../static/settings.html');
        const resolvedPath = fs.existsSync(publicPath) ? publicPath : staticPath;

        if (fs.existsSync(resolvedPath)) {
            ctx.type = 'html';
            ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            ctx.body = fs.createReadStream(resolvedPath);
        } else {
            ctx.status = 404;
            ctx.body = 'Settings page not found. Ensure settings.html is in the public directory.';
        }
    });


    // ===================== ROOT REDIRECT =====================
    // Redirect root to the PWA app — existing users auto-login via IndexedDB identity
    // Preserve query params (e.g. ?invite=BP-XXXX-XXXX) for invite URL flow
    router.get('/', async (ctx) => {
        const query = ctx.querystring ? `?${ctx.querystring}` : '';
        ctx.redirect(`/app${query}`);
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

    // Admin: Generate seed invite for fresh nodes (0 members)
    router.post('/api/admin/seed-invite', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password } = (ctx as any).requestBody || {};

        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return;
        }

        // Check if there are already members
        const info = getCommunityInfo();
        if (info.memberCount > 0) {
            // Already have members — just generate an invite from the genesis member
            const members = getAllMembers();
            const genesisMember = members.find(m => m.invitedBy === 'genesis');
            if (genesisMember) {
                const invite = generateInvite(genesisMember.publicKey);
                if (invite) {
                    ctx.body = { success: true, code: invite.code, message: 'Invite generated from genesis member' };
                    return;
                }
            }
            ctx.status = 400;
            ctx.body = { error: 'Could not generate invite — try from the Invite tab' };
            return;
        }

        // Fresh node — seed a genesis admin account
        const crypto = await import('node:crypto');
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        // Use raw public key bytes as hex for the publicKey identifier
        const pubKeyDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
        const pubKeyHex = pubKeyDer.subarray(-32).toString('hex');

        seedGenesisMember(pubKeyHex, 'Admin');
        const invite = generateInvite(pubKeyHex);
        if (!invite) {
            ctx.status = 500;
            ctx.body = { error: 'Failed to generate seed invite' };
            return;
        }

        console.log(`🌱 Seed invite generated: ${invite.code}`);
        ctx.body = { success: true, code: invite.code, message: 'Genesis member created + seed invite generated' };
    });

    // ===================== IDENTITY API =====================

    router.post('/api/local/update-identity', async (ctx) => {
        if (!rateLimit(ctx)) return;
        const config = getLocalConfig();
        const { password, callsign, lat, lng, communityName, contactEmail, contactPhone } = (ctx as any).requestBody || {};

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
        if (communityName !== undefined) config.communityName = (communityName || '').slice(0, 60) || null;
        if (contactEmail !== undefined) config.contactEmail = (contactEmail || '').slice(0, 100) || null;
        if (contactPhone !== undefined) config.contactPhone = (contactPhone || '').slice(0, 30) || null;
        saveLocalConfig(config);
        ctx.body = { success: true };
    });

    // Public community info — no auth required (landing page)
    router.get('/api/local/community-info', async (ctx) => {
        const config = getLocalConfig();
        ctx.body = {
            communityName: config.communityName || config.callsign || 'BeanPool Community',
            contactEmail: config.contactEmail || null,
            contactPhone: config.contactPhone || null,
            callsign: config.callsign || null,
        };
    });

    // ===================== ADMIN ACTIONS (Requires Password) =====================

    // Middleware-like function for inline password check
    function checkAdminAuth(ctx: any): boolean {
        const config = getLocalConfig();
        const { password } = ctx.requestBody || {};
        if (!password || !config.adminHash || !config.salt || !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Invalid password' };
            return false;
        }
        return true;
    }

    router.post('/api/local/admin/data', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        ctx.body = {
            members: getAllMembers(),
            profiles: getAllMembers().map(m => getProfile(m.publicKey)), // fetch profiles for all
            posts: getPosts().filter(p => p.status !== 'cancelled'), // ONLY send non-cancelled posts to admin
            health: getCommunityHealth(),
        };
    });

    router.post('/api/local/admin/posts/:id/delete', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        try {
            adminDeletePost(ctx.params.id);
            ctx.body = { success: true };
        } catch (e: any) {
            ctx.status = 500;
            ctx.body = { error: e.message, stack: e.stack };
        }
    });

    router.post('/api/local/admin/users/:pubkey/status', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        const { status } = (ctx as any).requestBody || {};
        if (status === 'active' || status === 'disabled') {
            adminSetUserStatus(ctx.params.pubkey, status);
        }
        ctx.body = { success: true };
    });

    router.post('/api/local/admin/users/:pubkey/prune', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        adminPruneUser(ctx.params.pubkey);
        ctx.body = { success: true };
    });

    router.post('/api/local/admin/branches/:pubkey/prune', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        adminPruneBranch(ctx.params.pubkey);
        ctx.body = { success: true };
    });

    router.post('/api/local/admin/announcements', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        const { title, body, severity } = (ctx as any).requestBody || {};
        adminBroadcastAnnouncement(title || 'System Announcement', body || '', severity || 'info');
        ctx.body = { success: true };
    });

    router.post('/api/local/admin/inbox', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        const adminPubkey = getAdminPubkey();
        const convs = getConversationsByMember(adminPubkey);
        // Also grab any legacy 'system' conversations
        const legacyConvs = getConversationsByMember('system').filter(c => !convs.find(x => x.id === c.id));
        const allConvs = [...convs, ...legacyConvs];
        const unreadCounts = getUnreadCounts(adminPubkey);
        const inbox = allConvs.map(c => ({
            ...c,
            messages: getConversationMessages(c.id, 50),
            unreadCount: unreadCounts[c.id] || 0,
        }));
        ctx.body = { conversations: inbox, adminPubkey };
    });

    router.post('/api/local/admin/inbox/send', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        const { targetPubkey, message } = (ctx as any).requestBody || {};
        adminSendMessage(targetPubkey, message || '');
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

        const validTrustLevels: TrustLevel[] = ['mirror', 'peer', 'blocked'];
        const level: TrustLevel = validTrustLevels.includes(trustLevel) ? trustLevel : 'peer';

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
            communityName: null,
            contactEmail: null,
            contactPhone: null,
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
        const { publicKey, intendedFor } = (ctx as any).requestBody || {};
        if (!publicKey) {
            ctx.status = 400;
            ctx.body = { error: 'publicKey is required' };
            return;
        }
        const invite = generateInvite(publicKey, intendedFor);
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

        // Intercept proxy hashes natively so Universal Links can drop them into Welcome screen 
        if (code.length === 4) {
            const payload = getShortlink(code);
            if (payload && payload.startsWith('BP-ey')) {
                const ticketB64 = payload.slice(3);
                const result = redeemOfflineTicket(ticketB64, publicKey, callsign.slice(0, 20));
                if (!result.success) {
                    ctx.status = 400;
                    ctx.body = { error: result.error };
                    return;
                }
                ctx.body = { success: true, member: result.member };
                return;
            }
        }

        const result = redeemInvite(code, publicKey, callsign.slice(0, 20));
        if (!result.success) {
            ctx.status = 400;
            ctx.body = { error: result.error };
            return;
        }
        ctx.body = { success: true, member: result.member };
    });

    router.post('/api/invite/redeem-offline', async (ctx) => {
        const { ticketB64, publicKey, callsign } = (ctx as any).requestBody || {};
        if (!ticketB64 || !publicKey || !callsign) {
            ctx.status = 400;
            ctx.body = { error: 'ticketB64, publicKey, and callsign are required' };
            return;
        }
        const result = redeemOfflineTicket(ticketB64, publicKey, callsign.slice(0, 20));
        if (!result.success) {
            ctx.status = 400;
            ctx.body = { error: result.error };
            return;
        }
        ctx.body = { success: true, member: result.member };
    });

    router.get('/api/invite/tree', async (ctx) => {
        const root = ctx.query.root as string | undefined;
        ctx.body = getInviteTree(root);
    });

    router.get('/api/invite/mine/:publicKey', async (ctx) => {
        const { publicKey } = ctx.params;
        const invites = getInvitesByMember(publicKey);
        ctx.body = { invites };
    });

    // ===================== SHORTLINK API (DEFERRED DEEP LINKS) =====================

    router.post('/api/links/shorten', async (ctx) => {
        const { payload } = (ctx as any).requestBody || {};
        if (!payload) {
            ctx.status = 400;
            ctx.body = { error: 'payload is required' };
            return;
        }

        try {
            const hashId = createShortlink(payload);
            ctx.body = { success: true, hash: hashId };
        } catch (e: any) {
            ctx.status = 500;
            ctx.body = { error: 'Failed to create shortlink' };
        }
    });

    router.get('/i/:hash', async (ctx) => {
        const hash = ctx.params.hash;
        const payload = getShortlink(hash);

        // Fallback if hash doesn't exist or expired
        if (!payload) {
            ctx.redirect('https://beanpool.org');
            return;
        }

        const userAgent = ctx.header['user-agent'] || '';
        let storeUrl = 'https://beanpool.org'; // Fallback
        
        if (/android/i.test(userAgent)) {
            storeUrl = 'https://play.google.com/store/apps/details?id=org.beanpool.app';
        } else if (/iPad|iPhone|iPod/.test(userAgent)) {
            storeUrl = 'https://apps.apple.com/us/app/beanpool/idXXXX'; // Will be updated when app store URL is live
        }

        // Smart Trampoline HTML
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0">
    <title>Join BeanPool Node</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #050a14; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { text-align: center; padding: 20px; max-width: 400px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #94a3b8; font-size: 15px; margin-bottom: 30px; line-height: 1.5; }
        .btn { display: inline-block; background: #10b981; color: #022c22; font-weight: 600; font-size: 16px; padding: 14px 28px; border-radius: 24px; text-decoration: none; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); width: 100%; box-sizing: border-box; }
        .btn:active { transform: scale(0.98); }
        .hint { margin-top: 20px; font-size: 13px; color: #64748b; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to the Pool.</h1>
        <p>You've been invited to join a private BeanPool node.</p>
        
        <button id="magicBtn" class="btn">Copy Invite & Get App</button>
        <p class="hint">Once installed, BeanPool will automatically detect your invite when you open it.</p>
    </div>

    <script>
        const payload = \`\${payload}\`;
        const storeUrl = "\${storeUrl}";
        const btn = document.getElementById('magicBtn');

        // First attempt a direct deep link if they already have the app installed
        setTimeout(() => {
             window.location = "beanpool://welcome?invite=" + encodeURIComponent(payload);
        }, 50);

        btn.onclick = async () => {
            btn.textContent = "Copying & Redirecting...";
            btn.style.opacity = 0.8;
            btn.style.pointerEvents = "none";
            
            try {
                // Primary method (Works on modern browsers with user interaction)
                await navigator.clipboard.writeText(payload);
            } catch (e) {
                // Fallback method
                const textArea = document.createElement("textarea");
                textArea.value = payload;
                document.body.appendChild(textArea);
                textArea.select();
                try { document.execCommand('copy'); } catch(err) {}
                document.body.removeChild(textArea);
            }
            
            // 100ms OS Heartbeat to allow clipboard buffer to register before redirecting
            setTimeout(() => {
                window.location.href = storeUrl;
            }, 100);
        };
    </script>
</body>
</html>
        `;

        ctx.type = 'html';
        ctx.body = html;
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
        const parsedAmount = Number(amount);
        if (!from || !to || !amount) {
            ctx.status = 400;
            ctx.body = { error: 'from, to, and amount are required' };
            return;
        }

        // --- FEDERATION VERIFY ---
        try {
            const members = getMembers();
            const fromMember = members.find(m => m.publicKey === from);
            if (fromMember && fromMember.homeNodeUrl) {
                const p2pNode = getP2PNode();
                if (p2pNode) {
                    const connected = getConnectors();
                    const targetConnector = connected.find(c => c.publicUrl === fromMember.homeNodeUrl);
                    if (targetConnector && targetConnector.peerId) {
                        const verifyResult = await federatedVerifyMember(p2pNode, targetConnector.peerId, from);
                        const homeBalance = verifyResult?.homeBalance ?? 0;
                        const floor = -100; // hardcoded BeanPool credit floor
                        if (!verifyResult || !verifyResult.isMember || (homeBalance - parsedAmount < floor)) {
                            ctx.status = 400;
                            ctx.body = { error: 'Federation check failed: Insufficient funds on home node or member not recognized.' };
                            return;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[Federation] Error verifying remote member:', e);
            ctx.status = 502;
            ctx.body = { error: 'Federation check failed: Could not reach home node.' };
            return;
        }
        // -------------------------

        const txn = transfer(from, to, parsedAmount, memo || '');
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
        const offset = Number(ctx.query.offset) || 0;
        ctx.body = getTransactions(publicKey, limit, offset);
    });

    router.get('/api/ledger/export', async (ctx) => {
        ctx.body = exportLedgerAudit();
    });

    // ===================== MESSAGING API (PUBLIC) =====================

    router.post('/api/messages/conversation', async (ctx) => {
        const { type, participants, createdBy, name, postId } = (ctx as any).requestBody || {};
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
        const conv = createConversation(type, participants, createdBy, name, postId);
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

        // --- FEDERATION RELAY ---
        try {
            const conv = getConversation(conversationId);
            if (conv && conv.type === 'dm') {
                const otherPubkey = conv.participants.find(p => p !== authorPubkey);
                if (otherPubkey) {
                    const members = getMembers();
                    const otherMember = members.find(m => m.publicKey === otherPubkey);
                    
                    // If the other member has a homeNodeUrl, they are a visitor from a remote node
                    if (otherMember && otherMember.homeNodeUrl) {
                        const p2pNode = getP2PNode();
                        if (p2pNode) {
                            const connected = getConnectors();
                            const targetConnector = connected.find(c => c.publicUrl === otherMember.homeNodeUrl);
                            if (targetConnector && targetConnector.peerId) {
                                const localMember = members.find(m => m.publicKey === authorPubkey);
                                const localConfig = getLocalConfig();
                                const hostname = process.env.CF_RECORD_NAME || (localConfig.communityName ? localConfig.communityName.toLowerCase().replace(/\s+/g, '') + '.beanpool.org' : undefined);
                                const localUrl = hostname ? `https://${hostname}` : undefined;

                                // Fire-and-forget over secure Libp2p mesh
                                federatedRelayMessage(p2pNode, targetConnector.peerId, {
                                    senderPublicKey: authorPubkey,
                                    senderCallsign: localMember?.callsign,
                                    senderNodeUrl: localUrl,
                                    recipientPublicKey: otherPubkey,
                                    ciphertext,
                                    nonce
                                }).catch(e => console.warn('[Federation] Failed to relay message to remote peer:', e.message));
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[Federation] Error during message relay:', e);
        }
        // -----------------------

        ctx.body = { success: true, message: msg };
    });

    router.get('/api/messages/conversations/:publicKey', async (ctx) => {
        const { publicKey } = ctx.params;
        const convs = getConversationsByMember(publicKey);
        const unreadCounts = getUnreadCounts(publicKey);
        ctx.body = {
            conversations: convs.map(c => ({ ...c, unreadCount: unreadCounts[c.id] || 0 })),
            totalUnread: Object.values(unreadCounts).reduce((a, b) => a + b, 0),
        };
    });

    router.post('/api/messages/mark-read', async (ctx) => {
        const { pubkey, conversationId } = (ctx as any).requestBody || {};
        if (!pubkey || !conversationId) {
            ctx.status = 400;
            ctx.body = { error: 'Missing pubkey or conversationId' };
            return;
        }
        markConversationRead(pubkey, conversationId);
        ctx.body = { success: true };
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
        const offset = Number(ctx.query.offset) || 0;
        ctx.body = {
            conversation: conv,
            messages: getConversationMessages(conversationId, limit, offset),
        };
    });

    // ===================== MARKETPLACE API (PUBLIC) =====================

    router.get('/api/marketplace/posts', async (ctx) => {
        const type = ctx.query.type as string | undefined;
        const category = ctx.query.category as string | undefined;
        const limit = Number(ctx.query.limit) || 50;
        const offset = Number(ctx.query.offset) || 0;
        const updatedAfter = ctx.query.updatedAfter as string | undefined;
        ctx.body = getPosts({ type, category, limit, offset, updatedAfter });
    });

    router.post('/api/marketplace/posts', async (ctx) => {
        const { id, type, category, title, description, credits, priceType, authorPublicKey, lat, lng, photos, repeatable } =
            (ctx as any).requestBody || {};
        if (!type || !title || !authorPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'type, title, and authorPublicKey are required' };
            return;
        }
        const post = createPost(
            type, category || 'other', title, description || '',
            Number(credits) || 0, priceType === 'hourly' ? 'hourly' : 'fixed', authorPublicKey,
            lat != null ? Number(lat) : undefined,
            lng != null ? Number(lng) : undefined,
            photos,
            repeatable === true || repeatable === 'true',
            id
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

    router.post('/api/marketplace/posts/update', async (ctx) => {
        const { id, authorPublicKey, ...updates } = (ctx as any).requestBody || {};
        if (!id || !authorPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'id and authorPublicKey are required' };
            return;
        }
        const post = updatePost(id, authorPublicKey, updates);
        if (!post) {
            ctx.status = 404;
            ctx.body = { error: 'Post not found or not owned by you' };
            return;
        }
        ctx.body = { success: true, post };
    });

    // ===================== MARKETPLACE TRANSACTIONS =====================

    router.post('/api/marketplace/posts/accept', async (ctx) => {
        try {
            const { postId, buyerPublicKey, hours } = (ctx as any).requestBody || {};
            if (!postId || !buyerPublicKey) {
                ctx.status = 400;
                ctx.body = { error: 'postId and buyerPublicKey are required' };
                return;
            }
            const parsedHours = hours != null ? Number(hours) : undefined;
            const tx = acceptPost(postId, buyerPublicKey, parsedHours);
            ctx.body = { success: true, transaction: tx };
        } catch (err: any) {
            ctx.status = 400;
            ctx.body = { error: err.message };
        }
    });

    router.post('/api/marketplace/posts/request', async (ctx) => {
        try {
            const { postId, buyerPublicKey, hours } = (ctx as any).requestBody || {};
            if (!postId || !buyerPublicKey) {
                ctx.status = 400;
                ctx.body = { error: 'postId and buyerPublicKey are required' };
                return;
            }
            const parsedHours = hours != null ? Number(hours) : undefined;
            const tx = requestPost(postId, buyerPublicKey, parsedHours);
            if (!tx) throw new Error('Cannot request — post not found or unauthorized');
            ctx.body = { success: true, transaction: tx };
        } catch (err: any) {
            ctx.status = 400;
            ctx.body = { error: err.message };
        }
    });

    router.post('/api/marketplace/transactions/approve', async (ctx) => {
        try {
            const { transactionId, authorPublicKey } = (ctx as any).requestBody || {};
            if (!transactionId || !authorPublicKey) {
                ctx.status = 400;
                ctx.body = { error: 'transactionId and authorPublicKey are required' };
                return;
            }
            const tx = approvePostRequest(transactionId, authorPublicKey);
            ctx.body = { success: true, transaction: tx };
        } catch (err: any) {
            ctx.status = 400;
            ctx.body = { error: err.message };
        }
    });

    router.post('/api/marketplace/transactions/reject', async (ctx) => {
        const { transactionId, authorPublicKey } = (ctx as any).requestBody || {};
        if (!transactionId || !authorPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'transactionId and authorPublicKey are required' };
            return;
        }
        const tx = rejectPostRequest(transactionId, authorPublicKey);
        if (!tx) {
            ctx.status = 400;
            ctx.body = { error: 'Cannot reject — request not found or unauthorized' };
            return;
        }
        ctx.body = { success: true, transaction: tx };
    });

    router.post('/api/marketplace/transactions/cancel-request', async (ctx) => {
        const { transactionId, buyerPublicKey } = (ctx as any).requestBody || {};
        if (!transactionId || !buyerPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'transactionId and buyerPublicKey are required' };
            return;
        }
        const tx = cancelPostRequest(transactionId, buyerPublicKey);
        if (!tx) {
            ctx.status = 400;
            ctx.body = { error: 'Cannot cancel — request not found or unauthorized' };
            return;
        }
        ctx.body = { success: true, transaction: tx };
    });

    router.post('/api/marketplace/transactions/complete', async (ctx) => {
        const { transactionId, confirmerPublicKey, finalHours } = (ctx as any).requestBody || {};
        if (!transactionId || !confirmerPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'transactionId and confirmerPublicKey are required' };
            return;
        }
        const parsedFinalHours = finalHours != null ? Number(finalHours) : undefined;
        const tx = completePostTransaction(transactionId, confirmerPublicKey, parsedFinalHours);
        if (!tx) {
            ctx.status = 400;
            ctx.body = { error: 'Cannot complete — transaction not found, not pending, or credit transfer failed' };
            return;
        }
        ctx.body = { success: true, transaction: tx };
    });

    router.post('/api/marketplace/transactions/cancel', async (ctx) => {
        const { transactionId, cancellerPublicKey } = (ctx as any).requestBody || {};
        if (!transactionId || !cancellerPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'transactionId and cancellerPublicKey are required' };
            return;
        }
        const tx = cancelPostTransaction(transactionId, cancellerPublicKey);
        if (!tx) {
            ctx.status = 400;
            ctx.body = { error: 'Cannot cancel — transaction not found or not authorized' };
            return;
        }
        ctx.body = { success: true, transaction: tx };
    });

    router.post('/api/marketplace/posts/pause', async (ctx) => {
        const { postId, authorPublicKey } = (ctx as any).requestBody || {};
        if (!postId || !authorPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'postId and authorPublicKey are required' };
            return;
        }
        const success = pausePost(postId, authorPublicKey);
        ctx.body = { success };
    });

    router.post('/api/marketplace/posts/resume', async (ctx) => {
        const { postId, authorPublicKey } = (ctx as any).requestBody || {};
        if (!postId || !authorPublicKey) {
            ctx.status = 400;
            ctx.body = { error: 'postId and authorPublicKey are required' };
            return;
        }
        const success = resumePost(postId, authorPublicKey);
        ctx.body = { success };
    });

    router.get('/api/marketplace/transactions', async (ctx) => {
        const publicKey = ctx.query.publicKey as string;
        const status = ctx.query.status as string | undefined;
        if (!publicKey) {
            ctx.status = 400;
            ctx.body = { error: 'publicKey query parameter is required' };
            return;
        }
        const limit = Number(ctx.query.limit) || 50;
        const offset = Number(ctx.query.offset) || 0;
        ctx.body = getMarketplaceTransactions(publicKey, status ? { status } : undefined, limit, offset);
    });

    // ===================== RATINGS =====================

    router.post('/api/ratings', async (ctx) => {
        const { raterPubkey, targetPubkey, stars, comment, transactionId } = (ctx as any).requestBody || {};
        if (!raterPubkey || !targetPubkey || !stars || !transactionId) {
            ctx.status = 400;
            ctx.body = { error: 'raterPubkey, targetPubkey, stars, and transactionId are required' };
            return;
        }
        const rating = addRating(raterPubkey, targetPubkey, Number(stars), comment || '', transactionId);
        if (!rating) {
            ctx.status = 400;
            ctx.body = { error: 'Failed — transaction must be completed, both users must be participants' };
            return;
        }
        ctx.body = { success: true, rating };
    });

    router.get('/api/ratings/:publicKey', async (ctx) => {
        const { publicKey } = ctx.params;
        const memberRatings = getRatings(publicKey);
        const average = getAverageRating(publicKey);
        ctx.body = { ratings: memberRatings, ...average };
    });

    // ===================== COMMUNITY COMMONS =====================

    router.get('/api/commons/balance', async (ctx) => {
        ctx.body = { balance: getCommonsBalance() };
    });

    router.get('/api/commons/projects', async (ctx) => {
        ctx.body = { projects: getProjects(), activeRound: getActiveRound() };
    });

    router.post('/api/commons/projects', async (ctx) => {
        const { proposerPubkey, title, description, requestedAmount } = (ctx as any).requestBody || {};
        if (!proposerPubkey || !title || !requestedAmount) {
            ctx.status = 400;
            ctx.body = { error: 'proposerPubkey, title, and requestedAmount are required' };
            return;
        }
        const project = createProject(proposerPubkey, title, description || '', Number(requestedAmount));
        if (!project) {
            ctx.status = 400;
            ctx.body = { error: 'Failed — must be a registered member, title/amount required' };
            return;
        }
        ctx.body = { success: true, project };
    });

    router.post('/api/commons/projects/update', async (ctx) => {
        const { proposerPubkey, projectId, title, description, requestedAmount } = (ctx as any).requestBody || {};
        if (!proposerPubkey || typeof proposerPubkey !== 'string') return ctx.throw(400, 'Invalid pubkey');
        if (!projectId || !title || !requestedAmount) return ctx.throw(400, 'Missing fields');
        
        const success = updateProject(proposerPubkey, projectId, title, description || '', Number(requestedAmount));
        if (!success) {
            return ctx.throw(400, 'Failed to update project. It might not exist, you might not own it, or it is no longer in a proposed state.');
        }
        ctx.body = { success: true };
    });

    router.post('/api/commons/projects/delete', async (ctx) => {
        const { proposerPubkey, projectId } = (ctx as any).requestBody || {};
        if (!proposerPubkey || typeof proposerPubkey !== 'string') return ctx.throw(400, 'Invalid pubkey');
        if (!projectId) return ctx.throw(400, 'Missing projectId');
        
        const success = deleteProject(proposerPubkey, projectId);
        if (!success) {
            return ctx.throw(400, 'Failed to delete project. It might not exist, you might not own it, or it is no longer in a proposed state.');
        }
        ctx.body = { success: true };
    });

    router.post('/api/commons/vote', async (ctx) => {
        const { voterPubkey, projectId } = (ctx as any).requestBody || {};
        if (!voterPubkey || !projectId) {
            ctx.status = 400;
            ctx.body = { error: 'voterPubkey and projectId are required' };
            return;
        }
        const result = voteForProject(voterPubkey, projectId);
        if (!result.success) {
            ctx.status = 400;
            ctx.body = { error: result.error };
            return;
        }
        ctx.body = { success: true };
    });

    router.get('/api/commons/rounds', async (ctx) => {
        ctx.body = { rounds: getVotingRounds(), activeRound: getActiveRound() };
    });

    // ==========================================
    // CROWDFUNDING API
    // ==========================================

    router.get('/api/crowdfund/projects', async (ctx) => {
        ctx.body = { 
            projects: getCrowdfundProjects(),
            maxProjectExpiryDays: getThresholds().maxProjectExpiryDays 
        };
    });

    router.get('/api/crowdfund/projects/:id', async (ctx) => {
        const project = getCrowdfundProject(ctx.params.id);
        if (!project) return ctx.throw(404, 'Project not found');
        ctx.body = { project };
    });

    router.post('/api/crowdfund/projects', async (ctx) => {
        const { id, creatorPubkey, title, description, photos, goalAmount, deadlineAt } = (ctx as any).requestBody || {};
        if (!creatorPubkey || !title || !goalAmount) {
            ctx.status = 400;
            ctx.body = { error: 'creatorPubkey, title, and goalAmount are required' };
            return;
        }

        if (deadlineAt) {
            const maxDays = getThresholds().maxProjectExpiryDays;
            const diffDays = (new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            if (diffDays > maxDays) {
                ctx.status = 400;
                ctx.body = { error: `Project deadline cannot exceed ${maxDays} days` };
                return;
            }
        }

        const projectId = id || crypto.randomUUID();
        createCrowdfundProject(projectId, creatorPubkey, title, description || '', photos || [], Number(goalAmount), deadlineAt || null);
        const project = getCrowdfundProject(projectId);
        
        ctx.body = { success: true, project };
    });

    router.post('/api/crowdfund/projects/update', async (ctx) => {
        const { id, creatorPubkey, title, description, photos, goalAmount, deadlineAt } = (ctx as any).requestBody || {};
        if (!id || !creatorPubkey || !title || !goalAmount) {
            ctx.status = 400;
            ctx.body = { error: 'id, creatorPubkey, title, and goalAmount are required' };
            return;
        }

        if (deadlineAt) {
            const maxDays = getThresholds().maxProjectExpiryDays;
            const diffDays = (new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            if (diffDays > maxDays) {
                ctx.status = 400;
                ctx.body = { error: `Project deadline cannot exceed ${maxDays} days` };
                return;
            }
        }

        try {
            updateCrowdfundProject(id, creatorPubkey, title, description || '', photos || [], Number(goalAmount), deadlineAt);
            const project = getCrowdfundProject(id);
            ctx.body = { success: true, project };
        } catch (e: any) {
            ctx.status = 400;
            ctx.body = { error: e.message || 'Failed to update project' };
        }
    });

    router.post('/api/crowdfund/projects/delete', async (ctx) => {
        const { id, creatorPubkey } = (ctx as any).requestBody || {};
        if (!id || !creatorPubkey) {
            ctx.status = 400;
            ctx.body = { error: 'id and creatorPubkey are required' };
            return;
        }

        try {
            deleteCrowdfundProject(id, creatorPubkey);
            ctx.body = { success: true };
        } catch (e: any) {
            ctx.status = 400;
            ctx.body = { error: e.message || 'Failed to delete project' };
        }
    });

    router.post('/api/crowdfund/projects/:id/pledge', async (ctx) => {
        const projectId = ctx.params.id;
        const { fromPubkey, amount, memo } = (ctx as any).requestBody || {};
        const parsedAmount = Number(amount);
        
        if (!fromPubkey || !parsedAmount) {
            ctx.status = 400;
            ctx.body = { error: 'fromPubkey and amount are required' };
            return;
        }

        // --- FEDERATION VERIFY ---
        try {
            const members = getMembers();
            const fromMember = members.find(m => m.publicKey === fromPubkey);
            if (fromMember && fromMember.homeNodeUrl) {
                const p2pNode = getP2PNode();
                if (p2pNode) {
                    const connected = getConnectors();
                    const targetConnector = connected.find(c => c.publicUrl === fromMember.homeNodeUrl);
                    if (targetConnector && targetConnector.peerId) {
                        const verifyResult = await federatedVerifyMember(p2pNode, targetConnector.peerId, fromPubkey);
                        const homeBalance = verifyResult?.homeBalance ?? 0;
                        const floor = -100; // hardcoded BeanPool credit floor
                        if (!verifyResult || !verifyResult.isMember || (homeBalance - parsedAmount < floor)) {
                            ctx.status = 400;
                            ctx.body = { error: 'Federation check failed: Insufficient funds on home node or member not recognized.' };
                            return;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[Federation] Error verifying remote member:', e);
            ctx.status = 502;
            ctx.body = { error: 'Federation check failed: Could not reach home node.' };
            return;
        }
        // -------------------------

        try {
            const txId = crypto.randomUUID();
            pledgeToProject(txId, projectId, fromPubkey, parsedAmount, memo || 'Project Pledge');
            ctx.body = { success: true, txId };
        } catch (err: any) {
            ctx.status = 400;
            ctx.body = { error: err.message };
        }
    });

    // Admin: create/close voting rounds
    router.post('/api/local/admin/commons/round', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        const { action, projectIds, closesAt, roundId } = (ctx as any).requestBody || {};
        if (action === 'create') {
            if (!projectIds?.length || !closesAt) {
                ctx.status = 400;
                ctx.body = { error: 'projectIds and closesAt required' };
                return;
            }
            const round = createVotingRound(getAdminPubkey(), projectIds, closesAt);
            if (!round) {
                ctx.status = 400;
                ctx.body = { error: 'Failed — another round may be open, or not admin' };
                return;
            }
            ctx.body = { success: true, round };
        } else if (action === 'close') {
            if (!roundId) {
                ctx.status = 400;
                ctx.body = { error: 'roundId required' };
                return;
            }
            const result = closeVotingRound(roundId);
            if (!result.success) {
                ctx.status = 400;
                ctx.body = { error: result.error };
                return;
            }
            ctx.body = { success: true, winner: result.winner || null };
        } else {
            ctx.status = 400;
            ctx.body = { error: 'action must be "create" or "close"' };
        }
    });

    // Admin: reject a project
    router.post('/api/local/admin/commons/reject', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        const { projectId } = (ctx as any).requestBody || {};
        if (!projectId) {
            ctx.status = 400;
            ctx.body = { error: 'projectId required' };
            return;
        }
        adminRejectProject(projectId);
        ctx.body = { success: true };
    });

    // Admin: get all projects (including rejected)
    router.post('/api/local/admin/commons/projects', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        ctx.body = { projects: getAllProjects(), rounds: getVotingRounds(), balance: getCommonsBalance() };
    });

    // ===================== NODE CONFIG =====================

    router.get('/api/node/config', async (ctx) => {
        ctx.body = getNodeConfig();
    });

    router.post('/api/local/admin/node/config', async (ctx) => {
        if (!checkAdminAuth(ctx as any)) return;
        const update = (ctx as any).requestBody || {};
        ctx.body = updateNodeConfig(update);
    });

    // Public directory info endpoint (returns null/403 if opted out)
    // CORS-enabled for beanpool.org website
    router.options('/api/directory/info', async (ctx) => {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        ctx.set('Access-Control-Allow-Headers', 'Content-Type');
        ctx.status = 204;
    });
    router.get('/api/directory/info', async (ctx) => {
        ctx.set('Access-Control-Allow-Origin', '*');
        const info = getDirectoryInfo();
        if (!info) {
            ctx.status = 403;
            ctx.body = { error: 'This node has opted out of the directory' };
            return;
        }
        ctx.body = info;
    });

    // ===================== ABUSE REPORTS =====================

    router.post('/api/reports', async (ctx) => {
        const { reporterPubkey, targetPubkey, reason, targetPostId } = (ctx as any).requestBody || {};
        if (!reporterPubkey || !targetPubkey || !reason) {
            ctx.status = 400;
            ctx.body = { error: 'reporterPubkey, targetPubkey, and reason are required' };
            return;
        }
        const report = submitReport(reporterPubkey, targetPubkey, reason, targetPostId);
        if (!report) {
            ctx.status = 400;
            ctx.body = { error: 'Failed — must be a registered member, cannot report yourself' };
            return;
        }
        ctx.body = { success: true, report };
    });

    // ======================== FRIENDS ========================

    router.get('/api/friends/:publicKey', async (ctx) => {
        const pubkey = ctx.params.publicKey;
        ctx.body = getFriends(pubkey);
    });

    router.post('/api/friends/add', async (ctx) => {
        const { ownerPubkey, friendPubkey } = (ctx as any).requestBody || {};
        if (!ownerPubkey || !friendPubkey) {
            ctx.status = 400;
            ctx.body = { error: 'ownerPubkey and friendPubkey are required' };
            return;
        }
        const entry = addFriend(ownerPubkey, friendPubkey);
        if (!entry) {
            ctx.status = 400;
            ctx.body = { error: 'Failed — both must be registered members' };
            return;
        }
        ctx.body = { success: true, friend: entry };
    });

    router.post('/api/friends/remove', async (ctx) => {
        const { ownerPubkey, friendPubkey } = (ctx as any).requestBody || {};
        if (!ownerPubkey || !friendPubkey) {
            ctx.status = 400;
            ctx.body = { error: 'ownerPubkey and friendPubkey are required' };
            return;
        }
        const ok = removeFriend(ownerPubkey, friendPubkey);
        ctx.body = { success: ok };
    });

    router.post('/api/friends/guardian', async (ctx) => {
        const { ownerPubkey, friendPubkey, isGuardian } = (ctx as any).requestBody || {};
        if (!ownerPubkey || !friendPubkey) {
            ctx.status = 400;
            ctx.body = { error: 'ownerPubkey and friendPubkey are required' };
            return;
        }
        const ok = setGuardian(ownerPubkey, friendPubkey, !!isGuardian);
        ctx.body = { success: ok };
    });

    // ======================== MEMBERS LIST ========================

    router.get('/api/members', async (ctx) => {
        const allMembers = getAllMembers();
        ctx.body = allMembers.map(m => ({
            publicKey: m.publicKey,
            callsign: m.callsign,
            joinedAt: m.joinedAt,
        }));
    });

    router.get('/api/admin/reports', async (ctx) => {
        const config = getLocalConfig();

        let password = ctx.query.password as string | undefined;
        const authHeader = ctx.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            password = authHeader.substring(7);
        }

        if (!password || !config.adminHash || !config.salt ||
            !verifyPassword(password, config.adminHash, config.salt)) {
            ctx.status = 401;
            ctx.body = { error: 'Unauthorized' };
            return;
        }
        ctx.body = { reports: getReports() };
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

    // Serve PWA at /app
    router.get('/app', async (ctx) => {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
            ctx.type = 'html';
            ctx.body = fs.createReadStream(indexPath);
        }
    });

    // Mount federation routes
    mountFederationRoutes(router);

    app.use(router.routes());
    app.use(router.allowedMethods());

    // Serve the PWA static files (assets, JS, CSS — but not index.html at root)
    app.use(serve(PUBLIC_DIR, {
        index: false,
        gzip: true,
    }));

    // SPA fallback — return index.html for /app/* routes only
    app.use(async (ctx) => {
        if (ctx.method === 'GET' && ctx.path.startsWith('/app')) {
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
