import type { WebhookEvent, WebhookEventName } from "./events";
export type EventHandler<E extends WebhookEventName> = (event: Extract<WebhookEvent, {
    event: E;
}>) => Promise<void> | void;
export interface CreateWebhookHandlerOptions {
    secret: string;
    handlers: {
        [K in WebhookEventName]?: EventHandler<K>;
    };
    onError?: (err: Error) => void;
    toleranceSeconds?: number;
    isReplay?: (deliveryId: string) => Promise<boolean> | boolean;
    markSeen?: (deliveryId: string) => Promise<void> | void;
}
export declare function createWebhookHandler(opts: CreateWebhookHandlerOptions): (req: Request) => Promise<Response>;
//# sourceMappingURL=handler.d.ts.map