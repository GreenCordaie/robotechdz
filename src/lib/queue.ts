import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Shared Redis connection for BullMQ
 */
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Critical for BullMQ
});

/**
 * System Queues
 */
export const NOTIFICATION_QUEUE = 'notification-tasks';

/**
 * Job Types for the Notification Queue
 */
export enum NotificationJobType {
    SEND_WHATSAPP = 'SEND_WHATSAPP',
    SEND_TELEGRAM = 'SEND_TELEGRAM',
    SEND_PUSH = 'SEND_PUSH',
    TRIGGER_N8N = 'TRIGGER_N8N',
}

/**
 * Unified Queue Instance
 */
export const notificationQueue = new Queue(NOTIFICATION_QUEUE, {
    connection,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5s
        },
        removeOnComplete: true,
        removeOnFail: false,
    }
});

/**
 * Utility to add a job to the queue
 */
export async function addNotificationJob(type: NotificationJobType, data: any) {
    return await notificationQueue.add(type, data);
}

export { connection };
