import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { iptvProvisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { UserRole } from "@/lib/constants";

const STAFF_ROLES: string[] = [UserRole.ADMIN, UserRole.TRAITEUR, UserRole.CAISSIER];

export async function GET(req: NextRequest) {
    // Auth check — internal IPTV provisioning status is staff-only (not resellers,
    // who have their own scoped IPTV views).
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!STAFF_ROLES.includes(session.userRole)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orderId = req.nextUrl.searchParams.get("orderId");
    if (!orderId || isNaN(Number(orderId)) || Number(orderId) <= 0) {
        return NextResponse.json({ error: "Valid orderId required" }, { status: 400 });
    }

    const provisions = await db.query.iptvProvisions.findMany({
        where: eq(iptvProvisions.orderId, Number(orderId)),
    });

    return NextResponse.json({
        provisions: provisions.map(p => ({
            id: p.id,
            taskId: p.taskId,
            loadbrainSlug: p.loadbrainSlug,
            status: p.status,
            error: p.error,
            errorCode: p.errorCode,
            completedAt: p.completedAt,
            createdAt: p.createdAt,
        }))
    });
}
