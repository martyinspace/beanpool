/**
 * BeanPool Node — Entry Point
 *
 * Boots the sovereign local gateway:
 * 1. Genesis check (first-run community_id + genesis block)
 * 2. Admin password init (from ADMIN_PASSWORD env or auto-generate)
 * 3. TLS certificates (Let's Encrypt or self-signed)
 * 4. DNS shim for beanpool.local resolution
 * 5. Trust Bootstrap (HTTP :80 — redirect or CA cert)
 * 6. PWA + Settings host (HTTPS :443)
 * 7. libp2p P2P transport (TCP :4001, WS :4002)
 * 8. Connector manager (dial trusted peers)
 * 9. Cert renewal scheduler
 */

import { ensureGenesis } from './genesis.js';
import { initAdminPassword } from './local-config.js';
import { initTls, startRenewalScheduler } from './tls.js';
import { startDnsShim } from './dns-shim.js';
import { startHttpServer } from './http-server.js';
import { startHttpsServer } from './https-server.js';
import { startP2P } from './p2p.js';
import { initConnectorManager, connectAll } from './connector-manager.js';
import { registerHandshakeHandler } from './handshake.js';
import { initStateEngine, migrateAdminConversations } from './state-engine.js';

const PORT_HTTP = Number(process.env.PORT_HTTP ?? 8080);
const PORT_HTTPS = Number(process.env.PORT_HTTPS ?? 8443);
const PORT_P2P = Number(process.env.PORT_P2P ?? 4001);
const PORT_P2P_WS = PORT_P2P + 1; // 4002

async function main() {
    console.log('\n🫘  BeanPool Node starting...\n');

    // Step 1: Ensure genesis state exists
    const genesis = await ensureGenesis();
    console.log(`✅ Community: ${genesis.communityId}`);
    console.log(`   Genesis hash: ${genesis.genesisHash}\n`);

    // Step 2: Admin password (first boot: env var or auto-generate)
    initAdminPassword();

    // Step 2.5: Initialize state engine (ledger, members, marketplace)
    initStateEngine();
    migrateAdminConversations();

    // Step 3: TLS certificates (LE or self-signed)
    await initTls();

    // Step 4: DNS shim for .local resolution
    startDnsShim();

    // Step 5: HTTP server (Trust Bootstrap or redirect)
    await startHttpServer(PORT_HTTP);

    // Step 6: HTTPS server (PWA + Settings API)
    await startHttpsServer(PORT_HTTPS);

    // Step 7: libp2p (persistent identity, no auto-discovery)
    const p2pNode = await startP2P(PORT_P2P, PORT_P2P_WS);

    // Step 8: Connector manager + Handshake protocol
    initConnectorManager(p2pNode);
    registerHandshakeHandler(p2pNode);
    connectAll().catch((e) => console.warn('[Connectors] Initial connect failed:', e));

    // Step 9: Start cert renewal scheduler (checks every 24h)
    startRenewalScheduler();

    const hostname = process.env.CF_RECORD_NAME ?? 'beanpool.local';
    const isLE = !!process.env.CF_RECORD_NAME;
    console.log('\n🟢 BeanPool Node is live.\n');
    console.log(`   PWA:      https://${hostname}${isLE ? '' : ':' + PORT_HTTPS}`);
    console.log(`   Settings: https://${hostname}${isLE ? '' : ':' + PORT_HTTPS}/settings`);
    console.log(`   P2P:      TCP :${PORT_P2P} / WS :${PORT_P2P_WS}`);
    console.log('');
}

main().catch((err) => {
    console.error('❌ BeanPool Node failed to start:', err);
    process.exit(1);
});
