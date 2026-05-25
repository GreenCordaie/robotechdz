import { NextRequest } from "next/server";
import { db } from "@/db";
import { touchPageSeen } from "@/services/slot-activation-token.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight POST endpoint hit every 60s by the activation page.
 * Updates `last_seen_at` so the mailbox watcher polls the master account
 * at HIGH intensity while the customer is on the page.
 */
export async function POST(
    _req: NextRequest,
    ctx: { params: Promise<{ token: string }> }
) {
    const { token } = await ctx.params;
    if (!token) return new Response(null, { status: 400 });
    try {
        await touchPageSeen(db as any, token);
    } catch (err: any) {
        console.error("[heartbeat] failed:", err?.message);
        return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 204 });
}
