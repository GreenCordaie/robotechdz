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
            //    Check + insert happen in ONE transaction so two racing requests
            //    can't both pass the check and double-insert (TOCTOU). The partial
            //    unique index `acrr_one_pending_per_order_idx` is the DB-level
            //    backstop: a racing insert that slips past the read raises 23505.
            try {
                await db.transaction(async (tx) => {
                    const existing = await tx.query.activeCodeRefundRequests.findFirst({
                        where: and(
                            eq(activeCodeRefundRequests.activeCodeOrderId, activeCodeOrderId),
                            eq(activeCodeRefundRequests.status, "PENDING"),
                        ),
                    });
                    if (existing) throw new Error("DUPLICATE_PENDING");

                    // 5. Snapshot the order details onto the request row.
                    await tx.insert(activeCodeRefundRequests).values({
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
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : "";
                // 23505 = unique_violation (the partial unique index);
                // DUPLICATE_PENDING = the in-transaction app check.
                if (
                    msg.includes("DUPLICATE_PENDING") ||
                    msg.includes("23505") ||
                    (err as { code?: string })?.code === "23505"
                ) {
                    return { success: false, error: "Une demande est déjà en cours." };
                }
                throw err;
            }

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Erreur serveur",
            };
        }
    },
);
