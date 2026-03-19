import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, digitalCodes, orderItems, shopSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { sendTelegramNotification } from "@/lib/telegram";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        // console.log("Full Webhook Body:", JSON.stringify(body, null, 2));

        // 0. Secret Token Validation
        const expectedToken = process.env.TELEGRAM_SECRET_TOKEN || "flexbox_secure_token_2026";
        const receivedToken = req.headers.get("x-telegram-bot-api-secret-token");

        if (receivedToken !== expectedToken) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        // 1. Basic structure validation
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

        // 5. Map codes to order items sequentially
        let codeIndex = 0;
        let insertedCount = 0;

        try {
            await db.transaction(async (tx) => {
                for (const item of (order as any).items) {
                    const needed = item.quantity;
                    const forThisItem = codesFound.slice(codeIndex, codeIndex + needed);

                    for (const code of forThisItem) {
                        await tx.insert(digitalCodes).values({
                            variantId: item.variantId,
                            orderItemId: item.id,
                            code: code,
                            status: "VENDU"
                        });
                        insertedCount++;
                    }
                    codeIndex += needed;
                }

                if (insertedCount > 0) {
                    // Update status to LIVRE
                    await tx.update(orders)
                        .set({ status: "LIVRE" })
                        .where(eq(orders.id, order.id));
                } else {
                    throw new Error("No codes mapped");
                }
            });
        } catch (txErr) {
            console.error("DB Error:", (txErr as Error).message);
            return NextResponse.json({ ok: true });
        }

        if (insertedCount > 0) {
            await sendTelegramNotification(`✅ ${insertedCount} codes enregistrés pour ${orderNumber}.\n🚀 Impression automatique lancée.`);

            // --- TRIGGER WHATSAPP DELIVERY ---
            if (order.deliveryMethod === 'WHATSAPP' && order.customerPhone) {
                const settings = await db.query.shopSettings.findFirst();
                if (settings?.whatsappApiUrl && settings?.whatsappApiKey && settings?.whatsappInstanceName) {
                    // Fetch fresh data with codes for the message
                    const finalOrder = await db.query.orders.findFirst({
                        where: (o, { eq }) => eq(o.id, order.id),
                        with: {
                            items: {
                                with: {
                                    codes: true,
                                    slots: { with: { digitalCode: true } }
                                }
                            }
                        }
                    });

                    if (finalOrder) {
                        const { formatOrderItemsText } = await import("@/lib/delivery");
                        const itemsText = formatOrderItemsText((finalOrder as any).items);

                        let messageBody = `🎉 *LIVRAISON COMMANDE #${finalOrder.orderNumber}*\n\nVoici vos accès :\n${itemsText}\n\n_Merci pour votre confiance !_`;

                        await sendWhatsAppMessage(order.customerPhone, messageBody, {
                            whatsappApiUrl: settings.whatsappApiUrl,
                            whatsappApiKey: settings.whatsappApiKey,
                            whatsappInstanceName: settings.whatsappInstanceName
                        });
                    }
                }
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("WEBHOOK ERROR:", error);
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
