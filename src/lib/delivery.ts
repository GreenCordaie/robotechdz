import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { db } from "@/db";
import { decrypt } from "@/lib/encryption";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function triggerOrderDelivery(orderId: number) {
    const order = await db.query.orders.findFirst({
        where: (orders, { eq }) => eq(orders.id, orderId),
        with: {
            items: {
                with: {
                    codes: true,
                    slots: {
                        with: {
                            digitalCode: true
                        }
                    }
                }
            }
        }
    });

    if (!order) {
        console.warn(`[WA-DELIVERY] Order #${orderId} not found in DB`);
        return;
    }

    if (order.deliveryMethod !== 'WHATSAPP') {
        console.log(`[WA-DELIVERY] Order #${orderId} skipped: delivery method is ${order.deliveryMethod}`);
        return;
    }

    if (!order.customerPhone) {
        console.warn(`[WA-DELIVERY] Order #${orderId} skipped: no customer phone`);
        return;
    }

    const settings = await db.query.shopSettings.findFirst();
    if (!settings?.whatsappApiUrl) {
        console.warn(`[WA-DELIVERY] WhatsApp API URL missing in settings`);
        return;
    }

    let itemsText = "";

    (order as any).items.forEach((item: any) => {
        const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code)).filter(Boolean);
        const slotCodes = (item.slots || []).map((s: any) => {
            const parentCode = decrypt(s.digitalCode.code);
            const slotPin = s.code ? decrypt(s.code) : null;
            return {
                parentCode,
                slotNumber: s.slotNumber,
                pin: slotPin
            };
        });

        if (standardCodes.length > 0) {
            standardCodes.forEach((code: string) => {
                itemsText += `Produit : ${item.name}\nAccès : *${code}*\n\n`;
            });
        }

        if (slotCodes.length > 0) {
            slotCodes.forEach((slot: any) => {
                itemsText += `Produit : ${item.name}\nAccès : *${slot.parentCode}*\nProfil : ${slot.slotNumber}${slot.pin ? ` | PIN : ${slot.pin}` : ""}\n\n`;
            });
        }
    });

    const fallbackTemplate = `*FLEXBOX DIRECT - Livraison Automatique*\nMerci pour votre confiance {{customer}} !\n\nVoici vos accès :\n{{items}}\n\n_Service client : t.me/FlexboxDirect_`;

    let messageBody = settings.whatsappMessageTemplate || fallbackTemplate;

    // Template Replacements
    messageBody = messageBody.replace(/{{items}}/g, itemsText.trim());
    messageBody = messageBody.replace(/{{orderId}}/g, order.orderNumber);
    messageBody = messageBody.replace(/{{customer}}/g, order.customerPhone || "Client");
    messageBody = messageBody.replace(/{{shopName}}/g, settings.shopName || "FLEXBOX DIRECT");

    try {
        const res = await sendWhatsAppMessage(order.customerPhone, messageBody, {
            whatsappApiUrl: settings.whatsappApiUrl,
            whatsappApiKey: settings.whatsappApiKey || undefined,
            whatsappInstanceName: settings.whatsappInstanceName || undefined
        });

        if (res.success) {
            await db.update(orders)
                .set({ whatsappSentAt: new Date() })
                .where(eq(orders.id, orderId));
        }

        return res;
    } catch (error) {
        console.error("WhatsApp Delivery Failed:", error);
        return { success: false, error };
    }
}
