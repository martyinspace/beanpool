/**
 * Federation API — Cross-Community Protocol
 *
 * Provides endpoints for inter-node communication:
 * - GET /api/node/info — Node metadata + peer list (for PWA node discovery)
 * - POST /api/federation/verify-member — Check if pubkey is a local member
 *
 * Also exports the dynamic CORS middleware that whitelists peer connector origins.
 */

import type Koa from 'koa';
import type Router from '@koa/router';
import { getPeerOrigins, getConnectorsByLevel } from './connector-manager.js';
import { getMembers, getPosts, getBalance } from './state-engine.js';
import { getLocalConfig } from './local-config.js';

/**
 * Dynamic CORS middleware for federation.
 * Checks the request Origin against the list of peer connector publicUrls.
 * Only whitelists peer nodes — blocked nodes get no CORS headers.
 */
export function federationCors(): Koa.Middleware {
    return async (ctx, next) => {
        const origin = ctx.get('Origin');

        if (origin) {
            const allowedOrigins = getPeerOrigins();
            if (allowedOrigins.some(o => origin.startsWith(o) || o.startsWith(origin))) {
                ctx.set('Access-Control-Allow-Origin', origin);
                ctx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
                ctx.set('Access-Control-Allow-Credentials', 'true');
            }
        }

        // Handle preflight
        if (ctx.method === 'OPTIONS') {
            ctx.status = 200;
            ctx.body = '';
            return;
        }

        await next();
    };
}

/**
 * Mount federation routes on the router.
 */
export function mountFederationRoutes(router: Router): void {
    // Node info — public metadata for federation discovery
    router.get('/api/node/info', async (ctx) => {
        const config = getLocalConfig();
        const members = getMembers();
        const posts = getPosts({});
        const peers = getConnectorsByLevel('peer')
            .filter(c => c.connected && c.mutualTrust)
            .map(c => ({
                callsign: c.callsign || c.address,
                publicUrl: c.publicUrl || null,
            }));

        ctx.body = {
            name: config.communityName || 'BeanPool Node',
            memberCount: members.length,
            postCount: posts.filter((p: any) => p.active).length,
            peerNodes: peers,
        };
    });

    // Verify member — used by remote nodes before accepting visitor trades
    router.post('/api/federation/verify-member', async (ctx) => {
        const { publicKey } = (ctx as any).requestBody || {};
        if (!publicKey) {
            ctx.status = 400;
            ctx.body = { error: 'publicKey is required' };
            return;
        }

        const members = getMembers();
        const member = members.find(m => m.publicKey === publicKey);

        if (!member) {
            ctx.body = { isMember: false };
            return;
        }

        // Get balance info for the member
        const balance = getBalance(publicKey);

        ctx.body = {
            isMember: true,
            callsign: member.callsign,
            homeBalance: balance?.balance ?? 0,
        };
    });
}
