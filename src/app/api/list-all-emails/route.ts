import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { digitalCodes } from "@/db/schema";
import { decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
    const secret = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const codes = await db.query.digitalCodes.findMany({
            columns: { code: true }
        });
        const emails = codes.map(c => (decrypt(c.code) || "DECRYPT_FAILED").split('|')[0].trim());
        return NextResponse.json({ count: emails.length, emails });
    } catch (err: any) {
        return NextResponse.json({ error: err.message });
    }
}
