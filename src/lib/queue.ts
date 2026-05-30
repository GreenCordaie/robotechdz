// BullMQ n'est pas compatible avec l'Edge de Cloudflare.
// On exporte uniquement les types et une fonction d'ajout sécurisée.

// Nom de la queue partagé entre le producer et le worker
export const NOTIFICATION_QUEUE = 'notification-tasks';

// Connexion ioredis (Node.js runtime uniquement — local Redis Docker)
// Le worker tourne dans instrumentation.ts (Node, pas Edge)
import IORedis from 'ioredis';
export const connection = new IORedis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    { maxRetriesPerRequest: null, lazyConnect: true }
);

export enum NotificationJobType {
    SEND_PUSH = 'send-push',
    SEND_WHATSAPP = 'send-whatsapp',
    SEND_TELEGRAM = 'send-telegram',
    TRIGGER_N8N = 'trigger-n8n',
    GENERATE_PDF = 'generate-pdf'
}

/**
 * Utility to add a job to the queue
 * Compatible avec l'Edge runtime (no-op ou fallback API)
 */
export async function addNotificationJob(type: NotificationJobType, data: any) {
    console.log(`[Queue] Adding job: ${type} for data:`, data);

    // Si on est sur l'Edge, on traite directement ou on ignore pour l'instant
    // TODO: Intégrer Upstash QStash ici pour un vrai fallback Edge
    if (process.env.NEXT_RUNTIME === 'edge') {
        console.warn(`[Queue] BullMQ not available on Edge. Skipping job: ${type}`);
        return null;
    }

    try {
        const { Queue } = await import('bullmq');

        const queue = new Queue(NOTIFICATION_QUEUE, {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 10_000 }, // 10s, 20s, 40s
                removeOnComplete: { count: 1_000, age: 24 * 60 * 60 }, // keep last 1k or 24h
                removeOnFail: { count: 5_000, age: 7 * 24 * 60 * 60 }, // keep last 5k or 7d
            }
        });

        const job = await queue.add(type, data);
        return job;
    } catch (error) {
        console.error(`[Queue] Failed to add BullMQ job:`, error);
        return null;
    }
}

