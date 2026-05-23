import { createWebhookHandler } from "@loadbrain/sdk-v2";
import {
    processCompletedTask,
    processFailedTask,
} from "@/lib/iptv-webhook-processor";

/**
 * SDK v2 webhook entry point. Lives side-by-side with the legacy
 * /api/loadbrain/webhook (manual HMAC verification). Once v2 is verified in
 * prod, the legacy handler can be retired.
 *
 * Signature verification, replay protection, and timestamp tolerance are
 * delegated to `createWebhookHandler` from the SDK.
 */
const handler = createWebhookHandler({
    secret: process.env.LOADBRAIN_WEBHOOK_SECRET ?? "",
    toleranceSeconds: 300,
    handlers: {
        "provision.task.completed": async (event) => {
            // v2 event shape: { taskId, credentials }. The v1 processor was
            // designed around `orderId` (which is the LoadBrain task id from
            // the caller's perspective). Bridge by mapping taskId → orderId.
            await processCompletedTask({
                orderId: event.data.taskId,
                status: "completed",
                credentials: event.data.credentials,
                completedAt: event.timestamp,
            });
        },
        "provision.task.failed": async (event) => {
            await processFailedTask({
                orderId: event.data.taskId,
                status: "failed",
                error: event.data.error,
                errorCode: event.data.errorCode,
            });
        },
        "giftcards.order.delivered": async (event) => {
            // TODO(sprint U5+): bridge to a giftcards-specific handler once the
            // local schema for gift-card credentials lands. For now we just log.
            console.log(
                "[v2-webhook] giftcards.order.delivered",
                event.data.orderId,
                `${event.data.codes.length} code(s)`,
            );
        },
    },
    onError: (err) => {
        console.error("[v2-webhook] handler error:", err.message);
    },
});

export const POST = handler;
