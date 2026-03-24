import { sendTelegramNotification } from "@/lib/telegram";

export type LogLevel = "info" | "warn" | "error" | "critical";

export interface LogEntry {
    id: string;
    level: LogLevel;
    timestamp: Date;
    message: string;
    userId?: number;
    action?: string;
    metadata?: Record<string, any>;
}

interface LogContext {
    userId?: number;
    action?: string;
    metadata?: Record<string, any>;
}

interface ThrottleEntry {
    count: number;
    firstSeenAt: Date;
    lastAlertSentAt: Date;
}

const MAX_BUFFER_SIZE = 1000;
const ANTI_SPAM_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const logBuffer: LogEntry[] = [];
const alertThrottle: Map<string, ThrottleEntry> = new Map();

let idCounter = 0;

function generateId(): string {
    return `${Date.now()}-${++idCounter}`;
}

function pushToBuffer(entry: LogEntry): void {
    if (logBuffer.length >= MAX_BUFFER_SIZE) {
        logBuffer.shift(); // Remove oldest entry (circular buffer behavior)
    }
    logBuffer.push(entry);
}

function createEntry(level: LogLevel, message: string, ctx?: LogContext): LogEntry {
    return {
        id: generateId(),
        level,
        timestamp: new Date(),
        message,
        userId: ctx?.userId,
        action: ctx?.action,
        metadata: ctx?.metadata,
    };
}

export const logger = {
    info(message: string, ctx?: LogContext): void {
        const entry = createEntry("info", message, ctx);
        pushToBuffer(entry);
    },

    warn(message: string, ctx?: LogContext): void {
        const entry = createEntry("warn", message, ctx);
        pushToBuffer(entry);
    },

    error(message: string, ctx?: LogContext): void {
        const entry = createEntry("error", message, ctx);
        pushToBuffer(entry);
    },

    critical(message: string, ctx?: LogContext): void {
        const entry = createEntry("critical", message, ctx);
        pushToBuffer(entry);

        // Anti-spam: compute error key
        const errorKey = `${message}:${ctx?.action || ""}`;
        const now = new Date();
        const throttleEntry = alertThrottle.get(errorKey);

        if (throttleEntry) {
            const timeSinceLastAlert = now.getTime() - throttleEntry.lastAlertSentAt.getTime();
            if (timeSinceLastAlert < ANTI_SPAM_WINDOW_MS) {
                // Within 10-minute window — don't send Telegram, just increment count
                throttleEntry.count += 1;
                return;
            }
            // Outside window — update and send
            throttleEntry.count += 1;
            throttleEntry.lastAlertSentAt = now;
        } else {
            // First occurrence
            alertThrottle.set(errorKey, {
                count: 1,
                firstSeenAt: now,
                lastAlertSentAt: now,
            });
        }

        // Send Telegram notification (fire-and-forget, anti-spam passed)
        const telegramMessage =
            `🚨 *ERREUR CRITIQUE*\n` +
            `Message: ${message}\n` +
            (ctx?.action ? `Action: ${ctx.action}\n` : "") +
            (ctx?.userId ? `User ID: ${ctx.userId}\n` : "") +
            (ctx?.metadata ? `Metadata: ${JSON.stringify(ctx.metadata)}\n` : "") +
            `Timestamp: ${now.toISOString()}`;

        sendTelegramNotification(telegramMessage, ["ADMIN"]).catch(console.error);
    },

    getLogs(level?: LogLevel, limit: number = 50): LogEntry[] {
        const filtered = level
            ? logBuffer.filter((entry) => entry.level === level)
            : [...logBuffer];
        // Return most recent entries first
        return filtered.slice(-limit).reverse();
    },

    getCounts(): { info: number; warn: number; error: number; critical: number } {
        const counts = { info: 0, warn: 0, error: 0, critical: 0 };
        for (const entry of logBuffer) {
            counts[entry.level]++;
        }
        return counts;
    },
};
