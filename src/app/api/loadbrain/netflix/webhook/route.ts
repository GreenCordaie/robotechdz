import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { applyNetflixWebhook } from "@/lib/loadbrain-netflix-mirror";
import { streamingEventBus } from "@/lib/streaming-event-bus";

/**
 * Inbound receiver for signed LoadBrain netflix webhooks
 * (slot.allocated/released/expired, account.updated, code.captured).
 *
 * Security mirrors src/app/api/loadbrain/webhook/route.ts:
 *   - require shared LOADBRAIN_WEBHOOK_SECRET
 *   - HMAC-SHA256 over `${timestamp}.${rawBody}`, header `sha256=<hex>`
 *   - constant-time compare, ±300s replay window
 *   - in-process idempotency by X-LoadBrain-Delivery-Id (globalThis Set)
 *
 * On a valid delivery → applyNetflixWebhook (mirror update + event-bus republish).
 */
export const dynamic = "force-dynamic";

const MAX_CLOCK_SKEW_SECONDS = 300;
const SEEN_CAP = 5_000;

// In-process idempotency cache (P0). Survives HMR / module reload via globalThis.
const g = globalThis as unknown as { __nfWebhookSeen?: Set<string> };
if (!g.__nfWebhookSeen) g.__nfWebhookSeen = new Set<string>();
const seen: Set<string> = g.__nfWebhookSeen;

function safeEqual(a: string, b: string): boolean {
    try {
        const x = Buffer.from(a);
        const y = Buffer.from(b);
        return x.length === y.length && crypto.timingSafeEqual(x, y);
    } catch {
        return false;
    }
}

export async function POST(request: Request) {
    const secret = process.env.LOADBRAIN_WEBHOOK_SECRET;
    if (!secret) {
        return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const raw = await request.text();
    const sig = request.headers.get("x-loadbrain-signature") ?? "";
    const ts = request.headers.get("x-loadbrain-timestamp") ?? "";
    const deliveryId = request.headers.get("x-loadbrain-delivery-id") ?? "";
    if (!sig || !ts) {
        return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > MAX_CLOCK_SKEW_SECONDS) {
        return NextResponse.json({ error: "Timestamp expired" }, { status: 400 });
    }

    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
    if (!safeEqual(sig, expected)) {
        console.error("[netflix-webhook] signature mismatch");
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (deliveryId && seen.has(deliveryId)) {
        return NextResponse.json({ received: true, deduped: true });
    }
    if (deliveryId) {
        seen.add(deliveryId);
        if (seen.size > SEEN_CAP) seen.clear();
    }

    let event: { event?: string; payload?: Record<string, unknown> };
    try {
        event = JSON.parse(raw);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        await applyNetflixWebhook(
            db,
            { event: event.event ?? "", deliveryId, payload: event.payload ?? {} },
            { publish: (slotId, payload) => streamingEventBus.publish(slotId, payload) },
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[netflix-webhook] apply failed:", msg);
        return NextResponse.json({ error: "apply failed" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}
