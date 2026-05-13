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
}

function validateConfig(input) {
    if (!input || typeof input !== "object") {
        throw new Error("[loadbrain-stub] validateConfig: invalid input");
    }
    return input;
}

module.exports = { LoadBrainClient, validateConfig };
module.exports.LoadBrainClient = LoadBrainClient;
module.exports.validateConfig = validateConfig;
module.exports.default = module.exports;
