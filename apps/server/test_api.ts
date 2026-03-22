import { initStateEngine, getPosts, getMembers, getCommunityInfo, getNodeConfig, getConnectors } from './src/state-engine.ts';

try {
    initStateEngine();
    console.log("DB Init Success");

    console.log("Testing getCommunityInfo...");
    getCommunityInfo();

    console.log("Testing getMembers...");
    getMembers();

    console.log("Testing getPosts...");
    getPosts({});

    console.log("Testing getConnectors...");
    getConnectors();

    console.log("Testing getNodeConfig...");
    getNodeConfig();

    console.log("✅ All functions passed without throwing!");
} catch (e: any) {
    console.error("❌ CRASH:", e.message);
    console.error(e.stack);
}
