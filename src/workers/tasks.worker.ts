import { Worker, Job } from 'bullmq';
import { connection, NOTIFICATION_QUEUE, NotificationJobType } from '@/lib/queue';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { orders } from '@/db/schema';
import { decrypt } from '@/lib/encryption';

/**
 * Initialize the persistent worker
 */
export function initTasksWorker() {
    console.log(`[QueueWorker] Initializing persistent worker for: ${NOTIFICATION_QUEUE}`);

    const worker = new Worker(
        NOTIFICATION_QUEUE,
        async (job: Job) => {
            const { name, data } = job as { name: NotificationJobType; data: any };

            console.log(`[QueueWorker] Processing job ${job.id} of type ${name}`);

            switch (name) {
                case NotificationJobType.SEND_WHATSAPP:
                    await handleWhatsApp(data);
                    break;
                case NotificationJobType.SEND_TELEGRAM:
                    await handleTelegram(data);
                    break;
                case NotificationJobType.SEND_PUSH:
                    await handlePush(data);
                    break;
                case NotificationJobType.TRIGGER_N8N:
                    await handleN8n(data);
                    break;
                default:
                    console.warn(`[QueueWorker] Unknown job type: ${job.name}`);
            }
        },
        {
            connection,
            concurrency: 2, // Process 2 jobs at once
        }
    );

    worker.on('completed', (job) => {
        console.log(`[QueueWorker] Job ${job.id} (${job.name}) completed successfully.`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[QueueWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
        // BullMQ will automatically retry based on job options
    });

    return worker;
}

/**
 * Handlers
 */

async function handleWhatsApp(data: { phone: string; message: string }) {
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp");
    await sendWhatsAppMessage(data.phone, data.message, {}); // Add empty options to satisfy 3rd arg
}

async function handleTelegram(data: { message: string; roles: string[] }) {
    const { sendTelegramNotification } = await import("@/lib/telegram");
    await sendTelegramNotification(data.message, data.roles as any);
}

async function handlePush(data: { role: string; payload: any }) {
    const { sendPushToRoleAction } = await import("@/app/admin/push/actions");
    await sendPushToRoleAction(data.role as any, data.payload);
}

async function handleN8n(data: { orderId: number }) {
    const { N8nService } = await import("@/services/n8n.service");

    const order = await db.query.orders.findFirst({
        where: eq(orders.id, data.orderId),
        with: {
            client: true,
            reseller: true,
            items: {
                with: {
                    codes: true,
                    slots: { with: { digitalCode: true } },
                    variant: { with: { product: true } },
                }
            }
        }
    });

    if (!order) return;

    // Prepare items for n8n
    const preparedItems = order.items.map((item: any) => {
        const credentials: { label: string; value: string }[] = [];
        if (item.customData) credentials.push({ label: "ID", value: item.customData });
        (item.codes || []).forEach((c: any) => {
            const dec = decrypt(c.code);
            if (dec) credentials.push({ label: "Code", value: dec });
        });
        (item.slots || []).forEach((s: any) => {
            const parent = s.digitalCode?.code ? decrypt(s.digitalCode.code) : null;
            if (parent) credentials.push({ label: "Accès", value: parent });
            if (s.code) credentials.push({ label: "Pin", value: decrypt(s.code) || "" });
        });

        return {
            name: item.variant?.product?.name || item.name,
            quantity: item.quantity,
            credentials
        };
    });

    await N8nService.notifyOrderPrinted(order as any, preparedItems);
}
