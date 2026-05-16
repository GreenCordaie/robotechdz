"use strict";

// CI-only stub. Not used at runtime in prod — src/lib/loadbrain.ts gates
// all calls behind isLoadBrainEnabled() which is false if LOADBRAIN_API_KEY
// is empty (the case in CI). This stub exists only to satisfy the static
// import resolution.

class LoadBrainClient {
    constructor(_config) {
        this._config = _config;
    }
    async listProducts() {
        return { products: [] };
    }
    async provisionProduct(_slug, _opts) {
        return { taskId: "stub-task", status: "queued" };
    }
    async getTask(_id) {
        return { task: { id: _id, status: "queued" } };
    }
    async retryTask(_id) {
        return { taskId: _id, status: "queued" };
    }
    async cancelOrder(_orderNumber) {
        return { success: true };
    }
    async resendWebhook(_taskId) {
        return { success: true };
    }
    async getCredentialsByOrder(_orderNumber) {
        return null;
    }
    async renewSubscription(_taskId) {
        return { success: true, taskId: "stub-renew", status: "queued" };
    }
}

function validateConfig(input) {
    if (!input || typeof input !== "object") {
        throw new Error("[loadbrain-stub] validateConfig: invalid input");
    }
    return input;
}

// Stub pour le proxy Next.js. En CI on retourne juste des 404 — le code
// n'appelle de toute façon pas ces handlers (no test E2E sur /api/loadbrain/*).
function createNextRouteHandler(_config) {
    const handler = async () => {
        return new Response(JSON.stringify({ error: "LoadBrain stub — no-op in CI" }), {
            status: 503,
            headers: { "content-type": "application/json" },
        });
    };
    return { GET: handler, POST: handler, DELETE: handler, PUT: handler, PATCH: handler };
}

module.exports = { LoadBrainClient, validateConfig, createNextRouteHandler };
module.exports.LoadBrainClient = LoadBrainClient;
module.exports.validateConfig = validateConfig;
module.exports.createNextRouteHandler = createNextRouteHandler;
module.exports.default = module.exports;
