"use server";

import { withAuth } from "@/lib/security";
import { logger, LogLevel } from "@/lib/logger";
import { UserRole } from "@/lib/constants";
import { z } from "zod";

export const getMonitoringLogs = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            level: z.enum(["info", "warn", "error", "critical"]).optional(),
            limit: z.number().int().positive().max(200).optional(),
        }).optional(),
    },
    async (input) => {
        const level = input?.level as LogLevel | undefined;
        const limit = input?.limit ?? 50;

        return {
            logs: logger.getLogs(level, limit),
            counts: logger.getCounts(),
            uptime: process.uptime(),
        };
    }
);
export const getQueueStats = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN], schema: z.any().optional() },
    async () => {
        try {
            const { notificationQueue } = await import("@/lib/queue");
            const counts = await notificationQueue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');

            return {
                success: true,
                counts: {
                    waiting: counts.wait,
                    active: counts.active,
                    completed: counts.completed,
                    failed: counts.failed,
                    delayed: counts.delayed
                }
            };
        } catch (error) {
            console.error("Failed to fetch queue stats:", error);
            return { success: false, error: "Failed to fetch queue stats" };
        }
    }
);
