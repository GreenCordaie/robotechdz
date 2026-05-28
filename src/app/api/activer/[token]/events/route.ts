import { NextRequest } from "next/server";
import { db } from "@/db";
import { and, eq, isNull, or } from "drizzle-orm";
import {
    findActiveSlotByToken,
    touchPageSeen,
} from "@/services/slot-activation-token.service";
import { slotEvents } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { streamingEventBus } from "@/lib/streaming-event-bus";
import { publicIpRateLimited, clientIpFrom } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_STREAM_MS = 15 * 60 * 1000;

/**
 * Public SSE stream — pushes OTP / household events for a single slot.
 * Token in the URL is the sole credential. Auto-closes after 15 minutes
 * (client reconnects).
 */
export async function GET(
    req: NextRequest,
    ctx: { params: Promise<{ token: string }> }
) {
    const { token } = await ctx.params;
    // Rate-limit before the DB lookup so a flood of garbage tokens can't turn
    // this unauthenticated route into a cheap DB-load amplifier. Fail-open.
    if (await publicIpRateLimited(clientIpFrom(req), { bucket: "activer_sse", limit: 60, windowSec: 60 })) {
        return new Response("Too many requests", { status: 429 });
    }
    const resolved = await findActiveSlotByToken(db as any, token);
    if (!resolved) {
        return new Response("invalid or expired token", { status: 404 });
    }
    await touchPageSeen(db as any, token);

    const slotId = resolved.slot.id;
    const digitalCodeId = resolved.account.id;

    const encoder = new TextEncoder();
    let unsub: (() => void) | null = null;
    let closed = false;
    let timeout: NodeJS.Timeout | null = null;

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: any) => {
                if (closed) return;
                try {
                    controller.enqueue(
                        encoder.encode(`event: ${event}\ndata: ${JSON.stringify({ event, data })}\n\n`)
                    );
                } catch {
                    /* stream gone */
                }
            };

            send("connected", { slotId, ts: new Date().toISOString() });

            // Replay any undelivered events for this slot (or unrouted OTPs for the account)
            try {
                const pending = await db.query.slotEvents.findMany({
                    where: and(
                        eq(slotEvents.deliveredToSession, false),
                        or(
                            eq(slotEvents.slotId, slotId),
                            and(
                                eq(slotEvents.digitalCodeId, digitalCodeId),
                                isNull(slotEvents.slotId)
                            )
                        )
                    ),
                });
                for (const evt of pending) {
                    const value = decrypt(evt.valueEncrypted);
                    if (!value) continue;
                    // Atomically CLAIM the event before sending it. The guarded
                    // UPDATE (deliveredToSession=false) lets only ONE concurrent
                    // SSE connection win each row, so two tabs / two slots of the
                    // same account can't both deliver the same OTP/household
                    // event (exactly-once delivery).
                    const claimed = await db
                        .update(slotEvents)
                        .set({ deliveredToSession: true, deliveredAt: new Date(), slotId })
                        .where(and(eq(slotEvents.id, evt.id), eq(slotEvents.deliveredToSession, false)))
                        .returning({ id: slotEvents.id });
                    if (claimed.length === 0) continue; // another connection won
                    send("slot_event", {
                        type: evt.eventType,
                        value,
                        timestamp: (evt.receivedAt ?? new Date()).toISOString(),
                    });
                }
            } catch (err: any) {
                console.error("[SSE replay] failed:", err?.message);
            }

            // Subscribe to live events
            unsub = streamingEventBus.subscribe(slotId, (payload) => {
                send("slot_event", payload);
            });

            // Heartbeat ping every 25s (keeps proxies happy)
            const heartbeat = setInterval(() => send("ping", { ts: Date.now() }), 25_000);

            const cleanup = () => {
                if (closed) return;
                closed = true;
                clearInterval(heartbeat);
                if (timeout) clearTimeout(timeout);
                unsub?.();
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            };

            req.signal.addEventListener("abort", cleanup);
            timeout = setTimeout(cleanup, MAX_STREAM_MS);
        },
        cancel() {
            closed = true;
            unsub?.();
            if (timeout) clearTimeout(timeout);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
