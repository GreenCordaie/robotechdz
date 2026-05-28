import "server-only";
import crypto from "crypto";
import { db } from "@/db";
import { resellerWebhooks, webhookDeliveryAttempts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { isBlockedWebhookUrl } from "@/lib/webhook-url-guard";

/**
 * Service d'envoi de webhooks sortants aux resellers.
 *
 * Format requête :
 *   POST {url}
 *   Headers :
 *     Content-Type: application/json
 *     X-Robotech-Event: order.paid
 *     X-Robotech-Delivery: <uuid-like>
 *     X-Robotech-Signature: sha256=<hex hmac of body using secret>
 *     X-Robotech-Timestamp: <unix-ms>
 *   Body : JSON event payload
 *
 * Garanties :
 *   - Fire-and-forget (le caller ne doit JAMAIS attendre, exceptions catch)
 *   - Timeout 10s par delivery
 *   - Stats persistées (lastFiredAt, lastStatusCode, deliveriesOk/Failed)
 *   - Retry exp backoff via DLQ table — voir webhook-retry.service.ts
 */

export type ResellerEventName =
    | "order.paid"
    | "credentials.ready"
    | "wallet.recharged";

export interface ResellerEventPayload {
    event: ResellerEventName;
    timestamp: string; // ISO 8601
    resellerId: number;
    data: Record<string, unknown>;
}

const DELIVERY_TIMEOUT_MS = 10_000;

// Backoff schedule (ms from now) for attempts 1..5.
// First retry +60s, last +6h. After attempt 5 → status DEAD.
export const RETRY_BACKOFF_MS = [
    60_000,        // 1m
    5 * 60_000,    // 5m
    30 * 60_000,   // 30m
    2 * 3600_000,  // 2h
    6 * 3600_000,  // 6h
];
export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MS.length;

function computeSignature(body: string, secret: string): string {
    return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function generateDeliveryId(): string {
    // Format simple : ts-randomhex (lisible dans les logs reseller)
    return Date.now().toString(36) + "-" + crypto.randomBytes(6).toString("hex");
}

/**
 * Dispatch un event à tous les webhooks actifs d'un reseller qui ont
 * l'event dans leur liste `events` (CSV).
 *
 * Best-effort : exceptions caught, stats updated, never throw.
 */
export async function dispatchResellerEvent(
    resellerId: number,
    event: ResellerEventName,
    data: Record<string, unknown>
): Promise<void> {
    try {
        const hooks = await db
            .select()
            .from(resellerWebhooks)
            .where(
                and(
                    eq(resellerWebhooks.resellerId, resellerId),
                    eq(resellerWebhooks.isActive, true)
                )
            );

        const matching = hooks.filter((h) =>
            h.events.split(",").map((s) => s.trim()).includes(event)
        );
        if (matching.length === 0) return;

        const payload: ResellerEventPayload = {
            event,
            timestamp: new Date().toISOString(),
            resellerId,
            data,
        };

        await Promise.all(
            matching.map((hook) => deliverOne(hook, payload, event))
        );
    } catch (err) {
        console.warn("[webhook-dispatcher] error (non-bloquant):", err);
    }
}

/**
 * Tentative de livraison HTTP unitaire. Met à jour les stats du webhook.
 * Retourne {ok, statusCode, errorMessage} pour que le caller décide
 * s'il faut enqueuer un retry DLQ.
 */
export async function attemptDelivery(
    hook: typeof resellerWebhooks.$inferSelect,
    body: string,
    event: string
): Promise<{ ok: boolean; statusCode: number | null; errorMessage: string | null }> {
    // Defense-in-depth SSRF : revalide l'URL à l'envoi (une row insérée hors
    // createMyWebhookAction ne doit pas contourner le garde). Jamais de fetch sur cible bloquée.
    if (isBlockedWebhookUrl(hook.url)) {
        return { ok: false, statusCode: null, errorMessage: "URL bloquée (SSRF guard)" };
    }

    const deliveryId = generateDeliveryId();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    let statusCode: number | null = null;
    let errorMessage: string | null = null;

    try {
        const res = await fetch(hook.url, {
            method: "POST",
            // Pas de suivi de redirection : empêche un bypass SSRF par 30x public → interne.
            redirect: "error",
            headers: {
                "Content-Type": "application/json",
                "X-Robotech-Event": event,
                "X-Robotech-Delivery": deliveryId,
                "X-Robotech-Signature": computeSignature(body, hook.secret),
                "X-Robotech-Timestamp": Date.now().toString(),
            },
            body,
            signal: controller.signal,
        });
        statusCode = res.status;
        if (!res.ok) {
            errorMessage = `HTTP ${res.status}`;
        }
    } catch (err) {
        errorMessage = err instanceof Error ? err.message : "Network error";
    } finally {
        clearTimeout(timer);
    }

    const ok = statusCode !== null && statusCode >= 200 && statusCode < 300;
    try {
        await db
            .update(resellerWebhooks)
            .set({
                lastFiredAt: new Date(),
                lastStatusCode: statusCode ?? null,
                lastError: errorMessage,
                deliveriesOk: ok
                    ? sql`${resellerWebhooks.deliveriesOk} + 1`
                    : resellerWebhooks.deliveriesOk,
                deliveriesFailed: !ok
                    ? sql`${resellerWebhooks.deliveriesFailed} + 1`
                    : resellerWebhooks.deliveriesFailed,
            })
            .where(eq(resellerWebhooks.id, hook.id));
    } catch (err) {
        console.warn("[webhook-dispatcher] stats update failed:", err);
    }

    return { ok, statusCode, errorMessage };
}

async function deliverOne(
    hook: typeof resellerWebhooks.$inferSelect,
    payload: ResellerEventPayload,
    event: ResellerEventName
): Promise<void> {
    const body = JSON.stringify(payload);
    const result = await attemptDelivery(hook, body, event);
    if (result.ok) return;

    // Enqueue retry attempt — never throw.
    try {
        await db.insert(webhookDeliveryAttempts).values({
            webhookId: hook.id,
            event,
            payload: payload as unknown as Record<string, unknown>,
            attempts: 1,
            nextAttemptAt: new Date(Date.now() + RETRY_BACKOFF_MS[0]),
            status: "RETRYING",
            lastError: result.errorMessage,
            lastStatusCode: result.statusCode,
        });
    } catch (err) {
        console.warn("[webhook-dispatcher] DLQ enqueue failed:", err);
    }
}
