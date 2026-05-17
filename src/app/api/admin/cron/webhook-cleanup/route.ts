import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { webhookDeliveryAttempts, notificationLogs } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * EPIC 1 / Phase G4 — Rétention DLQ webhook.
 *
 * Supprime les rows RESOLVED de plus de 30j (par défaut) et les DEAD
 * de plus de 90j (laisse plus de temps pour le replay manuel admin).
 *
 * À appeler quotidiennement (Vercel Cron, GitHub Action scheduled, n8n).
 * Auth via header `Authorization: Bearer <CRON_SECRET>`.
 */

const RESOLVED_RETENTION_DAYS = 30;
const DEAD_RETENTION_DAYS = 90;
const NOTIFICATION_LOGS_RETENTION_DAYS = 30;

export async function GET(req: Request) {
    try {
        const cronSecret = process.env.CRON_SECRET;
        const authHeader = req.headers.get("authorization");
        const providedSecret = authHeader?.replace("Bearer ", "") || null;

        if (!cronSecret || !providedSecret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const expectedBuffer = Buffer.from(cronSecret);
        const receivedBuffer = Buffer.from(providedSecret);
        if (
            expectedBuffer.length !== receivedBuffer.length ||
            !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
        ) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const now = Date.now();
        const resolvedCutoff = new Date(now - RESOLVED_RETENTION_DAYS * 86_400_000);
        const deadCutoff = new Date(now - DEAD_RETENTION_DAYS * 86_400_000);

        const resolvedDeleted = await db
            .delete(webhookDeliveryAttempts)
            .where(
                and(
                    eq(webhookDeliveryAttempts.status, "RESOLVED"),
                    lt(webhookDeliveryAttempts.updatedAt, resolvedCutoff)
                )
            )
            .returning({ id: webhookDeliveryAttempts.id });

        const deadDeleted = await db
            .delete(webhookDeliveryAttempts)
            .where(
                and(
                    eq(webhookDeliveryAttempts.status, "DEAD"),
                    lt(webhookDeliveryAttempts.updatedAt, deadCutoff)
                )
            )
            .returning({ id: webhookDeliveryAttempts.id });

        // Notification logs >30j
        const notifLogsCutoff = new Date(now - NOTIFICATION_LOGS_RETENTION_DAYS * 86_400_000);
        const notifLogsDeleted = await db
            .delete(notificationLogs)
            .where(lt(notificationLogs.createdAt, notifLogsCutoff))
            .returning({ id: notificationLogs.id });

        return NextResponse.json({
            success: true,
            resolvedDeleted: resolvedDeleted.length,
            deadDeleted: deadDeleted.length,
            notifLogsDeleted: notifLogsDeleted.length,
            cutoffs: {
                resolved: resolvedCutoff.toISOString(),
                dead: deadCutoff.toISOString(),
                notifLogs: notifLogsCutoff.toISOString(),
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        console.error("[CRON-WEBHOOK-CLEANUP]", message);
        return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
}
