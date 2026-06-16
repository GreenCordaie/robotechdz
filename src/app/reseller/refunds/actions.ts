"use server";

/**
 * Refund-REQUEST workflow — reseller side (kind-aware).
 *
 * A reseller may request a refund on one of their DELIVERED orders across
 * three product kinds: 'active' (Niveausat active-code), 'g2bulk', and 'bsv'.
 * This only records a PENDING request; NO money moves until an admin approves
 * it (see src/app/admin/refund-requests/actions.ts).
 */
import { and, eq } from "drizzle-orm";
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
import { withAuth, type UserContext } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { decrypt } from "@/lib/encryption";

type RefundKind = "active" | "g2bulk" | "bsv";

/**
 * g2bulk + bsv delivered codes are stored ENCRYPTED at rest. The snapshot must
 * hold the PLAINTEXT code so return-to-stock re-stocks a usable code (otherwise
 * the next order is delivered the ciphertext). Active-code stores plaintext.
 */
function safeDecryptCode(raw: string): string {
    try {
        return decrypt(raw) || raw;
    } catch {
        return raw;
    }
}

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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Load the kind-specific source order INSIDE the supplied transaction, locking
 * the source-order row (SELECT … FOR UPDATE), assert ownership + delivered
 * state, and build a generic snapshot for the refund-request row. Locking here
 * closes the window where the order could be refunded by another path between
 * the read and the PENDING-request insert. Returns a user-facing error string
 * when the order is missing / not owned / not refundable.
 */
async function buildSnapshot(
    tx: Tx,
    kind: RefundKind,
    sourceOrderId: number,
    resellerId: number,
): Promise<{ snapshot: RefundSnapshot } | { error: string }> {
    if (kind === "active") {
        const [order] = await tx
            .select()
            .from(activeCodeOrders)
            .where(eq(activeCodeOrders.id, sourceOrderId))
            .for("update");
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
        if (!order.lbOrderId) {
            return {
                error: "Commande sans référence LoadBrain — remboursement impossible automatiquement",
            };
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
        const [order] = await tx
            .select()
            .from(g2bulkOrders)
            .where(eq(g2bulkOrders.id, sourceOrderId))
            .for("update");
        if (!order || order.resellerId !== resellerId) {
            return { error: "Commande introuvable" };
        }
        if (order.status !== "COMPLETED") {
            return {
                error: "Seules les commandes livrées peuvent faire l'objet d'une demande.",
            };
        }
        if (!order.lbOrderId) {
            return {
                error: "Commande sans référence LoadBrain — remboursement impossible automatiquement",
            };
        }
        const delivered = await tx.query.g2bulkDeliveredCodes.findFirst({
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
                code: safeDecryptCode(delivered.code),
                priceDzd: order.pricePaidDzd,
            },
        };
    }

    // kind === "bsv"
    const [order] = await tx
        .select()
        .from(bsvOrders)
        .where(eq(bsvOrders.id, sourceOrderId))
        .for("update");
    if (!order || order.resellerId !== resellerId) {
        return { error: "Commande introuvable" };
    }
    if (order.status !== "COMPLETED") {
        return {
            error: "Seules les commandes livrées peuvent faire l'objet d'une demande.",
        };
    }
    if (!order.lbOrderId) {
        return {
            error: "Commande sans référence LoadBrain — remboursement impossible automatiquement",
        };
    }
    const delivered = await tx.query.bsvDeliveredCodes.findFirst({
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
 * Generic refund-request implementation — shared by both exported actions so we
 * never re-enter the withAuth pipeline (which would re-run auth and discard the
 * outer authenticated user). Resolves the reseller, then inside ONE transaction
 * locks + validates the source order (TOCTOU guard) and inserts a PENDING
 * request. The partial unique index `acrr_one_pending_per_source_idx` is the
 * DB-level backstop for the double-request race (23505).
 */
async function requestRefundImpl(
    input: { kind: RefundKind; sourceOrderId: number; reason?: string },
    user: UserContext,
): Promise<{ success: true } | { success: false; error: string }> {
    const { kind, sourceOrderId, reason } = input;
    try {
        // 1. Resolve the current reseller from the authenticated user.
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
        });
        if (!reseller) {
            return { success: false, error: "Compte revendeur introuvable" };
        }

        // 2. In ONE transaction: lock + validate the source order, refuse a
        //    second concurrent PENDING request, then insert. Locking the source
        //    order row (FOR UPDATE) inside the tx closes the window where it
        //    could be refunded by another path between read and insert.
        try {
            const result = await db.transaction(async (tx) => {
                const built = await buildSnapshot(tx, kind, sourceOrderId, reseller.id);
                if ("error" in built) {
                    return { success: false as const, error: built.error };
                }
                const snap = built.snapshot;

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

                return { success: true as const };
            });
            return result;
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
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Erreur serveur",
        };
    }
}

/**
 * Generic refund-request action. Thin withAuth wrapper over requestRefundImpl.
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
    (input, user) => requestRefundImpl(input, user),
);

/**
 * Back-compat thin wrapper for the original active-code-only UI. Calls the
 * shared impl directly with the outer authenticated user — NEVER re-enters
 * another withAuth-wrapped action.
 */
export const requestActiveCodeRefundAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            activeCodeOrderId: z.number(),
            reason: z.string().max(500).optional(),
        }),
    },
    ({ activeCodeOrderId, reason }, user) =>
        requestRefundImpl(
            { kind: "active", sourceOrderId: activeCodeOrderId, reason },
            user,
        ),
);
