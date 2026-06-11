import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { digitalCodeSlots } from "@/db/schema";
import { findActiveSlotByToken } from "@/services/slot-activation-token.service";
import { pollAccount } from "@/workers/streaming-mailbox-watcher.worker";
import { streamingEventBus } from "@/lib/streaming-event-bus";
import { publicIpRateLimited, clientIpFrom } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Customer-facing "Voir mon code" click.
 *
 * Stamps `digital_code_slots.last_code_request_at = NOW()`. The
 * streaming watcher's `routeEvent` will prefer the slot whose click is
 * most recent (within a 60s window) when dispatching the next OTP — so
 * N customers waiting on profiles of the same master Outlook map
 * unambiguously to the right slot, even though the Netflix email body
 * carries no profile name. Falls back to the page-view heuristic if no
 * recent click is recorded.
 *
 * Also kicks an immediate one-shot mailbox poll so the customer doesn't
 * wait for the 8s loop tick.
 */
export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ token: string }> },
) {
    const { token } = await ctx.params;

    if (
        await publicIpRateLimited(clientIpFrom(req), {
            bucket: "activer_request_code",
            limit: 30,
            windowSec: 60,
        })
    ) {
        return NextResponse.json(
            { ok: false, error: "rate_limited" },
            { status: 429 },
        );
    }

    const resolved = await findActiveSlotByToken(db as any, token);
    if (!resolved) {
        return NextResponse.json(
            { ok: false, error: "invalid_token" },
            { status: 404 },
        );
    }

    const stampedAt = new Date();
    await db
        .update(digitalCodeSlots)
        .set({ lastCodeRequestAt: stampedAt })
        .where(eq(digitalCodeSlots.id, resolved.slot.id));

    // Fire-and-forget poll — the SSE stream picks up any captured event.
    void pollAccount(db as any, resolved.account.id, {
        broadcast: (_digitalCodeId, slotIds, evt) => {
            for (const slotId of slotIds) {
                streamingEventBus.publish(slotId, evt);
            }
        },
    }).catch((err: unknown) => {
        console.warn(
            "[activer/request-code] pollAccount failed:",
            err instanceof Error ? err.message : err,
        );
    });

    return NextResponse.json({
        ok: true,
        slotId: resolved.slot.id,
        requestedAt: stampedAt.toISOString(),
    });
}
