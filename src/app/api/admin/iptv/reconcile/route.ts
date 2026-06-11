import { NextResponse, type NextRequest } from "next/server";
import { reconcilePendingIptvOrders } from "@/services/iptv-reseller-reconciler.service";
import { getAuthenticatedUser } from "@/lib/security";
import { UserRole } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authorize(req: NextRequest) {
    const headerSecret = req.headers.get("x-cron-secret");
    const envSecret = process.env.CRON_SECRET ?? process.env.RECONCILER_SECRET ?? null;
    if (envSecret && headerSecret && headerSecret === envSecret) {
        return { ok: true as const };
    }
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false as const, status: 401, msg: "unauthorized" };
    if (user.role !== UserRole.ADMIN) return { ok: false as const, status: 403, msg: "forbidden" };
    return { ok: true as const };
}

async function handler(req: NextRequest): Promise<NextResponse> {
    const auth = await authorize(req);
    if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });
    try {
        const result = await reconcilePendingIptvOrders({ limit: 100 });
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[iptv-reconcile] failed:", err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    return handler(req);
}
export async function GET(req: NextRequest): Promise<NextResponse> {
    return handler(req);
}
