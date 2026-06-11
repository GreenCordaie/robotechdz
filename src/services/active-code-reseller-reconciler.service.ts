import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
    activeCodeOrders,
    orders,
    resellerTransactions,
    resellerWallets,
    resellers,
} from "@/db/schema";

/**
 * Active Code reconciler.
 *
 * The inline purchase flow (`purchaseActiveCodeAction`) only polls LoadBrain
 * for 60s. Panels behind Cloudflare/FlareSolverr can resolve LATER than that
 * — or fail after the window — leaving the order in PENDING_LOADBRAIN with the
 * wallet already debited and no code, no refund. This reconciler closes that
 * gap: it re-queries LoadBrain for each lingering PENDING order and either
 * delivers the late code or refunds the failed/stuck one.
 *
 * Intended to run on a cron tick (every few minutes) via the admin route.
 */

// Skip orders younger than this — the inline 60s poll may still be running.
const MIN_AGE_MS = 120_000;
// queued/processing beyond this is treated as stuck → refund (panel won't
// realistically deliver a code 30 min later, and the wallet stays debited).
const HARD_TIMEOUT_MS = 30 * 60_000;
// Don't scan ancient rows — anything this old has been handled or written off.
const RETENTION_MS = 14 * 24 * 60 * 60_000;

interface LbTask {
    status?: "queued" | "processing" | "completed" | "failed";
    result?: { code?: string; extraCodes?: readonly string[] } | null;
    error?: string | null;
}

function resolveLoadBrainAuth(): { baseUrl: string; apiKey: string } | null {
    const apiKey = process.env.LOADBRAIN_API_KEY;
    const baseUrl = process.env.LOADBRAIN_URL;
    if (!apiKey || !baseUrl) return null;
    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function fetchStatus(
    auth: { baseUrl: string; apiKey: string },
    lbOrderId: string,
): Promise<LbTask | null> {
    try {
        const res = await fetch(
            `${auth.baseUrl}/api/v1/giftcards/reseller-order/active-code/${encodeURIComponent(lbOrderId)}/status`,
            { headers: { "X-API-Key": auth.apiKey }, cache: "no-store" },
        );
        if (!res.ok) return null;
        const j = (await res.json()) as { data?: LbTask };
        return j.data ?? null;
    } catch {
        return null;
    }
}

async function deliver(acoId: number, code: string): Promise<void> {
    await db
        .update(activeCodeOrders)
        .set({ status: "DELIVERED", code, updatedAt: new Date() })
        .where(eq(activeCodeOrders.id, acoId));
}

/**
 * Idempotent refund — mirrors `refundActiveCodeOrder` in the storefront
 * action. Locks the tracking row first and no-ops if already REFUNDED so a
 * concurrent inline failure + reconciler pass cannot double-credit.
 */
async function refund(
    acoId: number,
    localOrderId: number,
    resellerId: number,
    priceDzd: number,
    reason: string,
): Promise<void> {
    await db.transaction(async (tx) => {
        const [locked] = await tx
            .select({ status: activeCodeOrders.status })
            .from(activeCodeOrders)
            .where(eq(activeCodeOrders.id, acoId))
            .for("update");
        if (!locked || locked.status === "REFUNDED") return;

        const r = await tx.query.resellers.findFirst({
            where: eq(resellers.id, resellerId),
            with: { wallet: true },
        });
        if (r?.wallet) {
            await tx
                .update(resellerWallets)
                .set({
                    balance: sql`${resellerWallets.balance} + ${priceDzd}`,
                    totalSpent: sql`GREATEST(${resellerWallets.totalSpent} - ${priceDzd}, 0)`,
                    updatedAt: new Date(),
                })
                .where(eq(resellerWallets.id, r.wallet.id));
            await tx.insert(resellerTransactions).values({
                walletId: r.wallet.id,
                type: "REFUND",
                amount: priceDzd.toString(),
                orderId: localOrderId,
                description: `Active Code refund (reconciler) — ${reason.slice(0, 180)}`,
                source: "ACTIVE_CODE",
            });
        }
        await tx.update(orders).set({ status: "REMBOURSE" }).where(eq(orders.id, localOrderId));
        await tx
            .update(activeCodeOrders)
            .set({ status: "REFUNDED", error: reason.slice(0, 1000), updatedAt: new Date() })
            .where(eq(activeCodeOrders.id, acoId));
    });
}

export interface ReconcileResult {
    scanned: number;
    delivered: number;
    refunded: number;
    stillPending: number;
    ranAt: string;
    skipped?: string;
}

export async function reconcilePendingActiveCodeOrders(
    { limit = 100 }: { limit?: number } = {},
): Promise<ReconcileResult> {
    const ranAt = new Date().toISOString();
    const auth = resolveLoadBrainAuth();
    if (!auth) {
        return { scanned: 0, delivered: 0, refunded: 0, stillPending: 0, ranAt, skipped: "no-loadbrain-config" };
    }

    const now = Date.now();
    const rows = await db.query.activeCodeOrders.findMany({
        where: and(
            eq(activeCodeOrders.status, "PENDING_LOADBRAIN"),
            gt(activeCodeOrders.createdAt, new Date(now - RETENTION_MS)),
        ),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
        limit,
    });

    let scanned = 0;
    let delivered = 0;
    let refunded = 0;
    let stillPending = 0;

    for (const row of rows) {
        const ageMs = now - new Date(row.createdAt).getTime();
        if (ageMs < MIN_AGE_MS) {
            stillPending++;
            continue;
        }
        scanned++;
        const priceDzd = parseFloat(row.pricePaidDzd);
        const task = await fetchStatus(auth, row.lbOrderId);
        if (!task) {
            stillPending++;
            continue;
        }
        if (task.status === "completed" && task.result?.code) {
            await deliver(row.id, task.result.code);
            delivered++;
            continue;
        }
        if (task.status === "failed") {
            await refund(row.id, row.localOrderId, row.resellerId, priceDzd, task.error ?? "provisioning failed");
            refunded++;
            continue;
        }
        // queued / processing: refund only once clearly stuck.
        if (ageMs > HARD_TIMEOUT_MS) {
            await refund(
                row.id,
                row.localOrderId,
                row.resellerId,
                priceDzd,
                `stuck ${task.status ?? "pending"} > ${Math.round(HARD_TIMEOUT_MS / 60000)}min`,
            );
            refunded++;
            continue;
        }
        stillPending++;
    }

    return { scanned, delivered, refunded, stillPending, ranAt };
}
