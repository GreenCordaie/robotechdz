/**
 * DEV-ONLY endpoint to force a single pollAccount tick on a digital_code
 * id. Bypasses the runOnePass queue (which can stall on stale accounts).
 *
 * Auth: NONE — gated by NODE_ENV !== "production". This file MUST be deleted
 * or auth-gated before any deployment.
 */
import { NextResponse } from "next/server";
import { db } from "@/db";
import { pollAccount } from "@/workers/streaming-mailbox-watcher.worker";
import { streamingEventBus } from "@/lib/streaming-event-bus";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "dev only" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const accountId = parseInt(id, 10);
    if (!Number.isFinite(accountId)) {
        return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const t0 = Date.now();
    try {
        const res = await pollAccount(db as any, accountId, {
            broadcast: (digitalCodeId, slotIds, evt) => {
                for (const slotId of slotIds) {
                    streamingEventBus.publish(slotId, evt);
                }
                console.log(`[dev-poll] broadcast slot=${slotIds.join(",")} event=`, evt);
            },
        });
        return NextResponse.json({
            ok: true,
            accountId,
            tookMs: Date.now() - t0,
            polled: res.polled,
            eventsCreated: res.eventsCreated,
            dispatched: res.dispatched,
        });
    } catch (err: any) {
        return NextResponse.json({
            ok: false,
            accountId,
            tookMs: Date.now() - t0,
            error: err?.message || "unknown",
        }, { status: 500 });
    }
}
