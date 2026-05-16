"use server";

import { db } from "@/db";
import { resellerWebhooks, resellers } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";

/**
 * Vue admin globale : liste TOUS les webhooks de TOUS les resellers,
 * avec stats d'erreur. Permet le SAV (un reseller dont la receiver app
 * est down → l'admin peut désactiver pour stopper le spam d'erreurs côté
 * dispatcher).
 */
export const listAllWebhooksForAdminAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            filter: z.enum(["ALL", "ACTIVE", "INACTIVE", "FAILING"]).default("ALL"),
            search: z.string().optional(),
        }),
    },
    async ({ filter, search }) => {
        const rows = await db
            .select({
                id: resellerWebhooks.id,
                resellerId: resellerWebhooks.resellerId,
                resellerCompanyName: resellers.companyName,
                resellerContactPhone: resellers.contactPhone,
                url: resellerWebhooks.url,
                events: resellerWebhooks.events,
                isActive: resellerWebhooks.isActive,
                lastFiredAt: resellerWebhooks.lastFiredAt,
                lastStatusCode: resellerWebhooks.lastStatusCode,
                lastError: resellerWebhooks.lastError,
                deliveriesOk: resellerWebhooks.deliveriesOk,
                deliveriesFailed: resellerWebhooks.deliveriesFailed,
                createdAt: resellerWebhooks.createdAt,
            })
            .from(resellerWebhooks)
            .innerJoin(resellers, eq(resellers.id, resellerWebhooks.resellerId))
            .orderBy(desc(resellerWebhooks.createdAt));

        let filtered = rows;
        if (filter === "ACTIVE") {
            filtered = filtered.filter((r) => r.isActive);
        } else if (filter === "INACTIVE") {
            filtered = filtered.filter((r) => !r.isActive);
        } else if (filter === "FAILING") {
            // FAILING : actif + deliveriesFailed > 0 + ratio echec > 30%
            filtered = filtered.filter((r) => {
                if (!r.isActive) return false;
                if (r.deliveriesFailed === 0) return false;
                const total = r.deliveriesOk + r.deliveriesFailed;
                if (total === 0) return false;
                return r.deliveriesFailed / total > 0.3;
            });
        }

        if (search) {
            const q = search.toLowerCase();
            filtered = filtered.filter(
                (r) =>
                    r.resellerCompanyName.toLowerCase().includes(q) ||
                    r.url.toLowerCase().includes(q)
            );
        }

        return { success: true as const, data: filtered };
    }
);

/**
 * Force désactivation par admin. Audit log inscrit pour traçabilité.
 * Réutilise le toggle interne du dispatcher (isActive=false → skip).
 */
export const forceDisableWebhookAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            id: z.number().int().positive(),
            reason: z.string().min(3).max(500),
        }),
    },
    async ({ id, reason }, user) => {
        const existing = await db.query.resellerWebhooks.findFirst({
            where: eq(resellerWebhooks.id, id),
        });
        if (!existing) return { success: false as const, error: "Webhook introuvable" };
        if (!existing.isActive) {
            return { success: false as const, error: "Webhook déjà inactif" };
        }

        await db
            .update(resellerWebhooks)
            .set({
                isActive: false,
                lastError: `[ADMIN-DISABLE] ${reason}`,
            })
            .where(eq(resellerWebhooks.id, id));

        // Audit log
        const { auditLogs } = await import("@/db/schema");
        await db.insert(auditLogs).values({
            userId: user.id,
            action: "WEBHOOK_FORCE_DISABLED",
            entityType: "RESELLER_WEBHOOK",
            entityId: id.toString(),
            newData: {
                resellerId: existing.resellerId,
                url: existing.url,
                reason,
                deliveriesFailed: existing.deliveriesFailed,
            },
        });

        revalidatePath("/admin/b2b/webhooks");
        return { success: true as const };
    }
);

/**
 * Réactive un webhook précédemment désactivé.
 * Reset les compteurs d'erreur pour permettre un nouveau cycle.
 */
export const reactivateWebhookAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        const existing = await db.query.resellerWebhooks.findFirst({
            where: eq(resellerWebhooks.id, id),
        });
        if (!existing) return { success: false as const, error: "Webhook introuvable" };
        if (existing.isActive) {
            return { success: false as const, error: "Webhook déjà actif" };
        }

        await db
            .update(resellerWebhooks)
            .set({
                isActive: true,
                lastError: null,
                lastStatusCode: null,
            })
            .where(eq(resellerWebhooks.id, id));

        const { auditLogs } = await import("@/db/schema");
        await db.insert(auditLogs).values({
            userId: user.id,
            action: "WEBHOOK_REACTIVATED",
            entityType: "RESELLER_WEBHOOK",
            entityId: id.toString(),
            newData: { resellerId: existing.resellerId, url: existing.url },
        });

        revalidatePath("/admin/b2b/webhooks");
        return { success: true as const };
    }
);

/**
 * KPIs globaux pour le header de la page admin.
 */
export const getWebhookKpisAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN], schema: z.object({}) },
    async () => {
        const all = await db.select().from(resellerWebhooks);
        const total = all.length;
        const active = all.filter((w) => w.isActive).length;
        const totalDeliveriesOk = all.reduce((acc, w) => acc + w.deliveriesOk, 0);
        const totalDeliveriesFailed = all.reduce((acc, w) => acc + w.deliveriesFailed, 0);
        const failingActive = all.filter((w) => {
            if (!w.isActive) return false;
            const totalDel = w.deliveriesOk + w.deliveriesFailed;
            return totalDel > 0 && w.deliveriesFailed / totalDel > 0.3;
        }).length;

        return {
            success: true as const,
            data: {
                total,
                active,
                inactive: total - active,
                failingActive,
                totalDeliveriesOk,
                totalDeliveriesFailed,
            },
        };
    }
);
