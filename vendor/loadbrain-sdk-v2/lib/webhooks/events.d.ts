export type WebhookEventName = "provision.task.created" | "provision.task.completed" | "provision.task.failed" | "provision.task.cancelled" | "giftcards.order.created" | "giftcards.order.delivered" | "giftcards.order.failed" | "giftcards.order.price_changed" | "marketplace.order.created" | "marketplace.order.completed" | "marketplace.order.failed" | "kinguin.order.delivered" | "kinguin.order.failed" | "kinguin.order.refunded";
export interface WebhookEventBase {
    event: WebhookEventName;
    deliveryId: string;
    timestamp: string;
    meta: {
        tenantId: string;
        requestId?: string;
    };
}
export type WebhookEvent = (WebhookEventBase & {
    event: "provision.task.created";
    data: {
        taskId: string;
        orderId: string;
        module: string;
        status: string;
    };
}) | (WebhookEventBase & {
    event: "provision.task.completed";
    data: {
        taskId: string;
        credentials: Record<string, unknown>;
    };
}) | (WebhookEventBase & {
    event: "provision.task.failed";
    data: {
        taskId: string;
        error: string;
        errorCode?: string;
    };
}) | (WebhookEventBase & {
    event: "provision.task.cancelled";
    data: {
        taskId: string;
        cancelledBy?: string;
    };
}) | (WebhookEventBase & {
    event: "giftcards.order.created";
    data: {
        orderId: string;
        sku: string;
        quantity: number;
    };
}) | (WebhookEventBase & {
    event: "giftcards.order.delivered";
    data: {
        orderId: string;
        codes: Array<{
            index: number;
            code: string;
        }>;
    };
}) | (WebhookEventBase & {
    event: "giftcards.order.failed";
    data: {
        orderId: string;
        error: string;
    };
}) | (WebhookEventBase & {
    event: "giftcards.order.price_changed";
    data: {
        orderId: string;
        oldCostCents: number;
        newCostCents: number;
        reason: string;
    };
}) | (WebhookEventBase & {
    event: "marketplace.order.created";
    data: {
        orderId: string;
    };
}) | (WebhookEventBase & {
    event: "marketplace.order.completed";
    data: {
        orderId: string;
    };
}) | (WebhookEventBase & {
    event: "marketplace.order.failed";
    data: {
        orderId: string;
        error: string;
    };
}) | (WebhookEventBase & {
    event: "kinguin.order.delivered";
    data: {
        orderId: string;
        externalOrderId: string;
        kinguinId: number;
        quantity: number;
        codes: Array<{
            index: number;
            code: string;
            codeType: "text" | "image_base64";
            redemptionUrl: string | null;
            pin: string | null;
            expiresAt: string | null;
        }>;
    };
}) | (WebhookEventBase & {
    event: "kinguin.order.failed";
    data: {
        orderId: string;
        externalOrderId: string;
        kinguinId: number;
        quantity: number;
        error: string;
    };
}) | (WebhookEventBase & {
    event: "kinguin.order.refunded";
    data: {
        orderId: string;
        externalOrderId: string;
        kinguinId: number;
        quantity: number;
        reason: string | null;
    };
});
//# sourceMappingURL=events.d.ts.map