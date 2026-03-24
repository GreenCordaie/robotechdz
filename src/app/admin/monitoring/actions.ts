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
