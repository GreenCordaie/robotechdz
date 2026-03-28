import { eventBus, SystemEvent } from "@/lib/events";
import { addNotificationJob, NotificationJobType } from "@/lib/queue";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { clients, clientPayments } from "@/db/schema";
import { UserRole } from "@/lib/constants";

/**
 * Register all notification listeners
 * These listeners now simply "enqueue" jobs into BullMQ for persistent processing.
 */
export function initNotificationWorker() {
    console.log("[Worker] EventBus-to-Queue Bridge initialized.");

    // 1. Debt Payment Recorded (WhatsApp)
    eventBus.on(SystemEvent.DEBT_PAYMENT_RECORDED, async (data: { paymentId: number }) => {
        try {
            console.log(`[Worker] Enqueuing payment notification job for ID: ${data.paymentId}`);

            const payment = await db.query.clientPayments.findFirst({
                where: eq(clientPayments.id, data.paymentId)
            });

            if (!payment) return;

            const client = await db.query.clients.findFirst({
                where: eq(clients.id, payment.clientId)
            });

            if (!client || !client.telephone) return;

            const settings = await db.query.shopSettings.findFirst();

            const message = buildDebtPaymentMessage({
                shopName: settings?.shopName || "FLEXBOX DIRECT",
                customerName: client.nomComplet,
                amountPaid: String(payment.montantDzd ?? "0"),
                newBalance: String(payment.newBalanceDzd ?? "0"),
                receiptNumber: payment.receiptNumber || `R-${payment.id}`
            });

            await addNotificationJob(NotificationJobType.SEND_WHATSAPP, {
                phone: client.telephone,
                message: message
            });

        } catch (error: any) {
            console.error(`[Worker] Failed to enqueue debt payment job:`, error.message);
        }
    });

    // 2. Kiosk Order Created (Initial alert)
    eventBus.on(SystemEvent.ORDER_CREATED, async (data: {
        orderId: number;
        orderNumber: string;
        totalAmount: number;
        items: { name: string; quantity: number }[]
    }) => {
        try {
            const itemsMsg = data.items.map(i => `• ${i.name} (x${i.quantity})`).join("\n");
            const msg = `📦 *Nouvelle Commande : ${data.orderNumber}*\n💰 *Total* : ${data.totalAmount.toLocaleString()} DZD\n🛒 *Articles* :\n${itemsMsg}`;

            await addNotificationJob(NotificationJobType.SEND_TELEGRAM, {
                message: msg,
                roles: ['ADMIN', 'CAISSIER']
            });

            await addNotificationJob(NotificationJobType.SEND_PUSH, {
                role: "CAISSIER",
                payload: {
                    title: "💎 Nouveau client (Kiosque)",
                    body: `Commande ${data.orderNumber} en attente de paiement (${data.totalAmount.toLocaleString()} DZD)`,
                    url: "/admin/caisse"
                }
            });
        } catch (error: any) {
            console.error(`[Worker] Failed to enqueue order created job:`, error.message);
        }
    });

    // 3. Order Paid (Traiteur Push + Internal N8n)
    eventBus.on(SystemEvent.ORDER_PAID, async (data: { orderId: number, isFullyAuto: boolean }) => {
        try {
            console.log(`[Worker] Handling ORDER_PAID for: ${data.orderId}`);

            // Enqueue n8n Job for Internal Logging / CRM
            await addNotificationJob(NotificationJobType.TRIGGER_N8N, {
                orderId: data.orderId
            });

            // If NOT fully auto, notify Traiteur to prepare physical/manual items
            if (!data.isFullyAuto) {
                await addNotificationJob(NotificationJobType.SEND_PUSH, {
                    role: UserRole.TRAITEUR,
                    payload: {
                        title: "🔔 Nouvelle Commande Payée",
                        body: `Commande #${data.orderId} payée. À préparer !`,
                        url: "/admin/traitement"
                    }
                });
            }
        } catch (error: any) {
            console.error(`[Worker] Failed to handle ORDER_PAID:`, error.message);
        }
    });

    // 4. Order Delivered (WhatsApp sending of codes)
    eventBus.on(SystemEvent.ORDER_DELIVERED, async (data: { orderId: number }) => {
        try {
            console.log(`[Worker] Enqueuing delivery job for order: ${data.orderId}`);
            // Logic for building the codes/receipt message is inside the delivery tool/worker
            // For now, we trigger the n8n automation specifically for delivery if needed, 
            // or use our internal delivery helper.

            // For DDD alignment, we'll use n8n for the heavy lifting of WhatsApp templates
            await addNotificationJob(NotificationJobType.TRIGGER_N8N, {
                orderId: data.orderId,
                context: 'DELIVERY'
            });
        } catch (error: any) {
            console.error(`[Worker] Failed to handle ORDER_DELIVERED:`, error.message);
        }
    });

    // 5. Order Printed (Archival)
    eventBus.on(SystemEvent.ORDER_PRINTED, async (data: { orderId: number }) => {
        try {
            await addNotificationJob(NotificationJobType.TRIGGER_N8N, {
                orderId: data.orderId,
                context: 'ARCHIVAL'
            });
        } catch (error: any) {
            console.error(`[Worker] Failed to handle ORDER_PRINTED:`, error.message);
        }
    });

    // Legacy support (Ticket Printed)
    eventBus.on(SystemEvent.TICKET_PRINTED, async (data: { orderId: number }) => {
        try {
            await addNotificationJob(NotificationJobType.TRIGGER_N8N, {
                orderId: data.orderId
            });
        } catch (error: any) {
            console.error(`[Worker] Failed to handle TICKET_PRINTED:`, error.message);
        }
    });
}

/**
 * Message Builder for Debt
 */
function buildDebtPaymentMessage(data: {
    shopName: string;
    customerName: string;
    amountPaid: string;
    newBalance: string;
    receiptNumber: string;
}) {
    return [
        `✅ *Reçu de Versement - ${data.shopName}*`,
        ``,
        `Bonjour *${data.customerName}*,`,
        `Nous confirmons la réception de votre versement.`,
        ``,
        `📝 *Détails du paiement :*`,
        `├ *Reçu :* #${data.receiptNumber}`,
        `├ *Montant versé : ${parseFloat(data.amountPaid).toLocaleString('fr-DZ')} DZD*`,
        ``,
        `💰 *Situation de compte :*`,
        `├ *Reste à payer : ${parseFloat(data.newBalance).toLocaleString('fr-DZ')} DZD*`,
        ``,
        `Merci pour votre confiance !`,
        `_Ce message est envoyé automatiquement._`
    ].join('\n');
}
