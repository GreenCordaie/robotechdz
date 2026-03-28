import { eventBus, SystemEvent } from "@/lib/events";
import { NotificationJobType, addNotificationJob } from "@/lib/queue";
import { db } from "@/db";

/**
 * Initialize listeners that bridge the internal Event Bus to the persistent Queue.
 * These listeners now simply "enqueue" jobs into BullMQ for persistent processing.
 */
export function initNotificationWorker() {
    const globalAny = globalThis as any;
    if (globalAny.__notificationWorkerInitialized) {
        console.log("[Worker] Notification Bridge already initialized. Skipping.");
        return;
    }
    globalAny.__notificationWorkerInitialized = true;

    const eb = eventBus as any;
    console.log(`[Worker] EventBus-to-Queue Bridge initialized (BusID: ${eb.instanceId})`);

    // 1. Debt Payment Recorded (WhatsApp)
    eventBus.on(SystemEvent.DEBT_PAYMENT_RECORDED, async (data: { paymentId: number; clientId: number }) => {
        try {
            console.log(`[Worker] Handling DEBT_PAYMENT_RECORDED: ${data.paymentId}`);
            const client = await db.query.clients.findFirst({
                where: (table, { eq }) => eq(table.id, data.clientId)
            });

            if (client?.telephone) {
                await addNotificationJob(NotificationJobType.SEND_WHATSAPP, {
                    phone: client.telephone,
                    message: `Paiement enregistré: ${data.paymentId}`
                });
            }
        } catch (error: any) {
            console.error(`[Worker] Failed to handle DEBT_PAYMENT_RECORDED:`, error.message);
        }
    });

    // 2. Stock Low (Telegram or n8n)
    eventBus.on(SystemEvent.STOCK_LOW, async (data: { productId: number; sku: string }) => {
        try {
            console.log(`[Worker] Handling STOCK_LOW for: ${data.sku}`);
            await addNotificationJob(NotificationJobType.TRIGGER_N8N, {
                productId: data.productId,
                type: 'STOCK_ALERT'
            });
        } catch (error: any) {
            console.error(`[Worker] Failed to handle STOCK_LOW:`, error.message);
        }
    });

    // 3. Order Paid (n8n or Telegram)
    eventBus.on(SystemEvent.ORDER_PAID, async (data: { orderId: number; isFullyAuto: boolean }) => {
        try {
            console.log(`[Worker] Handling ORDER_PAID for order: ${data.orderId}`);
            await addNotificationJob(NotificationJobType.TRIGGER_N8N, {
                orderId: data.orderId,
                isFullyAuto: data.isFullyAuto
            });
        } catch (error: any) {
            console.error(`[Worker] Failed to handle ORDER_PAID:`, error.message);
        }
    });

    // 4. Order Delivered (WhatsApp sending of codes)
    eventBus.on(SystemEvent.ORDER_DELIVERED, async (data: { orderId: number }) => {
        try {
            console.log(`[Worker] Handling ORDER_DELIVERED for order: ${data.orderId} (BusID: ${eb.instanceId})`);

            const settings = await db.query.shopSettings.findFirst();
            if (!settings?.whatsappApiUrl || !settings?.whatsappInstanceName) {
                console.warn(`[Worker] WhatsApp settings incomplete. Delivery might fail.`);
            }

            // Enqueue n8n trigger for delivery
            await addNotificationJob(NotificationJobType.TRIGGER_N8N, {
                orderId: data.orderId,
                context: 'DELIVERY'
            });
            console.log(`[Worker] Enqueued n8n trigger for delivery: ${data.orderId}`);
        } catch (error: any) {
            console.error(`[Worker] Failed to handle ORDER_DELIVERED:`, error.message);
        }
    });

    // 5. Order Printed (Archival)
    eventBus.on(SystemEvent.ORDER_PRINTED, async (data: { orderId: number }) => {
        try {
            console.log(`[Worker] Handling ORDER_PRINTED for: ${data.orderId}`);
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
            console.log(`[Worker] Handling TICKET_PRINTED for: ${data.orderId}`);
            await addNotificationJob(NotificationJobType.TRIGGER_N8N, {
                orderId: data.orderId
            });
        } catch (error: any) {
            console.error(`[Worker] Failed to handle TICKET_PRINTED:`, error.message);
        }
    });
}
