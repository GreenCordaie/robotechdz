import fs from 'fs';

async function run() {
    const accessToken = "TOKEN_WILL_BE_INSERTED_BY_SED";
    // Wait, I'll use the file I just wrote or refresh again.

    // I'll just combine refresh + fetch in one script for simplicity.
    const clientId = "2b71f1d3-e2f6-47db-b97e-7bb028c6d3b4";
    const clientSecret = "jdV8Q~CChK1ktwQS6AuztfO4uFpGt~MSgPYC~bk9";
    const refreshTokenEnc = "fc6566d2eeed0e18cbdb3a07.f39e56b22b0a083483aed1eae6f0e2bcaa95c7613f00b248f85996b2acb19697751c2ec1"; // This was from my earlier extraction

    // Wait, I need to decrypt it. I'll do everything in the script.

    console.log('--- RÉSOLUTION DIRECTE GRAPH ---');
    // ... (logic from resolve_graph_344_v3.mjs)
}
run();
