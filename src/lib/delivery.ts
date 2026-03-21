import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { N8nService } from "@/services/n8n.service";
import { decrypt } from "@/lib/encryption";

export function formatOrderItemsText(items: any[]) {
    let itemsText = "";
    items.forEach((item: any) => {
        const standardCodes = (item.codes || []).map((c: any) => {
            if (typeof c === 'string') return c;
            try { return decrypt(c.code); } catch { return null; }
        }).filter(Boolean);

        const slotCodes = (item.slots || []).map((s: any) => {
            try {
                const parentCode = decrypt(s.digitalCode.code);
                const slotPin = s.code ? decrypt(s.code) : null;
                return {
                    parentCode,
                    slotNumber: s.slotNumber,
                    pin: slotPin
                };
            } catch { return null; }
        }).filter(Boolean);

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
    return itemsText.trim();
}

export async function triggerOrderDelivery(orderId: number) {
    const order = await db.query.orders.findFirst({
        where: (orders, { eq }) => eq(orders.id, orderId),
        with: {
            client: true,
            reseller: true,
            items: {
                with: {
                    codes: true,
                    slots: { with: { digitalCode: true } }
                }
            }
        }
    });

    if (!order) {
        console.warn(`[DELIVERY] Order #${orderId} not found`);
        return;
    }

    // Delegate to n8n: n8n will handle formatting and sending (WhatsApp, Email, etc.)
    const formattedText = formatOrderItemsText((order as any).items);
    await N8nService.triggerEvent('CUSTOMER_DELIVERY', {
        orderId: (order as any).id,
        orderNumber: (order as any).orderNumber,
        customerPhone: (order as any).customerPhone || (order as any).client?.telephone || (order as any).reseller?.telephone,
        deliveryMethod: (order as any).deliveryMethod,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://idea-lake-samuel-dog.trycloudflare.com',
        items: (order as any).items,
        formattedItemsText: formattedText
    });

    // Mark as triggered locally if needed, or wait for webhook callback from n8n
}
