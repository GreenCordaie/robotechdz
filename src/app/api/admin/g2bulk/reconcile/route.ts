import { NextResponse, type NextRequest } from "next/server";
import { reconcilePendingG2BulkOrders } from "@/services/g2bulk-reconciler.service";
import { getAuthenticatedUser } from "@/lib/security";
import { UserRole } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authorize(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
    const headerSecret = req.headers.get("x-cron-secret");
    const envSecret = process.env.CRON_SECRET ?? process.env.RECONCILER_SECRET ?? null;
    if (envSecret && headerSecret && headerSecret === envSecret) return { ok: true };
    const user = await getAuthenticatedUser();
    if (!user) return { ok: false, status: 401, msg: "unauthorized" };
    if (user.role !== UserRole.ADMIN) return { ok: false, status: 403, msg: "forbidden" };
    return { ok: true };
}

async function handler(req: NextRequest): Promise<NextResponse> {
    const auth = await authorize(req);
    if (!auth.ok) {
        return NextResponse.json({ error: auth.msg }, { status: auth.status });
    }
    try {
        const result = await reconcilePendingG2BulkOrders({ limit: 100 });
        return NextResponse.json({ success: true, data: result });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[g2bulk-reconcile] failed:", err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    return handler(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    return handler(req);
}
