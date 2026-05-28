import "server-only";
import { db as defaultDb } from "@/db";
import {
    g2bulkOrders,
    g2bulkDeliveredCodes,
    orders,
    resellerWallets,
    resellerTransactions,
} from "@/db/schema";
import { eq, and, isNotNull, isNull, inArray, sql } from "drizzle-orm";
import { lbV2 } from "@/lib/loadbrain-v2";
import { encrypt } from "@/lib/encryption";

export type ReconcileResult = {
    scanned: number;
    delivered: number;
    refunded: number;
    stillPending: number;
    errors: Array<{ g2bulkOrderId: number; lbOrderId: string | null; reason: string }>;
};

type DbLike = typeof defaultDb;
type Outcome = "delivered" | "refunded" | "pending";

const MAX_SCAN_AGE_DAYS = 7;

export async function reconcilePendingG2BulkOrders(
    options: { dbInstance?: DbLike; limit?: number } = {},
): Promise<ReconcileResult> {
    const db = options.dbInstance ?? defaultDb;
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const result: ReconcileResult = {
        scanned: 0,
        delivered: 0,
        refunded: 0,
        stillPending: 0,
        errors: [],
    };
    if (!lbV2) {
        result.errors.push({
            g2bulkOrderId: 0,
            lbOrderId: null,
            reason: "LoadBrain SDK not configured (LOADBRAIN_API_KEY missing)",
        });
        return result;
    }
    const pending = await db
        .select()
        .from(g2bulkOrders)
        .where(
            and(
                eq(g2bulkOrders.status, "PENDING_LOADBRAIN"),
                isNotNull(g2bulkOrders.lbOrderId),
                sql`${g2bulkOrders.createdAt} > NOW() - (${MAX_SCAN_AGE_DAYS}::int * INTERVAL '1 day')`,
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
                g2bulkOrderId: row.id,
                lbOrderId: row.lbOrderId,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // Orphan sweep — rows debited whose upstream placement never recorded an
    // lbOrderId (e.g. a crash in the checkout between the debit commit and the
    // HTTP call). After a safety delay they cannot still be a legit in-flight
    // placement → refund (markRefunded is idempotent on the status guard).
    const STALE_ORPHAN_MINUTES = 15;
    const orphans = await db
        .select()
        .from(g2bulkOrders)
        .where(
            and(
                eq(g2bulkOrders.status, "PENDING_LOADBRAIN"),
                isNull(g2bulkOrders.lbOrderId),
                sql`${g2bulkOrders.createdAt} < NOW() - (${STALE_ORPHAN_MINUTES}::int * INTERVAL '1 minute')`,
            ),
        )
        .limit(limit);
    for (const row of orphans) {
        result.scanned++;
        try {
            await markRefunded(db, row, "placement_orphan");
            result.refunded++;
        } catch (err) {
            result.errors.push({
                g2bulkOrderId: row.id,
                lbOrderId: null,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return result;
}

async function reconcileOne(
    db: DbLike,
    g2bRow: typeof g2bulkOrders.$inferSelect,
): Promise<Outcome> {
    if (!g2bRow.lbOrderId) return "pending";
    if (!lbV2) throw new Error("lbV2 not configured");
    const detail = await lbV2.g2bulk.orders.get(g2bRow.lbOrderId);
    const upstreamStatus = String(detail.order?.status ?? "").toLowerCase();
    if (upstreamStatus === "completed") {
        // Pull the upstream wonSnapshot (title, providerOrderId, exactPriceCents,
        // playerName for game orders, etc.) so the reseller list can render
        // human names instead of "Produit 47". The shape is opaque from our
        // side — we mirror whatever LoadBrain wrote.
        const snap =
            (detail.order as { wonSnapshot?: unknown } | undefined)
                ?.wonSnapshot ?? null;
        await markDelivered(db, g2bRow, detail.codes, snap);
        return "delivered";
    }
    if (
        upstreamStatus === "failed" ||
        upstreamStatus === "cancelled" ||
        upstreamStatus === "refunded"
    ) {
        await markRefunded(db, g2bRow, upstreamStatus);
        return "refunded";
    }
    return "pending";
}

async function markDelivered(
    db: DbLike,
    g2bRow: typeof g2bulkOrders.$inferSelect,
    codes: ReadonlyArray<{
        index: number;
        code: string;
        redemptionUrl?: string | null;
        pin?: string | null;
    }>,
    wonSnapshot: unknown = null,
): Promise<void> {
    await db.transaction(async (tx) => {
        const [fresh] = await tx
            .select()
            .from(g2bulkOrders)
            .where(eq(g2bulkOrders.id, g2bRow.id))
            .for("update");
        if (!fresh || fresh.status !== "PENDING_LOADBRAIN") return;
        if (codes.length > 0) {
            await tx.insert(g2bulkDeliveredCodes).values(
                codes.map((c) => ({
                    g2bulkOrderId: g2bRow.id,
                    code: encrypt(c.code),
                    redemptionUrl: c.redemptionUrl ?? null,
                    pin: c.pin ?? null,
                })),
            );
        }
        await tx
            .update(g2bulkOrders)
            .set({
                status: "COMPLETED",
                completedAt: new Date(),
                wonSnapshot: wonSnapshot ?? fresh.wonSnapshot ?? null,
            })
            .where(eq(g2bulkOrders.id, g2bRow.id));
        await tx
            .update(orders)
            .set({ status: "TERMINE" })
            .where(eq(orders.id, g2bRow.localOrderId));
    });
}

export async function markRefunded(
    db: DbLike,
    g2bRow: typeof g2bulkOrders.$inferSelect,
    upstreamStatus: string,
): Promise<void> {
    await db.transaction(async (tx) => {
        const [fresh] = await tx
            .select()
            .from(g2bulkOrders)
            .where(eq(g2bulkOrders.id, g2bRow.id))
            .for("update");
        if (!fresh || fresh.status !== "PENDING_LOADBRAIN") return;
        const amount = parseFloat(g2bRow.pricePaidDzd);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error(`invalid pricePaidDzd: ${g2bRow.pricePaidDzd}`);
        }
        const [wallet] = await tx
            .select()
            .from(resellerWallets)
            .where(eq(resellerWallets.resellerId, g2bRow.resellerId))
            .for("update");
        if (!wallet) throw new Error(`wallet not found for reseller ${g2bRow.resellerId}`);
        await tx
            .update(resellerWallets)
            .set({
                balance: sql`${resellerWallets.balance} + ${amount}`,
                totalSpent: sql`GREATEST(0, ${resellerWallets.totalSpent} - ${amount})`,
                updatedAt: new Date(),
            })
            .where(eq(resellerWallets.id, wallet.id));
        await tx.insert(resellerTransactions).values({
            walletId: wallet.id,
            type: "REFUND",
            amount: amount.toFixed(2),
            description: `Remboursement G2Bulk (upstream ${upstreamStatus})`,
            orderId: g2bRow.localOrderId,
        });
        await tx
            .update(g2bulkOrders)
            .set({ status: "REFUNDED", completedAt: new Date() })
            .where(eq(g2bulkOrders.id, g2bRow.id));
        await tx
            .update(orders)
            .set({ status: "REMBOURSE" })
            .where(eq(orders.id, g2bRow.localOrderId));
    });
}

export async function reconcileG2BulkOrderById(
    id: number,
    options: { dbInstance?: DbLike } = {},
): Promise<Outcome | { error: string }> {
    const db = options.dbInstance ?? defaultDb;
    if (!lbV2) return { error: "LoadBrain SDK not configured" };
    const [row] = await db.select().from(g2bulkOrders).where(eq(g2bulkOrders.id, id));
    if (!row) return { error: "g2bulk_order not found" };
    if (row.status !== "PENDING_LOADBRAIN") return { error: `already ${row.status}` };
    try {
        return await reconcileOne(db, row);
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
