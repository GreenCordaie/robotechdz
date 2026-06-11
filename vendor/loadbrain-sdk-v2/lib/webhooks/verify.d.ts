import type { WebhookEvent } from "./events";
export interface VerifyOptions {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    secret: string;
    toleranceSeconds?: number;
}
export declare function verifyWebhook(opts: VerifyOptions): WebhookEvent;
//# sourceMappingURL=verify.d.ts.map