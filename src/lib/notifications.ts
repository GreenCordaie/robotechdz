import { db } from "@/db";
import { clientPayments, clients, shopSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { N8nService } from "@/services/n8n.service";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

/**
 * Robust notification trigger for debt payments.
 * Tries n8n first, then falls back to direct WAHA API.
 */
export async function triggerDebtPaymentNotification(paymentId: number) {
    console.log(`[NOTIFY] Starting notification for payment #${paymentId}`);

    // 1. Fetch full data
    const payment = await db.query.clientPayments.findFirst({
        where: eq(clientPayments.id, paymentId),
        with: { client: true }
    });

    if (!payment || !payment.client) {
        console.error(`[NOTIFY] Payment or client not found for ID ${paymentId}`);
        return;
    }

    const client = payment.client;
    const customerPhone = client.telephone;

    if (!customerPhone) {
        console.warn(`[NOTIFY] No phone number for client ${client.nomComplet}, skipping.`);
        return;
    }

    // 2. Try n8n (Modern automation route)
    try {
        const n8nResult = await N8nService.triggerEvent("DEBT_PAYMENT_RECORDED", {
            paymentId: payment.id,
            receiptNumber: payment.receiptNumber,
            clientId: client.id,
            customer: client.nomComplet,
            customerPhone: customerPhone,
            amountPaid: payment.montantDzd,
            oldBalance: payment.oldBalanceDzd,
            newBalance: payment.newBalanceDzd,
            date: payment.createdAt || new Date().toISOString()
        });

        if (!n8nResult?.error) {
            console.log(`[NOTIFY] ✅ n8n handled debt notification for payment #${paymentId}`);
            return;
        }
        console.warn(`[NOTIFY] n8n error, falling back to direct WAHA.`);
    } catch (err: any) {
        console.warn(`[NOTIFY] n8n unreachable, falling back to direct WAHA:`, err.message);
    }

    // 3. Fallback: Direct WAHA (Legacy/Emergency route)
    try {
        const settings = await db.query.shopSettings.findFirst();
        const shopName = settings?.shopName || 'ROBOTECHDZ';

        const message = buildDebtPaymentMessage({
            shopName,
            customerName: client.nomComplet,
            amountPaid: String(payment.montantDzd ?? "0"),
            newBalance: String(payment.newBalanceDzd ?? "0"),
            receiptNumber: payment.receiptNumber
        });

        const result = await sendWhatsAppMessage(customerPhone, message, {
            whatsappApiUrl: settings?.whatsappApiUrl ?? undefined,
            whatsappApiKey: settings?.whatsappApiKey ?? undefined,
            whatsappInstanceName: settings?.whatsappInstanceName ?? undefined,
        });

        if (result.success) {
            console.log(`[NOTIFY] ✅ Direct WAHA notification sent to ${customerPhone}`);
        } else {
            console.error(`[NOTIFY] ❌ Direct WAHA failed: ${result.error}`);
        }
    } catch (err: any) {
        console.error(`[NOTIFY] ❌ Direct WAHA error:`, err.message);
    }
}

/**
 * Message Builder for Debt Payments
 */
function buildDebtPaymentMessage(data: {
    shopName: string;
    customerName: string;
    amountPaid: string;
    newBalance: string;
    receiptNumber: string;
}) {
    const sep = "━━━━━━━━━━━━━━━━━━━━";
    const dateStr = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    return [
        sep,
        `🏪 *${data.shopName}*`,
        sep,
        ``,
        `✅ *Reçu de Paiement*`,
        `Bonjour *${data.customerName}*, votre versement a été enregistré.`,
        ``,
        `📊 *Détails du règlement :*`,
        `• Reçu : #${data.receiptNumber}`,
        `• Date : ${dateStr}`,
        `• *Montant versé : ${parseFloat(data.amountPaid).toLocaleString('fr-DZ')} DZD*`,
        ``,
        `💰 *Situation de compte :*`,
        `├ *Reste à payer : ${parseFloat(data.newBalance).toLocaleString('fr-DZ')} DZD*`,
        ``,
        `Merci pour votre confiance ! 🙏`,
        `_${data.shopName}_`
    ].join('\n');
}
