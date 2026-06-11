"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebhookHandler = createWebhookHandler;
const verify_1 = require("./verify");
const errors_1 = require("./errors");
function createWebhookHandler(opts) {
    return async function POST(req) {
        const rawBody = await req.text();
        const headers = {};
        req.headers.forEach((v, k) => {
            headers[k] = v;
        });
        try {
            const event = (0, verify_1.verifyWebhook)({
                headers,
                rawBody,
                secret: opts.secret,
                toleranceSeconds: opts.toleranceSeconds,
            });
            if (opts.isReplay && (await opts.isReplay(event.deliveryId))) {
                throw new errors_1.WebhookReplayDetected(`Delivery ${event.deliveryId} already processed`);
            }
            const handler = opts.handlers[event.event];
            if (handler) {
                await handler(event);
            }
            if (opts.markSeen)
                await opts.markSeen(event.deliveryId);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }
        catch (err) {
            const error = err;
            opts.onError?.(error);
            const status = error instanceof errors_1.WebhookSignatureInvalid
                ? 422
                : error instanceof errors_1.WebhookTimestampExpired
                    ? 422
                    : error instanceof errors_1.WebhookReplayDetected
                        ? 200 // replay returns 200 to stop retries
                        : 500;
            const replayed = error instanceof errors_1.WebhookReplayDetected;
            return new Response(JSON.stringify({ ok: replayed, error: error.message }), {
                status,
                headers: { "Content-Type": "application/json" },
            });
        }
    };
}
//# sourceMappingURL=handler.js.map