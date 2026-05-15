"use server";

import { db } from "@/db";
import { webhookDeliveryAttempts, resellerWebhooks, resellers } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { replayDeadAttempt, getDlqStats } from "@/services/webhook-retry.service";

/**
 * Liste les tentatives DLQ avec contexte reseller + url webhook.
 * Filtre par statut (RETRYING / DEAD / RESOLVED / ALL).
 */
export const listDlqAttemptsAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            status: z.enum(["ALL", "RETRYING", "DEAD", "RESOLVED"]).default("DEAD"),
        }),
    },
    async ({ status }) => {
        const baseQuery = db
            .select({
                id: webhookDeliveryAttempts.id,
                webhookId: webhookDeliveryAttempts.webhookId,
                event: webhookDeliveryAttempts.event,
                attempts: webhookDeliveryAttempts.attempts,
                nextAttemptAt: webhookDeliveryAttempts.nextAttemptAt,
                status: webhookDeliveryAttempts.status,
                lastError: webhookDeliveryAttempts.lastError,
                lastStatusCode: webhookDeliveryAttempts.lastStatusCode,
                createdAt: webhookDeliveryAttempts.createdAt,
                updatedAt: webhookDeliveryAttempts.updatedAt,
                webhookUrl: resellerWebhooks.url,
                resellerId: resellerWebhooks.resellerId,
                resellerCompanyName: resellers.companyName,
            })
            .from(webhookDeliveryAttempts)
            .innerJoin(resellerWebhooks, eq(resellerWebhooks.id, webhookDeliveryAttempts.webhookId))
            .innerJoin(resellers, eq(resellers.id, resellerWebhooks.resellerId))
            .orderBy(desc(webhookDeliveryAttempts.updatedAt))
            .limit(200);

        const rows =
            status === "ALL"
                ? await baseQuery
                : await baseQuery.where(eq(webhookDeliveryAttempts.status, status));

        return { success: true as const, data: rows };
    }
);

/**
 * Replay manuel d'une tentative DEAD (remet en RETRYING + nextAttemptAt=now).
 */
export const replayDlqAttemptAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }) => {
        const result = await replayDeadAttempt(id);
        if (!result.success) {
            return { success: false as const, error: result.error ?? "Replay impossible" };
        }
        revalidatePath("/admin/b2b/webhooks/dlq");
        return { success: true as const };
    }
);

/**
 * Drop définitif d'une tentative DEAD (suppression).
 */
export const dismissDlqAttemptAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }) => {
        const existing = await db.query.webhookDeliveryAttempts.findFirst({
            where: eq(webhookDeliveryAttempts.id, id),
        });
        if (!existing) return { success: false as const, error: "Tentative introuvable" };
        if (existing.status !== "DEAD") {
            return { success: false as const, error: "Seules les DEAD peuvent être supprimées" };
        }

        await db.delete(webhookDeliveryAttempts).where(eq(webhookDeliveryAttempts.id, id));
        revalidatePath("/admin/b2b/webhooks/dlq");
        return { success: true as const };
    }
);

/**
 * KPIs DLQ pour le header.
 */
export const getDlqStatsAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN], schema: z.object({}) },
    async () => {
        const stats = await getDlqStats();
        return { success: true as const, data: stats };
    }
);
