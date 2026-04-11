import { eventBus, SystemEvent } from "@/lib/events";
import { NotificationJobType, addNotificationJob } from "@/lib/queue";

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

    // 1. Debt Payment Recorded (WhatsApp via n8n → fallback direct WAHA)
    eventBus.on(SystemEvent.DEBT_PAYMENT_RECORDED, async (data: { paymentId: number }) => {
        try {
            console.log(`[Worker] Handling DEBT_PAYMENT_RECORDED: ${data.paymentId}`);
            const { triggerDebtPaymentNotification } = await import("@/lib/notifications");
            await triggerDebtPaymentNotification(data.paymentId);
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

    // 3. Order Paid (n8n notification — direct)
    eventBus.on(SystemEvent.ORDER_PAID, async (data: { orderId: number; isFullyAuto: boolean }) => {
        try {
            console.log(`[Worker] Handling ORDER_PAID for order: ${data.orderId}`);
            const { N8nService } = await import("@/services/n8n.service");
            const { db } = await import("@/db");
            const { eq } = await import("drizzle-orm");
            const { orders } = await import("@/db/schema");
            const { decrypt } = await import("@/lib/encryption");
            const order = await db.query.orders.findFirst({
                where: eq(orders.id, data.orderId),
                with: { client: true, items: { with: { codes: true, slots: { with: { digitalCode: true } }, variant: { with: { product: true } } } } }
            });
            if (order) {
                const items = (order as any).items.map((item: any) => {
                    const credentials: any[] = [];
                    (item.codes || []).forEach((c: any) => { const d = decrypt(c.code); if (d) credentials.push({ label: "Code", value: d }); });
                    (item.slots || []).forEach((s: any) => { const p = s.digitalCode?.code ? decrypt(s.digitalCode.code) : null; if (p) credentials.push({ label: "Accès", value: p }); });
                    return { name: item.variant?.product?.name || 'Produit', quantity: item.quantity, credentials };
                });
                await N8nService.notifyOrderEvent("ORDER_PRINTED", order as any, items);

                // Push notification to admin/caissier
                const { sendPushToRoleAction } = await import("@/app/admin/push/actions");
                const amount = parseFloat((order as any).totalAmount || '0').toLocaleString('fr-DZ');
                sendPushToRoleAction('ADMIN', {
                    title: `Commande ${(order as any).orderNumber}`,
                    body: `${amount} DZD — ${items.length} article(s)`,
                    url: '/admin/caisse',
                }).catch(() => {});
                sendPushToRoleAction('CAISSIER', {
                    title: `Nouvelle commande ${(order as any).orderNumber}`,
                    body: `${amount} DZD — ${items.length} article(s)`,
                    url: '/admin/caisse',
                }).catch(() => {});
            }
        } catch (error: any) {
            console.error(`[Worker] Failed to handle ORDER_PAID:`, error.message);
        }
    });

    // 4. Order Delivered (WhatsApp sending of codes — direct, no queue)
    eventBus.on(SystemEvent.ORDER_DELIVERED, async (data: { orderId: number }) => {
        try {
            console.log(`[Worker] Handling ORDER_DELIVERED for order: ${data.orderId} — direct delivery`);
            const { triggerOrderDelivery } = await import("@/lib/delivery");
            const result = await triggerOrderDelivery(data.orderId);
            console.log(`[Worker] ORDER_DELIVERED #${data.orderId}: ${result.success ? 'OK' : result.error || 'skipped'}`);
        } catch (error: any) {
            console.error(`[Worker] Failed to handle ORDER_DELIVERED:`, error.message);
        }
    });

    // 5. Order Printed / Archived (n8n notification — direct)
    eventBus.on(SystemEvent.ORDER_PRINTED, async (data: { orderId: number }) => {
        try {
            console.log(`[Worker] Handling ORDER_PRINTED for: ${data.orderId}`);
            const { N8nService } = await import("@/services/n8n.service");
            const { db } = await import("@/db");
            const { eq } = await import("drizzle-orm");
            const { orders } = await import("@/db/schema");
            const order = await db.query.orders.findFirst({ where: eq(orders.id, data.orderId), with: { client: true } });
            if (order) await N8nService.notifyOrderArchival(order as any);
        } catch (error: any) {
            console.error(`[Worker] Failed to handle ORDER_PRINTED:`, error.message);
        }
    });

    // Legacy support (Ticket Printed)
    eventBus.on(SystemEvent.TICKET_PRINTED, async (data: { orderId: number }) => {
        try {
            console.log(`[Worker] Handling TICKET_PRINTED for: ${data.orderId}`);
            const { N8nService } = await import("@/services/n8n.service");
            const { db } = await import("@/db");
            const { eq } = await import("drizzle-orm");
            const { orders } = await import("@/db/schema");
            const order = await db.query.orders.findFirst({ where: eq(orders.id, data.orderId), with: { client: true } });
            if (order) await N8nService.notifyOrderArchival(order as any);
        } catch (error: any) {
            console.error(`[Worker] Failed to handle TICKET_PRINTED:`, error.message);
        }
    });
}
