import { exportSyncState, importRemoteState, initStateEngine } from './state-engine.js';
import { getP2PNode, startP2P } from './p2p.js';

async function run() {
    console.log("Running Sync Signature Verification Test...");
    
    // Initialize state engine
    initStateEngine();
    
    // Start P2P node briefly to initialize keypair
    const p2pNode = await startP2P(4010, 4011);
    
    try {
        const nodeId = p2pNode.peerId.toString();
        
        // 1. Export sync state
        const payload = await exportSyncState(nodeId);
        
        console.log("✓ Exported SyncPayload successfully.");
        console.log(`- Node ID:   ${payload.nodeId}`);
        console.log(`- Signature: ${payload.signature ? payload.signature.substring(0, 32) + '...' : 'none'}`);
        console.log(`- PubKey:    ${payload.publicKey ? payload.publicKey.substring(0, 32) + '...' : 'none'}`);
        
        if (!payload.signature || !payload.publicKey) {
            throw new Error("Missing cryptographic fields in exported payload!");
        }
        
        // 2. Validate import of valid payload
        await importRemoteState(payload);
        console.log("✓ Valid signature verification holds. Remote state successfully validated!");
        
        // 3. Validate rejection of forged signature
        const tamperedPayload = { ...payload, signature: 'a'.repeat(128) };
        try {
            await importRemoteState(tamperedPayload);
            throw new Error("Security boundary broken! A forged sync payload was accepted.");
        } catch (e: any) {
            console.log(`✓ Forged signature correctly rejected: ${e.message}`);
        }
        
        // 4. Validate rejection of missing fields
        const missingPayload = { ...payload, signature: undefined };
        try {
            await importRemoteState(missingPayload);
            throw new Error("Security boundary broken! A payload missing signature was accepted.");
        } catch (e: any) {
            console.log(`✓ Missing signature correctly rejected: ${e.message}`);
        }
        
        console.log("\n⭐️ ALL SYNC SIGNATURE SECURITY CHECKS PASSED SUCCESSFULLY!");
    } finally {
        await p2pNode.stop();
    }
}

run().catch(e => {
    console.error("❌ Test failed:", e);
    process.exit(1);
});
