import { NextResponse } from "next/server";
import { db } from "@/db";
import { digitalCodes } from "@/db/schema";
import { decrypt } from "@/lib/encryption";

export async function GET() {
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
