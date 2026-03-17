import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { db } from "@/db";
import { decrypt } from "@/lib/encryption";

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

    if (!order || order.deliveryMethod !== 'WHATSAPP' || !order.customerPhone) {
        return;
    }

    const settings = await db.query.shopSettings.findFirst();
    if (!settings?.whatsappToken || !settings?.whatsappPhoneId) {
        return;
    }

    let messageBody = `🎉 Merci pour votre achat !\nVoici votre commande ${order.orderNumber} :\n\n`;

    (order as any).items.forEach((item: any) => {
        const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code));
        const slotCodes = (item.slots || []).map((s: any) => {
            const [email, pass] = decrypt(s.digitalCode.code).split(' | ');
            const base = `Compte: ${email} | Pass: ${pass} | Profil: ${s.profileName || `Profil ${s.slotNumber}`}`;
            return s.code ? `${base} | PIN: ${decrypt(s.code)}` : base;
        });
        const allCodes = [...standardCodes, ...slotCodes];

        if (allCodes.length > 0) {
            messageBody += `🛒 *${item.name}* :\n`;
            if (item.customData) messageBody += `🆔 ID/LIEN: *${item.customData}*\n`;
            if (item.playerNickname) messageBody += `👤 Pseudo: *${item.playerNickname}*\n`;

            allCodes.forEach(c => {
                messageBody += `\`${c}\`\n`;
            });
            messageBody += `\n`;
        }
    });


    try {
        await sendWhatsAppMessage(order.customerPhone, messageBody, {
            whatsappToken: settings.whatsappToken,
            whatsappPhoneId: settings.whatsappPhoneId
        });
        return { success: true };
    } catch (error) {
        console.error("WhatsApp Delivery Failed:", error);
        return { success: false, error };
    }
}
