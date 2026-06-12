import "server-only";
import { db as defaultDb } from "@/db";
import {
    bsvOrders,
    bsvDeliveredCodes,
    orders,
    resellers,
    resellerWallets,
    resellerTransactions,
} from "@/db/schema";
import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";
import { lbV2 } from "@/lib/loadbrain-v2";
import { encrypt } from "@/lib/encryption";

/**
 * BSV order reconciler — the PULL safety-net that guarantees a reseller is
 * never debited without a code or a refund, even if the LoadBrain `failed`/
 * `delivered` webhook is lost (LoadBrain down, signature/secret mismatch,
 * network drop, 5-min replay tolerance exceeded, handler 500).
 *
 * Mirrors `g2bulk-reconciler.service.ts` and applies the EXACT same transitions
 * as the v2 webhook handlers (`handleGiftcardsDelivered`/`handleGiftcardsFailed`)
 * so a webhook and a reconcile pass on the same order are interchangeable and
 * idempotent (FOR UPDATE re-read + `status === "PENDING_LOADBRAIN"` guard).
 *
 * Two passes:
 *   1. Poll `lbV2.giftcards.orders.get` for PENDING rows that have an lbOrderId.
 *   2. Orphan sweep: PENDING rows with lbOrderId = NULL older than 15 min — the
 *      post-commit crash window between the wallet debit and recording lbOrderId
 *      → refund (they can no longer be a legit in-flight placement).
 */
export type BsvReconcileResult = {
    scanned: number;
    delivered: number;
    refunded: number;
    stillPending: number;
    errors: Array<{ bsvOrderId: number; lbOrderId: string | null; reason: string }>;
};

type DbLike = typeof defaultDb;
type Outcome = "delivered" | "refunded" | "pending";
type LbCode = { code: string; redemptionUrl?: string | null; pin?: string | null };

const MAX_SCAN_AGE_DAYS = 7;
const STALE_ORPHAN_MINUTES = 15;
// Manual-delivery SLA: a non-terminal order older than this is refunded (#8) so
// a reseller is never charged forever for an "on demand" item that never came.
const MANUAL_DELIVERY_TIMEOUT_HOURS = 48;

export async function reconcilePendingBsvOrders(
    options: { dbInstance?: DbLike; limit?: number } = {},
): Promise<BsvReconcileResult> {
    const db = options.dbInstance ?? defaultDb;
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const result: BsvReconcileResult = {
        scanned: 0,
        delivered: 0,
        refunded: 0,
        stillPending: 0,
        errors: [],
    };
    if (!lbV2) {
        result.errors.push({
            bsvOrderId: 0,
            lbOrderId: null,
            reason: "LoadBrain SDK not configured (LOADBRAIN_API_KEY missing)",
        });
        return result;
    }

    // 1) Poll PENDING_LOADBRAIN orders that have an lbOrderId.
    const pending = await db
        .select()
        .from(bsvOrders)
        .where(
            and(
                eq(bsvOrders.status, "PENDING_LOADBRAIN"),
                isNotNull(bsvOrders.lbOrderId),
                sql`${bsvOrders.createdAt} > NOW() - (${MAX_SCAN_AGE_DAYS}::int * INTERVAL '1 day')`,
            ),
        )
        .limit(limit);
    result.scanned = pending.length;
    for (const row of pending) {
        try {
            const outcome = await reconcileOne(db, row);
            if (outcome === "delivered") result.delivered++;
            else if (outcome === "refunded") result.refunded++;
            else result.stillPending++;
        } catch (err) {
            result.errors.push({
                bsvOrderId: row.id,
                lbOrderId: row.lbOrderId,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // 2) Orphan sweep.
    const orphans = await db
        .select()
        .from(bsvOrders)
        .where(
            and(
                eq(bsvOrders.status, "PENDING_LOADBRAIN"),
                isNull(bsvOrders.lbOrderId),
                sql`${bsvOrders.createdAt} < NOW() - (${STALE_ORPHAN_MINUTES}::int * INTERVAL '1 minute')`,
            ),
        )
        .limit(limit);
    for (const row of orphans) {
        result.scanned++;
        try {
            await markRefundedBsv(db, row, "placement_orphan");
            result.refunded++;
        } catch (err) {
            result.errors.push({
                bsvOrderId: row.id,
                lbOrderId: null,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return result;
}

async function reconcileOne(
    db: DbLike,
    row: typeof bsvOrders.$inferSelect,
): Promise<Outcome> {
    if (!row.lbOrderId) return "pending";
    if (!lbV2) throw new Error("lbV2 not configured");
    const detail = (await lbV2.giftcards.orders.get(row.lbOrderId)) as {
        order?: { status?: string; wonSnapshot?: unknown };
        status?: string;
        codes?: ReadonlyArray<LbCode>;
        wonSnapshot?: unknown;
    };
    const upstreamStatus = String(
        detail.order?.status ?? detail.status ?? "",
    ).toLowerCase();
    if (upstreamStatus === "completed") {
        const snap = detail.order?.wonSnapshot ?? detail.wonSnapshot ?? null;
        await markDeliveredBsv(db, row, detail.codes ?? [], snap);
        return "delivered";
    }
    if (
        upstreamStatus === "failed" ||
        upstreamStatus === "cancelled" ||
        upstreamStatus === "refunded"
    ) {
        await markRefundedBsv(db, row, upstreamStatus);
        return "refunded";
    }
    // Manual-delivery SLA (#8): an order stuck non-terminal (awaiting_delivery /
    // processing) past the timeout is treated as undelivered → refund, so the
    // reseller is never charged indefinitely for an "on demand" item that never
    // arrived. Below the timeout, leave it for a later pass.
    const ageMs = row.createdAt
        ? Date.now() - new Date(row.createdAt).getTime()
        : 0;
    if (ageMs > MANUAL_DELIVERY_TIMEOUT_HOURS * 3_600_000) {
        await markRefundedBsv(db, row, `timeout_${upstreamStatus || "pending"}`);
        return "refunded";
    }
    return "pending";
}

async function markDeliveredBsv(
    db: DbLike,
    row: typeof bsvOrders.$inferSelect,
    codes: ReadonlyArray<LbCode>,
    wonSnapshot: unknown = null,
): Promise<void> {
    await db.transaction(async (tx) => {
        const [fresh] = await tx
            .select()
            .from(bsvOrders)
            .where(eq(bsvOrders.id, row.id))
            .for("update");
        if (!fresh || fresh.status !== "PENDING_LOADBRAIN") return;
        for (const c of codes) {
            await tx.insert(bsvDeliveredCodes).values({
                bsvOrderId: fresh.id,
                code: encrypt(c.code),
                redemptionUrl: c.redemptionUrl ?? null,
                pin: c.pin ? encrypt(c.pin) : null,
            });
        }
        await tx
            .update(bsvOrders)
            .set({
                status: "COMPLETED",
                completedAt: new Date(),
                wonSnapshot: (wonSnapshot ?? fresh.wonSnapshot) ?? undefined,
            })
            .where(eq(bsvOrders.id, fresh.id));
        await tx
            .update(orders)
            .set({ status: "LIVRE", isDelivered: true })
            .where(eq(orders.id, fresh.localOrderId));
    });
}

export async function markRefundedBsv(
    db: DbLike,
    row: typeof bsvOrders.$inferSelect,
    upstreamStatus: string,
): Promise<void> {
    await db.transaction(async (tx) => {
        // Same lock order as the webhook handler / UI refund: orders first.
        const [lockedOrder] = await tx
            .select({ status: orders.status })
            .from(orders)
            .where(eq(orders.id, row.localOrderId))
            .for("update");
        const [fresh] = await tx
            .select()
            .from(bsvOrders)
            .where(eq(bsvOrders.id, row.id))
            .for("update");
        if (!fresh || fresh.status !== "PENDING_LOADBRAIN") return;

        await tx
            .update(bsvOrders)
            .set({ status: "REFUNDED", completedAt: new Date() })
            .where(eq(bsvOrders.id, fresh.id));

        const reseller = await tx.query.resellers.findFirst({
            where: eq(resellers.id, fresh.resellerId),
            with: { wallet: true },
        });
        if (reseller?.wallet) {
            const refundAmount = parseFloat(fresh.pricePaidDzd);
            if (Number.isFinite(refundAmount) && refundAmount > 0) {
                await tx
                    .select()
                    .from(resellerWallets)
                    .where(eq(resellerWallets.id, reseller.wallet.id))
                    .for("update");
                await tx
                    .update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} + ${refundAmount}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerWallets.id, reseller.wallet.id));
                await tx.insert(resellerTransactions).values({
                    walletId: reseller.wallet.id,
                    type: "REFUND",
                    amount: refundAmount.toString(),
                    orderId: fresh.localOrderId,
                    description: `Remboursement BSV (reconciler: ${upstreamStatus})`,
                    source: "UPSTREAM_REFUND",
                });
            }
        }

        if (
            lockedOrder &&
            lockedOrder.status !== "REMBOURSE" &&
            lockedOrder.status !== "ANNULE"
        ) {
            await tx
                .update(orders)
                .set({ status: "ANNULE" })
                .where(eq(orders.id, fresh.localOrderId));
        }
    });
}
