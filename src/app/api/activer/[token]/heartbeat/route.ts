import { NextRequest } from "next/server";
import { db } from "@/db";
import { touchPageSeen } from "@/services/slot-activation-token.service";
import { publicIpRateLimited, clientIpFrom } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight POST endpoint hit every 60s by the activation page.
 * Updates `last_seen_at` so the mailbox watcher polls the master account
 * at HIGH intensity while the customer is on the page.
 */
export async function POST(
    req: NextRequest,
    ctx: { params: Promise<{ token: string }> }
) {
    const { token } = await ctx.params;
    if (!token) return new Response(null, { status: 400 });
    // Cap the 60s-cadence beacon per IP so it can't be abused to amplify
    // mailbox-polling intensity or hammer the DB. Fail-open.
    if (await publicIpRateLimited(clientIpFrom(req), { bucket: "activer_hb", limit: 120, windowSec: 60 })) {
        return new Response(null, { status: 429 });
    }
    try {
        await touchPageSeen(db as any, token);
    } catch (err: any) {
        console.error("[heartbeat] failed:", err?.message);
        return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 204 });
}
