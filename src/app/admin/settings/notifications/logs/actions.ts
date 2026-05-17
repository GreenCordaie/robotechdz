"use server";

import { db } from "@/db";
import { notificationLogs, resellers } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";

/**
 * Liste les notification logs avec filtres (event, status, période).
 * Limite à 500 rows max — pas de pagination, c'est un viewer SAV.
 */
export const listNotificationLogsAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            eventKey: z.string().optional(),
            status: z.enum(["ALL", "DELIVERED", "FAILED"]).default("ALL"),
            sinceDays: z.number().int().min(1).max(90).default(7),
        }),
    },
    async ({ eventKey, status, sinceDays }) => {
        const sinceDate = new Date(Date.now() - sinceDays * 86_400_000);

        const conditions = [gte(notificationLogs.createdAt, sinceDate)];
        if (eventKey && eventKey.trim()) {
            conditions.push(eq(notificationLogs.eventKey, eventKey));
        }
        if (status === "DELIVERED") {
            conditions.push(eq(notificationLogs.delivered, true));
        } else if (status === "FAILED") {
            conditions.push(eq(notificationLogs.delivered, false));
        }

        const rows = await db
            .select({
                id: notificationLogs.id,
                eventKey: notificationLogs.eventKey,
                channel: notificationLogs.channel,
                resellerId: notificationLogs.resellerId,
                contactPhone: notificationLogs.contactPhone,
                delivered: notificationLogs.delivered,
                reason: notificationLogs.reason,
                createdAt: notificationLogs.createdAt,
                resellerCompanyName: resellers.companyName,
            })
            .from(notificationLogs)
            .leftJoin(resellers, eq(resellers.id, notificationLogs.resellerId))
            .where(and(...conditions))
            .orderBy(desc(notificationLogs.createdAt))
            .limit(500);

        return { success: true as const, data: rows };
    }
);

/**
 * KPIs agrégés sur les 7 derniers jours.
 */
export const getNotificationLogsStatsAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN], schema: z.object({ sinceDays: z.number().int().min(1).max(90).default(7) }) },
    async ({ sinceDays }) => {
        const sinceDate = new Date(Date.now() - sinceDays * 86_400_000);

        const totalRow = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(notificationLogs)
            .where(gte(notificationLogs.createdAt, sinceDate));

        const deliveredRow = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(notificationLogs)
            .where(and(gte(notificationLogs.createdAt, sinceDate), eq(notificationLogs.delivered, true)));

        const total = totalRow[0]?.count ?? 0;
        const delivered = deliveredRow[0]?.count ?? 0;
        const failed = total - delivered;
        const successRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

        return {
            success: true as const,
            data: { total, delivered, failed, successRate, sinceDays },
        };
    }
);
