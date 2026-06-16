"use server";

/**
 * Refund-REQUEST workflow — reseller side (kind-aware).
 *
 * A reseller may request a refund on one of their DELIVERED orders across
 * three product kinds: 'active' (Niveausat active-code), 'g2bulk', and 'bsv'.
 * This only records a PENDING request; NO money moves until an admin approves
 * it (see src/app/admin/refund-requests/actions.ts).
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
    activeCodeOrders,
    activeCodeRefundRequests,
    bsvDeliveredCodes,
    bsvOrders,
    g2bulkDeliveredCodes,
    g2bulkOrders,
    resellers,
} from "@/db/schema";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";

type RefundKind = "active" | "g2bulk" | "bsv";

/** Per-kind snapshot resolved from the source-order row + its delivered code. */
type RefundSnapshot = {
    activeCodeOrderId: number | null;
    localOrderId: number;
    provider: string;
    productRef: string;
    planLabel: string | null;
    lbOrderId: string | null;
    code: string | null;
    priceDzd: string;
};

/**
 * Load the kind-specific source order, assert ownership + delivered state, and
 * build a generic snapshot for the refund-request row. Returns a user-facing
 * error string when the order is missing / not owned / not refundable.
 */
async function buildSnapshot(
    kind: RefundKind,
    sourceOrderId: number,
    resellerId: number,
): Promise<{ snapshot: RefundSnapshot } | { error: string }> {
    if (kind === "active") {
        const order = await db.query.activeCodeOrders.findFirst({
            where: eq(activeCodeOrders.id, sourceOrderId),
        });
        if (!order || order.resellerId !== resellerId) {
            return { error: "Commande introuvable" };
        }
        if (order.status !== "DELIVERED") {
            return {
                error: "Seules les commandes livrées peuvent faire l'objet d'une demande.",
            };
        }
        if (!order.code) {
            return { error: "Aucun code livré pour cette commande." };
        }
        return {
            snapshot: {
                activeCodeOrderId: order.id,
                localOrderId: order.localOrderId,
                provider: "niveausat",
                productRef: order.planId,
                planLabel: order.planLabel,
                lbOrderId: order.lbOrderId,
                code: order.code,
                priceDzd: order.pricePaidDzd,
            },
        };
    }

    if (kind === "g2bulk") {
        const order = await db.query.g2bulkOrders.findFirst({
            where: eq(g2bulkOrders.id, sourceOrderId),
        });
        if (!order || order.resellerId !== resellerId) {
            return { error: "Commande introuvable" };
        }
        if (order.status !== "COMPLETED") {
            return {
                error: "Seules les commandes livrées peuvent faire l'objet d'une demande.",
            };
        }
        const delivered = await db.query.g2bulkDeliveredCodes.findFirst({
            where: eq(g2bulkDeliveredCodes.g2bulkOrderId, order.id),
        });
        if (!delivered) {
            return { error: "Aucun code livré pour cette commande." };
        }
        return {
            snapshot: {
                activeCodeOrderId: null,
                localOrderId: order.localOrderId,
                provider: "g2bulk",
                productRef: String(order.productId),
                planLabel: order.productId,
                lbOrderId: order.lbOrderId,
                code: delivered.code,
                priceDzd: order.pricePaidDzd,
            },
        };
    }

    // kind === "bsv"
    const order = await db.query.bsvOrders.findFirst({
        where: eq(bsvOrders.id, sourceOrderId),
    });
    if (!order || order.resellerId !== resellerId) {
        return { error: "Commande introuvable" };
    }
    if (order.status !== "COMPLETED") {
        return {
            error: "Seules les commandes livrées peuvent faire l'objet d'une demande.",
        };
    }
    const delivered = await db.query.bsvDeliveredCodes.findFirst({
        where: eq(bsvDeliveredCodes.bsvOrderId, order.id),
    });
    if (!delivered) {
        return { error: "Aucun code livré pour cette commande." };
    }
    return {
        snapshot: {
            activeCodeOrderId: null,
            localOrderId: order.localOrderId,
            provider: "bsv",
            productRef: order.listingId,
            planLabel: order.listingId,
            lbOrderId: order.lbOrderId,
            code: delivered.code,
            priceDzd: order.pricePaidDzd,
        },
    };
}

/**
 * Generic refund-request action. Resolves the reseller, loads the kind-specific
 * order, snapshots it, and inserts a PENDING request inside a transaction. The
 * partial unique index `acrr_one_pending_per_source_idx` is the DB-level
 * backstop for the double-request race (23505).
 */
export const requestRefundAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            kind: z.enum(["active", "g2bulk", "bsv"]),
            sourceOrderId: z.number(),
            reason: z.string().max(500).optional(),
        }),
    },
    async ({ kind, sourceOrderId, reason }, user) => {
        try {
            // 1. Resolve the current reseller from the authenticated user.
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
            });
            if (!reseller) {
                return { success: false, error: "Compte revendeur introuvable" };
            }

            // 2. Load + validate the source order, build the snapshot.
            const built = await buildSnapshot(kind, sourceOrderId, reseller.id);
            if ("error" in built) {
                return { success: false, error: built.error };
            }
            const snap = built.snapshot;

            // 3. Refuse a second concurrent PENDING request for the same source
            //    order. Check + insert happen in ONE transaction (TOCTOU guard);
            //    the partial unique index is the DB-level backstop (23505).
            try {
                await db.transaction(async (tx) => {
                    const existing = await tx.query.activeCodeRefundRequests.findFirst({
                        where: and(
                            eq(activeCodeRefundRequests.kind, kind),
                            eq(activeCodeRefundRequests.sourceOrderId, sourceOrderId),
                            eq(activeCodeRefundRequests.status, "PENDING"),
                        ),
                    });
                    if (existing) throw new Error("DUPLICATE_PENDING");

                    await tx.insert(activeCodeRefundRequests).values({
                        kind,
                        sourceOrderId,
                        // back-compat link, only for active-code rows
                        activeCodeOrderId: snap.activeCodeOrderId ?? undefined,
                        localOrderId: snap.localOrderId,
                        resellerId: reseller.id,
                        provider: snap.provider,
                        planId: snap.productRef,
                        planLabel: snap.planLabel,
                        lbOrderId: snap.lbOrderId ?? "",
                        code: snap.code,
                        priceDzd: snap.priceDzd,
                        reason: reason ?? null,
                        status: "PENDING",
                    });
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : "";
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

/**
 * Back-compat thin wrapper for the original active-code-only UI. Delegates to
 * the generic action with kind='active'.
 */
export const requestActiveCodeRefundAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            activeCodeOrderId: z.number(),
            reason: z.string().max(500).optional(),
        }),
    },
    async ({ activeCodeOrderId, reason }, user) => {
        return requestRefundAction({
            kind: "active",
            sourceOrderId: activeCodeOrderId,
            reason,
        });
    },
);
