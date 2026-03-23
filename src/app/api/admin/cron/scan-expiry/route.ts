import { NextResponse } from "next/server";
import { N8nService } from "@/services/n8n.service";
import crypto from "crypto";

export async function GET(req: Request) {
    try {
        // Use dedicated CRON_SECRET from env, passed as Authorization header
        const cronSecret = process.env.CRON_SECRET;
        const authHeader = req.headers ? (req as any).headers?.get?.("authorization") : null;
        const providedSecret = authHeader?.replace("Bearer ", "") || null;

        if (!cronSecret || !providedSecret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const expectedBuffer = Buffer.from(cronSecret);
        const receivedBuffer = Buffer.from(providedSecret);
        if (expectedBuffer.length !== receivedBuffer.length ||
            !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const results = await N8nService.runDailyExpirationScan();
        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        console.error("[CRON-ERROR]", error);
        return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }
}
