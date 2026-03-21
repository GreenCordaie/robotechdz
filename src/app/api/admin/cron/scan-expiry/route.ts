import { NextResponse } from "next/server";
import { N8nService } from "@/services/n8n.service";
import { db } from "@/db";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const secret = searchParams.get("secret");

        // Verify secret matches Telegram Bot Token for basic security
        const settings = await db.query.shopSettings.findFirst();
        if (!settings || secret !== settings.telegramBotToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        console.log("[CRON] Starting Expiration Scan...");
        const results = await N8nService.runDailyExpirationScan();

        return NextResponse.json({
            success: true,
            message: "Scan terminé",
            results
        });
    } catch (error: any) {
        console.error("[CRON-ERROR]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
