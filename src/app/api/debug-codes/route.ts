import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { digitalCodes } from "@/db/schema";
import { desc } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
    const secret = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const codes = await db.query.digitalCodes.findMany({
            orderBy: [desc(digitalCodes.createdAt)],
            limit: 20
        });

        return NextResponse.json(codes.map(c => ({
            id: c.id,
            rawCode: decrypt(c.code) || "DECRYPT_FAILED",
            msAccountEmail: c.msAccountEmail,
            msStatus: c.msStatus,
            createdAt: c.createdAt
        })));
    } catch (err: any) {
        return NextResponse.json({ error: err.message });
    }
}
