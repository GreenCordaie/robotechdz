import { NextResponse } from "next/server";
import crypto from "crypto";
import { processWebhookRetries } from "@/services/webhook-retry.service";

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
 */
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
        return NextResponse.json({ success: true, ...results });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur interne";
        console.error("[CRON-WEBHOOK-RETRIES]", message);
        return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
}
