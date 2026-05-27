import "server-only";
import { db } from "@/db";
import { resellerWebhooks, webhookDeliveryAttempts } from "@/db/schema";
import { and, eq, inArray, lte, sql } from "drizzle-orm";

/** Lease window: keep claimed rows out of a concurrent tick while we process them. */
const RETRY_LEASE_MS = 2 * 60_000;
import {
    attemptDelivery,
    MAX_DELIVERY_ATTEMPTS,
    RETRY_BACKOFF_MS,
    type ResellerEventPayload,
} from "./webhook-dispatcher.service";

/**
 * Pioche jusqu'à `limit` rows RETRYING dont nextAttemptAt <= now et
 * tente de les redélivrer. Met à jour attempts/status/nextAttemptAt.
 *
 * Retourne {processed, succeeded, failed, dead} pour observabilité.
 *
 * Best-effort : exception pendant un row → on continue avec les autres.
 */
export async function processWebhookRetries(
    limit = 25
): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    dead: number;
}> {
    const now = new Date();

    // Claim the due rows atomically: SELECT ... FOR UPDATE SKIP LOCKED so two
    // concurrent cron ticks never grab the same row, then lease them (push
    // nextAttemptAt forward) so they stay claimed while we deliver outside the
    // lock. A crash mid-batch simply re-leases after the window expires.
    const due = await db.transaction(async (tx) => {
        const rows = await tx
            .select()
            .from(webhookDeliveryAttempts)
            .where(
                and(
                    eq(webhookDeliveryAttempts.status, "RETRYING"),
                    lte(webhookDeliveryAttempts.nextAttemptAt, now)
                )
            )
            .limit(limit)
            .for("update", { skipLocked: true });

        if (rows.length > 0) {
            await tx
                .update(webhookDeliveryAttempts)
                .set({ nextAttemptAt: new Date(Date.now() + RETRY_LEASE_MS) })
                .where(inArray(webhookDeliveryAttempts.id, rows.map((r) => r.id)));
        }
        return rows;
    });

    let succeeded = 0;
    let failed = 0;
    let dead = 0;

    for (const row of due) {
        try {
            const hook = await db.query.resellerWebhooks.findFirst({
                where: eq(resellerWebhooks.id, row.webhookId),
            });

            // Si le webhook a été supprimé ou désactivé entre-temps : on marque DEAD
            // (pas la peine de spam un endpoint que l'admin a coupé).
            if (!hook || !hook.isActive) {
                await db
                    .update(webhookDeliveryAttempts)
                    .set({
                        status: "DEAD",
                        lastError: hook ? "Webhook désactivé" : "Webhook supprimé",
                        updatedAt: new Date(),
                    })
                    .where(eq(webhookDeliveryAttempts.id, row.id));
                dead++;
                continue;
            }

            const body = JSON.stringify(row.payload as unknown as ResellerEventPayload);
            const result = await attemptDelivery(hook, body, row.event);

            const nextAttemptNumber = row.attempts + 1;

            if (result.ok) {
                await db
                    .update(webhookDeliveryAttempts)
                    .set({
                        status: "RESOLVED",
                        attempts: nextAttemptNumber,
                        nextAttemptAt: null,
                        lastError: null,
                        lastStatusCode: result.statusCode,
                        updatedAt: new Date(),
                    })
                    .where(eq(webhookDeliveryAttempts.id, row.id));
                succeeded++;
            } else if (nextAttemptNumber >= MAX_DELIVERY_ATTEMPTS) {
                await db
                    .update(webhookDeliveryAttempts)
                    .set({
                        status: "DEAD",
                        attempts: nextAttemptNumber,
                        nextAttemptAt: null,
                        lastError: result.errorMessage,
                        lastStatusCode: result.statusCode,
                        updatedAt: new Date(),
                    })
                    .where(eq(webhookDeliveryAttempts.id, row.id));
                dead++;
            } else {
                const backoff = RETRY_BACKOFF_MS[nextAttemptNumber] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
                await db
                    .update(webhookDeliveryAttempts)
                    .set({
                        attempts: nextAttemptNumber,
                        nextAttemptAt: new Date(Date.now() + backoff),
                        lastError: result.errorMessage,
                        lastStatusCode: result.statusCode,
                        updatedAt: new Date(),
                    })
                    .where(eq(webhookDeliveryAttempts.id, row.id));
                failed++;
            }
        } catch (err) {
            console.warn(`[webhook-retry] error on row ${row.id}:`, err);
            failed++;
        }
    }

    return { processed: due.length, succeeded, failed, dead };
}

/**
 * Replay manuel admin : remet une row DEAD en RETRYING avec
 * attempts=0 + nextAttemptAt=now (sera repris au prochain cron tick).
 *
 * Le caller doit avoir vérifié les permissions admin.
 */
export async function replayDeadAttempt(attemptId: number): Promise<{ success: boolean; error?: string }> {
    const row = await db.query.webhookDeliveryAttempts.findFirst({
        where: eq(webhookDeliveryAttempts.id, attemptId),
    });
    if (!row) return { success: false, error: "Attempt introuvable" };
    if (row.status !== "DEAD") return { success: false, error: "Attempt n'est pas en DEAD" };

    await db
        .update(webhookDeliveryAttempts)
        .set({
            status: "RETRYING",
            attempts: 0,
            nextAttemptAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
        })
        .where(eq(webhookDeliveryAttempts.id, attemptId));

    return { success: true };
}

/**
 * Stats DLQ pour le KPI admin.
 */
export async function getDlqStats(): Promise<{
    retrying: number;
    dead: number;
    resolved: number;
}> {
    const rows = await db
        .select({
            status: webhookDeliveryAttempts.status,
            count: sql<number>`count(*)::int`,
        })
        .from(webhookDeliveryAttempts)
        .groupBy(webhookDeliveryAttempts.status);

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = r.count;

    return {
        retrying: byStatus.RETRYING ?? 0,
        dead: byStatus.DEAD ?? 0,
        resolved: byStatus.RESOLVED ?? 0,
    };
}
