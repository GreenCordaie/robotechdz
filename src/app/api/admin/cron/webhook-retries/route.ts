import { NextResponse } from "next/server";
import crypto from "crypto";
import { processWebhookRetries, getDlqStats } from "@/services/webhook-retry.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * EPIC 1 / Phase G3 — Webhook DLQ retry tick.
 *
 * À appeler toutes les minutes par un cron externe (Vercel Cron, n8n, GitHub Actions).
 * Auth via header `Authorization: Bearer <CRON_SECRET>`.
 *
 * Pioche jusqu'à 25 deliveries RETRYING dont nextAttemptAt <= now et
 * tente la livraison. Backoff 1m / 5m / 30m / 2h / 6h. Au-delà → DEAD.
 *
 * EPIC 1 / Phase G5 — Alerte Telegram si DEAD > seuil (cooldown 1h
 * pour éviter le spam quand le cron tourne toutes les minutes).
 */

const DEAD_ALERT_THRESHOLD = 10;
const ALERT_COOLDOWN_MS = 3600_000; // 1h
let lastAlertSentAt = 0;

async function maybeAlertDeadDlq() {
    try {
        const stats = await getDlqStats();
        if (stats.dead < DEAD_ALERT_THRESHOLD) return;

        const now = Date.now();
        if (now - lastAlertSentAt < ALERT_COOLDOWN_MS) return;
        lastAlertSentAt = now;

        const { sendTelegramNotification } = await import("@/lib/telegram");
        await sendTelegramNotification(
            `⚠️ *Webhook DLQ alert*\n\n` +
            `${stats.dead} livraisons en état DEAD (seuil ${DEAD_ALERT_THRESHOLD}).\n` +
            `Retrying : ${stats.retrying} · Resolved : ${stats.resolved}\n\n` +
            `Vérifier /admin/b2b/webhooks/dlq pour replay ou dismiss.`,
            ['ADMIN']
        );
    } catch (err) {
        console.warn("[CRON-WEBHOOK-RETRIES] alert failed (non-bloquant):", err);
    }
}

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

        const results = await processWebhookRetries(25);

        // Check DEAD threshold + alert if needed (cooldown protected, non-blocking)
        await maybeAlertDeadDlq();

        return NextResponse.json({ success: true, ...results });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        console.error("[CRON-WEBHOOK-RETRIES]", message);
        return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
}
