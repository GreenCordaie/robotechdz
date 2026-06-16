"use server";

/**
 * Active Code refund-REQUEST workflow — admin side.
 *
 * Admins review reseller-initiated refund requests on DELIVERED active-code
 * orders. On APPROVAL we credit the reseller wallet (REFUND tx) + flip the
 * order statuses in ONE transaction, mirroring the inline-failure refund in
 * `src/app/reseller/shop/active-code/actions.ts#refundActiveCodeOrder`. Then,
 * AFTER the transaction commits, we make a best-effort gateway call to return
 * the code to LoadBrain stock with the admin-chosen `reusable` flag — that
 * call NEVER rolls back the (already-committed) wallet refund.
 */
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
    activeCodeOrders,
    activeCodeRefundRequests,
    bsvOrders,
    g2bulkOrders,
    orders,
    resellerTransactions,
    resellerWallets,
} from "@/db/schema";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";

/**
 * Resolve the LoadBrain base URL + API key from env. Returns null when the
 * env is missing — callers should skip the gateway call in that case rather
 * than crash. (Duplicated from the active-code storefront action; there is no
 * shared src/lib/loadbrain.ts yet.)
 */
function resolveLoadBrainAuth(): { baseUrl: string; apiKey: string } | null {
    const apiKey = process.env.LOADBRAIN_API_KEY;
    const baseUrl = process.env.LOADBRAIN_URL;
    if (!apiKey || !baseUrl) return null;
    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export const listActiveCodeRefundRequestsAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN], schema: z.any().optional() },
    async () => {
        try {
            const rows = await db.query.activeCodeRefundRequests.findMany({
                orderBy: [desc(activeCodeRefundRequests.createdAt)],
                limit: 50,
                with: {
                    localOrder: { columns: { orderNumber: true } },
                    reseller: { columns: { companyName: true } },
                },
            });

            const data = rows.map((r) => ({
                id: r.id,
                kind: r.kind,
                sourceOrderId: r.sourceOrderId,
                activeCodeOrderId: r.activeCodeOrderId,
                orderNumber: r.localOrder?.orderNumber ?? null,
                resellerCompany: r.reseller?.companyName ?? null,
                provider: r.provider,
                planId: r.planId,
                planLabel: r.planLabel,
                priceDzd: r.priceDzd,
                reason: r.reason,
                status: r.status,
                reusable: r.reusable,
                decisionReason: r.decisionReason,
                decidedBy: r.decidedBy,
                decidedAt: r.decidedAt,
                createdAt: r.createdAt,
            }));

            return { success: true, data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Erreur serveur",
            };
        }
    },
);

export const approveActiveCodeRefundAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            requestId: z.number(),
            reusable: z.boolean(),
        }),
    },
    async ({ requestId, reusable }, user) => {
        // The refund request, captured outside the tx so the best-effort
        // gateway call below can read its snapshot after commit.
        let req: typeof activeCodeRefundRequests.$inferSelect | null = null;

        try {
            await db.transaction(async (tx) => {
                // 1. Lock + load the request; only a PENDING request is actionable.
                const [lockedReq] = await tx
                    .select()
                    .from(activeCodeRefundRequests)
                    .where(eq(activeCodeRefundRequests.id, requestId))
                    .for("update");
                if (!lockedReq) {
                    throw new Error("Demande introuvable");
                }
                if (lockedReq.status !== "PENDING") {
                    throw new Error("Déjà traitée");
                }
                req = lockedReq;

                const priceDzd = parseFloat(lockedReq.priceDzd);

                // 2. Lock the reseller wallet row (mirror refundActiveCodeOrder).
                //    Single locking select fetches the wallet id + row lock together.
                const [walletRow] = await tx
                    .select({ id: resellerWallets.id })
                    .from(resellerWallets)
                    .where(eq(resellerWallets.resellerId, lockedReq.resellerId))
                    .for("update");
                if (!walletRow) {
                    throw new Error("Portefeuille revendeur introuvable — remboursement annulé");
                }

                // 3. Credit wallet + record the REFUND transaction.
                await tx
                    .update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} + ${priceDzd}`,
                        totalSpent: sql`GREATEST(${resellerWallets.totalSpent} - ${priceDzd}, 0)`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerWallets.id, walletRow.id));

                await tx.insert(resellerTransactions).values({
                    walletId: walletRow.id,
                    type: "REFUND",
                    amount: priceDzd.toString(),
                    orderId: lockedReq.localOrderId,
                    description: `${lockedReq.kind} refund (approved) — req#${requestId}`,
                    source: "ACTIVE_CODE",
                });

                // 4. Flip the local order + the kind-specific source order to refunded.
                await tx
                    .update(orders)
                    .set({ status: "REMBOURSE" })
                    .where(eq(orders.id, lockedReq.localOrderId));

                if (lockedReq.kind === "active") {
                    // Back-compat: active-code rows carry activeCodeOrderId; fall
                    // back to sourceOrderId for any newly-written rows.
                    const acId = lockedReq.activeCodeOrderId ?? lockedReq.sourceOrderId;
                    if (acId != null) {
                        await tx
                            .update(activeCodeOrders)
                            .set({
                                status: "REFUNDED",
                                error: `Refund approved — req#${requestId}`.slice(0, 1000),
                                updatedAt: new Date(),
                            })
                            .where(eq(activeCodeOrders.id, acId));
                    }
                } else if (lockedReq.kind === "g2bulk") {
                    if (lockedReq.sourceOrderId != null) {
                        await tx
                            .update(g2bulkOrders)
                            .set({ status: "REFUNDED" })
                            .where(eq(g2bulkOrders.id, lockedReq.sourceOrderId));
                    }
                } else if (lockedReq.kind === "bsv") {
                    if (lockedReq.sourceOrderId != null) {
                        await tx
                            .update(bsvOrders)
                            .set({ status: "REFUNDED" })
                            .where(eq(bsvOrders.id, lockedReq.sourceOrderId));
                    }
                }

                // 5. Mark the request APPROVED.
                await tx
                    .update(activeCodeRefundRequests)
                    .set({
                        status: "APPROVED",
                        reusable,
                        decidedBy: user.id,
                        decidedAt: new Date(),
                    })
                    .where(eq(activeCodeRefundRequests.id, requestId));
            });
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Erreur serveur",
            };
        }

        // 6. Best-effort: return the code to LoadBrain stock. The wallet refund
        //    is already committed — NEVER throw/roll back on a failure here.
        const snapshot = req as typeof activeCodeRefundRequests.$inferSelect | null;
        if (snapshot) {
            const auth = resolveLoadBrainAuth();
            if (auth) {
                try {
                    await fetch(`${auth.baseUrl}/api/v1/giftcards/inventory/return`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-API-Key": auth.apiKey,
                        },
                        body: JSON.stringify({
                            provider: snapshot.provider, // niveausat | g2bulk | bsv
                            productRef: snapshot.planId,
                            orderId: snapshot.lbOrderId,
                            reusable, // admin's checkbox
                            payload: snapshot.code ?? undefined, // delivered code (fresh-buy refunds)
                            label: snapshot.planLabel ?? undefined,
                        }),
                        cache: "no-store",
                    });
                } catch (err) {
                    console.error(
                        `[active-code-refund-approve] return-to-stock failed for req#${requestId}:`,
                        err,
                    );
                }
            }
        }

        return { success: true };
    },
);

export const rejectActiveCodeRefundAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            requestId: z.number(),
            reason: z.string().max(500).optional(),
        }),
    },
    async ({ requestId, reason }, user) => {
        try {
            return await db.transaction(async (tx) => {
                const [lockedReq] = await tx
                    .select({ status: activeCodeRefundRequests.status })
                    .from(activeCodeRefundRequests)
                    .where(eq(activeCodeRefundRequests.id, requestId))
                    .for("update");
                if (!lockedReq) {
                    return { success: false, error: "Demande introuvable" };
                }
                if (lockedReq.status !== "PENDING") {
                    return { success: false, error: "Déjà traitée" };
                }

                await tx
                    .update(activeCodeRefundRequests)
                    .set({
                        status: "REJECTED",
                        decisionReason: reason ?? null,
                        decidedBy: user.id,
                        decidedAt: new Date(),
                    })
                    .where(eq(activeCodeRefundRequests.id, requestId));

                return { success: true };
            });
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Erreur serveur",
            };
        }
    },
);
