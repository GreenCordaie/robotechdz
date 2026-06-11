import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { findActiveSlotByToken } from "@/services/slot-activation-token.service";
import { pollAccount } from "@/workers/streaming-mailbox-watcher.worker";
import { streamingEventBus } from "@/lib/streaming-event-bus";
import { publicIpRateLimited, clientIpFrom } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Customer-triggered "fetch my code NOW".
 *
 * The streaming watcher polls every 30 seconds in HIGH intensity, which
 * is fine for the operator's baseline but slow for a customer staring at
 * the magic-link page waiting for a Netflix login code. This route lets
 * the active session ask for an immediate one-shot poll of its own
 * account — the worker still owns the deduped persistence and the SSE
 * broadcast, so a successful capture pushes the code over the existing
 * stream within seconds.
 *
 * Auth: the activation token IS the credential. Rate-limited by IP and
 * by token (in-process lock) so a flood of clicks can't hammer MS
 * Graph.
 */
const tokenLocks = new Map<string, number>();
const MIN_POLL_INTERVAL_MS = 4_000;

export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ token: string }> },
) {
    const { token } = await ctx.params;

    if (
        await publicIpRateLimited(clientIpFrom(req), {
            bucket: "activer_poll",
            limit: 30,
            windowSec: 60,
        })
    ) {
        return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const resolved = await findActiveSlotByToken(db as any, token);
    if (!resolved) {
        return NextResponse.json(
            { ok: false, error: "invalid_token" },
            { status: 404 },
        );
    }

    const now = Date.now();
    const lastPoll = tokenLocks.get(token) ?? 0;
    if (now - lastPoll < MIN_POLL_INTERVAL_MS) {
        return NextResponse.json({ ok: true, throttled: true });
    }
    tokenLocks.set(token, now);

    // Fire-and-forget — the customer doesn't wait for MS Graph, the SSE
    // stream picks up any captured event in real time.
    void pollAccount(db as any, resolved.account.id, {
        broadcast: (digitalCodeId, slotIds, evt) => {
            for (const slotId of slotIds) {
                streamingEventBus.publish(slotId, evt);
            }
        },
    }).catch((err: unknown) => {
        console.warn("[activer/poll] pollAccount failed:", err instanceof Error ? err.message : err);
    });

    return NextResponse.json({ ok: true, started: true });
}
