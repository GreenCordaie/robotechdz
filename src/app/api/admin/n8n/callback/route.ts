import { NextResponse } from "next/server";
import { OrderService } from "@/services/order.service";
import { db } from "@/db";
import { AccountService } from "@/services/account.service";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { event, orderId, data, secret } = body;

        // Simple security check using Telegram Bot Token as a shared secret
        const settings = await db.query.shopSettings.findFirst();
        if (!settings || secret !== settings.telegramBotToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (event === "ATTRIBUER_SLOT") {
            if (data?.codes) {
                await OrderService.deliverManualCodes(orderId, data.codes);
                return NextResponse.json({ success: true, message: "Codes attribués" });
            }
        }

        if (event === "SYNC_NOTION_ACCOUNT") {
            if (data?.accounts && Array.isArray(data.accounts)) {
                const results = [];
                for (const account of data.accounts) {
                    try {
                        const res = await AccountService.addSharedAccountInternal({
                            variantId: account.variantId,
                            email: account.email,
                            password: account.password,
                            expiresAt: account.expiresAt,
                            slotsCount: account.slotsCount,
                            slotsConfig: account.slotsConfig
                        });
                        results.push({ email: account.email, success: true, ...res });
                    } catch (err: any) {
                        results.push({ email: account.email, success: false, error: err.message });
                    }
                }
                return NextResponse.json({ success: true, message: "Sync terminé", results });
            }
        }

        return NextResponse.json({ error: "Événement inconnu" }, { status: 400 });
    } catch (error: any) {
        console.error("[N8N-CALLBACK-ERROR]", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
