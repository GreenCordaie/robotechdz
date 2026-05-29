import "server-only";
/**
 * IPTV reseller mirror — pure helpers around `reseller_iptv_orders`.
 *
 * LoadBrain only sees the shared `robotech` tenant; it has no notion of which
 * reseller owns which line/code/device. This module is the boundary that
 * enforces ownership (every read/write filters by `resellerId`) and the strict
 * state machine described below. The reconciler + webhook handler + server
 * actions all funnel through these helpers so the state transitions stay in
 * one place.
 *
 * State machine:
 *   PENDING_LOADBRAIN -> ACTIVE | FAILED | REFUNDED
 *   ACTIVE            -> FROZEN | EXPIRED | CANCELLED | REFUNDED
 *   FROZEN            -> ACTIVE | EXPIRED | CANCELLED | REFUNDED
 *   EXPIRED           -> ACTIVE (renewal) | CANCELLED
 *   CANCELLED         -> REFUNDED (terminal otherwise)
 *   FAILED, REFUNDED  -> terminal
 */

import {
    resellerIptvOrders,
    orders,
    resellerWallets,
    resellerTransactions,
} from "@/db/schema";
import { and, eq, ilike, or, desc, sql, count } from "drizzle-orm";
import type { db as defaultDb } from "@/db";
import { sanitizeProviderError } from "@/lib/sanitize-provider-error";

export type DbLike = typeof defaultDb;
type Tx = Parameters<Parameters<DbLike["transaction"]>[0]>[0];

export type IptvProvider = "panelking365" | "atlaspro" | "ironmax" | "ibosol";
export type IptvOrderStatus =
    | "PENDING_LOADBRAIN"
    | "ACTIVE"
    | "FROZEN"
    | "EXPIRED"
    | "CANCELLED"
    | "FAILED"
    | "REFUNDED";

const TERMINAL: ReadonlySet<IptvOrderStatus> = new Set<IptvOrderStatus>([
    "CANCELLED",
    "FAILED",
    "REFUNDED",
]);

/** Allowed forward transitions. Anything not listed here is rejected. */
const TRANSITIONS: Record<IptvOrderStatus, ReadonlyArray<IptvOrderStatus>> = {
    PENDING_LOADBRAIN: ["ACTIVE", "FAILED", "REFUNDED"],
    ACTIVE: ["FROZEN", "EXPIRED", "CANCELLED", "REFUNDED"],
    FROZEN: ["ACTIVE", "EXPIRED", "CANCELLED", "REFUNDED"],
    EXPIRED: ["ACTIVE", "CANCELLED"],
    CANCELLED: ["REFUNDED"],
    FAILED: [],
    REFUNDED: [],
};

export function canTransition(from: IptvOrderStatus, to: IptvOrderStatus): boolean {
    if (from === to) return true;
    return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: IptvOrderStatus): boolean {
    return TERMINAL.has(status);
}

/* ───────────────────────── Reads ───────────────────────── */

export async function getResellerIptvOrder(
    db: DbLike,
    { id, resellerId }: { id: number; resellerId: number },
) {
    const [row] = await db
        .select()
        .from(resellerIptvOrders)
        .where(
            and(
                eq(resellerIptvOrders.id, id),
                eq(resellerIptvOrders.resellerId, resellerId),
            ),
        )
        .limit(1);
    return row ?? null;
}

export interface ListIptvOrdersFilters {
    provider?: IptvProvider;
    status?: IptvOrderStatus;
    search?: string;
}

export interface Pagination {
    page: number;
    limit: number;
}

export async function listResellerIptvOrders(
    db: DbLike,
    {
        resellerId,
        filters = {},
        pagination,
    }: {
        resellerId: number;
        filters?: ListIptvOrdersFilters;
        pagination: Pagination;
    },
) {
    const page = Math.max(1, Math.floor(pagination.page));
    const limit = Math.max(1, Math.min(200, Math.floor(pagination.limit)));
    const offset = (page - 1) * limit;

    const conds = [eq(resellerIptvOrders.resellerId, resellerId)];
    if (filters.provider) {
        conds.push(eq(resellerIptvOrders.provider, filters.provider));
    }
    if (filters.status) {
        conds.push(eq(resellerIptvOrders.status, filters.status));
    }
    if (filters.search && filters.search.trim().length > 0) {
        const q = `%${filters.search.trim()}%`;
        const searchOr = or(
            ilike(resellerIptvOrders.customerLabel, q),
            ilike(resellerIptvOrders.customerPhone, q),
            ilike(resellerIptvOrders.providerAccountId, q),
            ilike(resellerIptvOrders.upstreamLineId, q),
        );
        if (searchOr) conds.push(searchOr);
    }

    const where = and(...conds);

    const [items, totalRow] = await Promise.all([
        db
            .select()
            .from(resellerIptvOrders)
            .where(where)
            .orderBy(desc(resellerIptvOrders.createdAt))
            .limit(limit)
            .offset(offset),
        db
            .select({ value: count() })
            .from(resellerIptvOrders)
            .where(where),
    ]);

    const total = Number(totalRow[0]?.value ?? 0);
    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

/* ───────────────────────── Writes ───────────────────────── */

export interface InsertPendingInput {
    localOrderId: number;
    resellerId: number;
    provider: IptvProvider;
    productId: string;
    productName: string;
    productSnapshot?: unknown;
    quantity?: number;
    pricePaidDzd: number;
    customerLabel?: string | null;
    customerPhone?: string | null;
}

/**
 * Insert a fresh PENDING_LOADBRAIN row. Designed to run INSIDE the same db
 * transaction that debits the reseller wallet — atomicity is the caller's
 * responsibility. Returns the new row id.
 */
export async function insertPendingIptvOrder(
    tx: Tx,
    input: InsertPendingInput,
): Promise<number> {
    const [inserted] = await tx
        .insert(resellerIptvOrders)
        .values({
            localOrderId: input.localOrderId,
            resellerId: input.resellerId,
            provider: input.provider,
            productId: input.productId,
            productName: input.productName,
            productSnapshot: (input.productSnapshot as object | null) ?? null,
            quantity: input.quantity ?? 1,
            pricePaidDzd: input.pricePaidDzd.toFixed(2),
            customerLabel: input.customerLabel ?? null,
            customerPhone: input.customerPhone ?? null,
            status: "PENDING_LOADBRAIN",
        })
        .returning({ id: resellerIptvOrders.id });
    return inserted.id;
}

export async function attachLbIdentifiers(
    db: DbLike,
    {
        id,
        resellerId,
        lbTaskId,
        lbOrderId,
    }: {
        id: number;
        resellerId: number;
        lbTaskId?: string | null;
        lbOrderId?: string | null;
    },
): Promise<void> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (lbTaskId !== undefined) patch.lbTaskId = lbTaskId;
    if (lbOrderId !== undefined) patch.lbOrderId = lbOrderId;
    await db
        .update(resellerIptvOrders)
        .set(patch)
        .where(
            and(
                eq(resellerIptvOrders.id, id),
                eq(resellerIptvOrders.resellerId, resellerId),
            ),
        );
}

export interface MarkDeliveredInput {
    id: number;
    resellerId: number;
    upstreamLineId?: string | null;
    providerAccountId?: string | null;
    expiresAt?: Date | null;
    snapshot?: unknown;
}

/**
 * PENDING_LOADBRAIN -> ACTIVE. Uses `FOR UPDATE` row lock + state guard so we
 * never overwrite a terminal status that arrived first (e.g. webhook race
 * with reconciler).
 */
export async function markIptvOrderDelivered(
    db: DbLike,
    input: MarkDeliveredInput,
): Promise<{ updated: boolean; reason?: string }> {
    return db.transaction(async (tx) => {
        const [fresh] = await tx
            .select()
            .from(resellerIptvOrders)
            .where(
                and(
                    eq(resellerIptvOrders.id, input.id),
                    eq(resellerIptvOrders.resellerId, input.resellerId),
                ),
            )
            .for("update");
        if (!fresh) return { updated: false, reason: "not_found" };
        const current = fresh.status as IptvOrderStatus;
        if (current === "ACTIVE") return { updated: false, reason: "already_active" };
        if (!canTransition(current, "ACTIVE")) {
            return { updated: false, reason: `cannot_transition_${current}_to_ACTIVE` };
        }
        const now = new Date();
        await tx
            .update(resellerIptvOrders)
            .set({
                status: "ACTIVE",
                lastStatusAt: now,
                lastSyncedAt: now,
                completedAt: now,
                upstreamLineId:
                    input.upstreamLineId !== undefined
                        ? input.upstreamLineId
                        : fresh.upstreamLineId,
                providerAccountId:
                    input.providerAccountId !== undefined
                        ? input.providerAccountId
                        : fresh.providerAccountId,
                expiresAt:
                    input.expiresAt !== undefined ? input.expiresAt : fresh.expiresAt,
                productSnapshot:
                    input.snapshot !== undefined
                        ? (input.snapshot as object | null)
                        : (fresh.productSnapshot as object | null),
                lastError: null,
                updatedAt: now,
            })
            .where(eq(resellerIptvOrders.id, input.id));
        await tx
            .update(orders)
            .set({ status: "LIVRE", isDelivered: true })
            .where(eq(orders.id, fresh.localOrderId));
        return { updated: true };
    });
}

/**
 * Auto-refund on failure is reserved for NEVER-DELIVERED lines. Mirrors the
 * G2Bulk reconciler (markRefunded only acts on PENDING_LOADBRAIN).
 */
export function shouldAutoRefundOnFail(status: IptvOrderStatus): boolean {
    return status === "PENDING_LOADBRAIN";
}

/**
 * Marks an IPTV reseller order FAILED (terminal). Automatic wallet refund is
 * applied ONLY when the line was never delivered (PENDING_LOADBRAIN);
 * already-delivered lines (ACTIVE/FROZEN/EXPIRED) are marked FAILED WITHOUT a
 * refund — refunding a consumed service would lose money. A genuine refund for
 * a delivered line goes through the manual return workflow.
 * Idempotent: if already FAILED or REFUNDED, returns without re-crediting.
 */
export async function markIptvOrderFailed(
    db: DbLike,
    {
        id,
        resellerId,
        reason,
    }: { id: number; resellerId: number; reason: string },
): Promise<{ updated: boolean; refunded: boolean; reason?: string }> {
    return db.transaction(async (tx) => {
        const [fresh] = await tx
            .select()
            .from(resellerIptvOrders)
            .where(
                and(
                    eq(resellerIptvOrders.id, id),
                    eq(resellerIptvOrders.resellerId, resellerId),
                ),
            )
            .for("update");
        if (!fresh) return { updated: false, refunded: false, reason: "not_found" };
        const current = fresh.status as IptvOrderStatus;
        if (current === "FAILED" || current === "REFUNDED") {
            return { updated: false, refunded: false, reason: "already_terminal" };
        }

        // Reseller-facing: lastError is rendered in IptvLineDetailModal and the
        // refund line shows in their ledger. Sanitize the raw upstream reason so
        // we never leak provider names / internal URLs (same treatment as the
        // B2C provision path in iptv-webhook-processor).
        const safeReason = sanitizeProviderError(reason);

        const amount = parseFloat(fresh.pricePaidDzd);
        let refunded = false;
        // H1: refund ONLY never-delivered (PENDING_LOADBRAIN) lines. A delivered
        // line cancelled upstream is still marked FAILED below, but not refunded.
        if (shouldAutoRefundOnFail(current) && Number.isFinite(amount) && amount > 0) {
            const [wallet] = await tx
                .select()
                .from(resellerWallets)
                .where(eq(resellerWallets.resellerId, resellerId))
                .for("update");
            if (wallet) {
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
                    orderId: fresh.localOrderId,
                    description: `Remboursement IPTV (${fresh.provider}) — ${safeReason}`.slice(
                        0,
                        500,
                    ),
                });
                refunded = true;
            }
        }

        const now = new Date();
        await tx
            .update(resellerIptvOrders)
            .set({
                status: "FAILED",
                lastStatusAt: now,
                lastSyncedAt: now,
                lastError: safeReason,
                refundedAt: refunded ? now : fresh.refundedAt,
                updatedAt: now,
            })
            .where(eq(resellerIptvOrders.id, id));

        await tx
            .update(orders)
            .set({ status: "REMBOURSE" })
            .where(eq(orders.id, fresh.localOrderId));

        return { updated: true, refunded };
    });
}

/**
 * Generic forward transition (ACTIVE↔FROZEN, ACTIVE→EXPIRED, etc.). Refuses
 * to downgrade from terminal statuses (CANCELLED/REFUNDED/FAILED).
 */
export async function setIptvOrderStatus(
    db: DbLike,
    {
        id,
        resellerId,
        status,
    }: { id: number; resellerId: number; status: IptvOrderStatus },
): Promise<{ updated: boolean; reason?: string }> {
    return db.transaction(async (tx) => {
        const [fresh] = await tx
            .select()
            .from(resellerIptvOrders)
            .where(
                and(
                    eq(resellerIptvOrders.id, id),
                    eq(resellerIptvOrders.resellerId, resellerId),
                ),
            )
            .for("update");
        if (!fresh) return { updated: false, reason: "not_found" };
        const current = fresh.status as IptvOrderStatus;
        if (current === status) return { updated: false, reason: "no_change" };
        if (isTerminal(current) && current !== "CANCELLED") {
            return { updated: false, reason: `terminal_${current}` };
        }
        if (!canTransition(current, status)) {
            return { updated: false, reason: `cannot_transition_${current}_to_${status}` };
        }
        const now = new Date();
        const patch: Record<string, unknown> = {
            status,
            lastStatusAt: now,
            lastSyncedAt: now,
            updatedAt: now,
        };
        if (status === "CANCELLED") patch.cancelledAt = now;
        if (status === "REFUNDED") patch.refundedAt = now;

        await tx
            .update(resellerIptvOrders)
            .set(patch)
            .where(eq(resellerIptvOrders.id, id));
        return { updated: true };
    });
}
