"use server";

/**
 * Active Code refund-REQUEST workflow — reseller side.
 *
 * A reseller may request a refund on one of their DELIVERED active-code
 * orders. This only records a PENDING request; NO money moves until an
 * admin approves it (see src/app/admin/refund-requests/actions.ts).
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
    activeCodeOrders,
    activeCodeRefundRequests,
    resellers,
} from "@/db/schema";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";

export const requestActiveCodeRefundAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            activeCodeOrderId: z.number(),
            reason: z.string().max(500).optional(),
        }),
    },
    async ({ activeCodeOrderId, reason }, user) => {
        try {
            // 1. Resolve the current reseller from the authenticated user.
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
            });
            if (!reseller) {
                return { success: false, error: "Compte revendeur introuvable" };
            }

            // 2. Load the active-code order and assert ownership.
            const order = await db.query.activeCodeOrders.findFirst({
                where: eq(activeCodeOrders.id, activeCodeOrderId),
            });
            if (!order || order.resellerId !== reseller.id) {
                return { success: false, error: "Commande introuvable" };
            }

            // 3. Only delivered orders can be refund-requested.
            if (order.status !== "DELIVERED") {
                return {
                    success: false,
                    error: "Seules les commandes livrées peuvent faire l'objet d'une demande.",
                };
            }

            // 4. Refuse a second concurrent PENDING request for the same order.
            const existing = await db.query.activeCodeRefundRequests.findFirst({
                where: and(
                    eq(activeCodeRefundRequests.activeCodeOrderId, activeCodeOrderId),
                    eq(activeCodeRefundRequests.status, "PENDING"),
                ),
            });
            if (existing) {
                return { success: false, error: "Une demande est déjà en cours." };
            }

            // 5. Snapshot the order details onto the request row.
            await db.insert(activeCodeRefundRequests).values({
                activeCodeOrderId: order.id,
                localOrderId: order.localOrderId,
                resellerId: reseller.id,
                provider: "niveausat",
                planId: order.planId,
                planLabel: order.planLabel,
                lbOrderId: order.lbOrderId,
                code: order.code,
                priceDzd: order.pricePaidDzd,
                reason: reason ?? null,
                status: "PENDING",
            });

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Erreur serveur",
            };
        }
    },
);
