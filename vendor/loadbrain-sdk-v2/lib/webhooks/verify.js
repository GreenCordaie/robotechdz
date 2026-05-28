"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhook = verifyWebhook;
const node_crypto_1 = require("node:crypto");
const errors_1 = require("./errors");
function verifyWebhook(opts) {
    const header = (name) => {
        const v = opts.headers[name.toLowerCase()] ?? opts.headers[name];
        return Array.isArray(v) ? v[0] : v;
    };
    const sig = header("x-loadbrain-signature")?.replace(/^sha256=/, "");
    const tsStr = header("x-loadbrain-timestamp");
    if (!sig || !tsStr)
        throw new errors_1.WebhookSignatureInvalid("Missing signature headers");
    const ts = Number(tsStr);
    if (!Number.isFinite(ts))
        throw new errors_1.WebhookSignatureInvalid("Invalid timestamp");
    const ageSec = Math.floor(Date.now() / 1000) - ts;
    const tolerance = opts.toleranceSeconds ?? 300;
    if (Math.abs(ageSec) > tolerance) {
        throw new errors_1.WebhookTimestampExpired(`Webhook age ${ageSec}s exceeds tolerance ${tolerance}s`);
    }
    const expected = (0, node_crypto_1.createHmac)("sha256", opts.secret)
        .update(`${ts}.${opts.rawBody}`)
        .digest("hex");
    let sigBuf;
    let expectedBuf;
    try {
        sigBuf = Buffer.from(sig, "hex");
        expectedBuf = Buffer.from(expected, "hex");
    }
    catch {
        throw new errors_1.WebhookSignatureInvalid("Signature is not valid hex");
    }
    if (sigBuf.length !== expectedBuf.length || !(0, node_crypto_1.timingSafeEqual)(sigBuf, expectedBuf)) {
        throw new errors_1.WebhookSignatureInvalid("Signature mismatch");
    }
    let envelope;
    try {
        envelope = JSON.parse(opts.rawBody);
    }
    catch {
        throw new errors_1.WebhookSignatureInvalid("Body is not valid JSON");
    }
    return envelope;
}
//# sourceMappingURL=verify.js.map