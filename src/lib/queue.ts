import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const NOTIFICATION_QUEUE = 'notification-tasks';

/**
 * BullMQ Connection Configuration
 * Prefers REDIS_URL from .env
 */
export const connection = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: null,
    });

/**
 * Unified Queue Instance (Singleton pattern with globalThis for HMR)
 */
const globalAny = globalThis as any;

export const notificationQueue: Queue = globalAny.notificationQueue ||
    new Queue(NOTIFICATION_QUEUE, {
        connection,
        defaultJobOptions: {
            attempts: 5,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
            removeOnComplete: true,
            removeOnFail: false,
        }
    });

if (process.env.NODE_ENV === "development") {
    globalAny.notificationQueue = notificationQueue;
}

/**
 * Utility to add a job to the queue
 */
export enum NotificationJobType {
    SEND_PUSH = 'send-push',
    SEND_WHATSAPP = 'send-whatsapp',
    SEND_TELEGRAM = 'send-telegram',
    TRIGGER_N8N = 'trigger-n8n',
    GENERATE_PDF = 'generate-pdf'
}

export async function addNotificationJob(type: NotificationJobType, data: any) {
    console.log(`[Queue] Adding job: ${type} for data:`, data);
    return await notificationQueue.add(type, data);
}
