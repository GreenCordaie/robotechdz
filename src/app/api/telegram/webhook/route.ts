import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, digitalCodes, orderItems, shopSettings, webhookEvents } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { sendTelegramNotification } from "@/lib/telegram";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import crypto from "crypto";
import { OrderService } from "@/services/order.service";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        // console.log("Full Webhook Body:", JSON.stringify(body, null, 2));
        const { verifyWebhookSignature, isEventProcessed } = await import("@/lib/webhook-security");

        // 0. Signature Validation
        const isValid = await verifyWebhookSignature(req.headers, "telegram");
        if (!isValid) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        // 0.5. Idempotence Check (Deduplication)
        const updateId = body.update_id?.toString();
        if (updateId) {
            const alreadyProcessed = await isEventProcessed("telegram", updateId);
            if (alreadyProcessed) {
                return NextResponse.json({ ok: true });
            }
        }

        // 1. Handle Callback Query (Buttons)
        if (body.callback_query) {
            const { N8nService } = await import("@/services/n8n.service");
            await N8nService.triggerEvent("TELEGRAM_CALLBACK", {
                callback_data: body.callback_query.data,
                from: body.callback_query.from,
                message: body.callback_query.message,
            });
            return NextResponse.json({ ok: true });
        }

        // 2. Basic structure validation (Messages)
        if (!body.message || !body.message.reply_to_message) {
            return NextResponse.json({ ok: true });
        }

        const replyTo = body.message.reply_to_message;
        const currentMessage = body.message.text || "";
        const parentMessage = replyTo.text || "";

        // 2. Extract Order Number from parent message (e.g., #C123)
        const orderMatch = parentMessage.match(/#(C\d+)/i);
        if (!orderMatch) {
            return NextResponse.json({ ok: true });
        }

        const orderNumber = orderMatch[0].toUpperCase();

        // 3. Find Order in DB
        const order = await db.query.orders.findFirst({
            where: (o, { sql }) => sql`upper(${o.orderNumber}) = ${orderNumber}`,
            with: {
                items: true
            }
        });

        if (!order) {
            return NextResponse.json({ ok: true });
        }

        // 4. Extract codes more flexibly
        // We split by lines then clean up each line
        const lines = currentMessage.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        let potentialCodes: string[] = [];

        for (const line of lines) {
            // Remove common prefixes like "code " or "code: "
            const cleanedLine = line.replace(/^(code\s*[:\s-]*)/i, "").trim();
            if (cleanedLine) {
                potentialCodes.push(cleanedLine);
            }
        }

        // Fallback: if no lines were split properly, split by spaces
        if (potentialCodes.length === 0) {
            potentialCodes = currentMessage.match(/\S+/g) || [];
        }

        // Filter out order number if present
        const codesFound = potentialCodes.filter(c => !c.toUpperCase().includes(orderNumber));

        if (codesFound.length === 0) {
            return NextResponse.json({ ok: true });
        }

        // 5. Delegate delivery to Service Layer
        try {
            const { insertedCount } = await OrderService.deliverManualCodes(order.id, codesFound);

            if (insertedCount > 0) {
                await sendTelegramNotification(`✅ ${insertedCount} codes enregistrés pour ${orderNumber}.\n🚀 Livraison automatique lancée.`);
            }
        } catch (err) {
            console.error("OrderService.deliverManualCodes failed:", (err as Error).message);
            return NextResponse.json({ ok: true }); // Acknowledge message anyway to avoid Telegram retries
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("WEBHOOK ERROR:", error);
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
