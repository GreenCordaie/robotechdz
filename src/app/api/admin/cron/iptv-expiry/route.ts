import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { iptvProvisions, digitalCodes } from "@/db/schema";
import { eq, and, sql, lte } from "drizzle-orm";
import { sendTelegramNotification } from "@/lib/telegram";

export async function GET(req: NextRequest) {
    const secret = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Find IPTV digital codes expiring within 3 days
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + 3);

        const expiringCodes = await db.query.digitalCodes.findMany({
            where: and(
                sql`${digitalCodes.expiresAt} IS NOT NULL`,
                lte(digitalCodes.expiresAt, thresholdDate),
                eq(digitalCodes.status, "VENDU"),
            ),
            with: {
                orderItem: {
                    with: {
                        order: { with: { client: true } },
                        variant: { with: { product: true } },
                    }
                }
            },
            limit: 50,
        });

        // Filter only IPTV codes (3+ segments in decrypted code)
        const iptvExpiring = expiringCodes.filter((c: any) => {
            return c.orderItem?.variant?.loadbrainSlug;
        });

        if (iptvExpiring.length > 0) {
            const lines = iptvExpiring.map((c: any) => {
                const product = c.orderItem?.variant?.product?.name || "IPTV";
                const orderNum = c.orderItem?.order?.orderNumber || "?";
                const client = c.orderItem?.order?.client?.nomComplet || "Client";
                const expires = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('fr-FR') : "?";
                return `- ${product} (#${orderNum}) — ${client} — expire le ${expires}`;
            }).join("\n");

            await sendTelegramNotification(
                `⚠️ *IPTV — ${iptvExpiring.length} ligne(s) expirent bientôt*\n\n${lines}`,
                ["ADMIN"]
            );
        }

        return NextResponse.json({
            success: true,
            expiring: iptvExpiring.length,
            checked: expiringCodes.length,
        });
    } catch (err: any) {
        console.error("[IPTV-EXPIRY]", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
