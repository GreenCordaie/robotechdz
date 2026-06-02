import { createWebhookHandler } from "@loadbrain/sdk-v2";
import {
    processCompletedTask,
    processFailedTask,
} from "@/lib/iptv-webhook-processor";
import { db } from "@/db";
import {
    bsvOrders,
    bsvDeliveredCodes,
    g2bulkOrders,
    g2bulkDeliveredCodes,
    orders,
    resellerWallets,
    resellerTransactions,
    resellers,
    resellerIptvOrders,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import {
    markIptvOrderDelivered,
    markIptvOrderFailed,
    setIptvOrderStatus,
} from "@/services/iptv-reseller.service";

/**
 * Reseller IPTV mirror dispatch — fired AFTER the legacy IPTV processor so
 * the new `reseller_iptv_orders` mirror gets the same task lifecycle updates
 * the legacy `iptv_provisions` table receives. No-op when the task isn't
 * owned by a reseller mirror row (covers the legacy B2C-only flow).
 */
async function dispatchIptvMirror(
    taskId: string,
    kind: "completed" | "failed" | "cancelled",
    event: { data: Record<string, unknown>; timestamp?: string },
): Promise<void> {
    if (!taskId) return;
    const [row] = await db
        .select()
        .from(resellerIptvOrders)
        .where(eq(resellerIptvOrders.lbTaskId, taskId));
    if (!row) return; // legacy B2C path — already handled by processCompletedTask

    if (kind === "completed") {
        const creds = (event.data.credentials ?? null) as
            | Record<string, unknown>
            | null;
        const pickStr = (...c: unknown[]): string | null => {
            for (const v of c) {
                if (typeof v === "string" && v.trim()) return v.trim();
                if (typeof v === "number" && Number.isFinite(v)) return String(v);
            }
            return null;
        };
        const expiryRaw =
            (creds?.expiresAt as unknown) ??
            (event.data.expiresAt as unknown) ??
            null;
        const expiry = expiryRaw
            ? new Date(String(expiryRaw))
            : null;
        await markIptvOrderDelivered(db, {
            id: row.id,
            resellerId: row.resellerId,
            upstreamLineId: pickStr(creds?.lineId, creds?.id, event.data.lineId),
            providerAccountId: pickStr(
                creds?.username,
                creds?.account,
                creds?.mac,
                creds?.accountId,
            ),
            expiresAt: expiry && Number.isFinite(expiry.getTime()) ? expiry : null,
            snapshot: event,
        });
    } else if (kind === "failed") {
        const reason =
            typeof event.data.error === "string"
                ? (event.data.error as string)
                : `task ${kind}`;
        await markIptvOrderFailed(db, {
            id: row.id,
            resellerId: row.resellerId,
            reason,
        });
    } else {
        await setIptvOrderStatus(db, {
            id: row.id,
            resellerId: row.resellerId,
            status: "CANCELLED",
        });
    }
}

// ──────────────────────────────────────────────────────────────────────────
// G2Bulk event handlers — extracted from the handlers map so we can keep
// them outside the SDK's strictly-typed WebhookEventName union (g2bulk.*
// events aren't yet in the SDK's union). Until the SDK ships them, we
// register via a widened cast at the call site.
// ──────────────────────────────────────────────────────────────────────────
type G2BulkDeliveredEvent = {
    data: {
        orderId: string;
        codes: ReadonlyArray<{
            index?: number;
            code: string;
            redemptionUrl?: string | null;
            pin?: string | null;
        }>;
        wonSnapshot?: unknown;
    };
    timestamp?: string;
};

type G2BulkFailedEvent = {
    data: {
        orderId: string;
        error?: string;
    };
    timestamp?: string;
};

async function handleG2BulkDelivered(event: G2BulkDeliveredEvent): Promise<void> {
    const lbOrderId = event.data.orderId;
    const codes = event.data.codes ?? [];
    const wonSnapshot = event.data.wonSnapshot ?? null;

    const [localG2bulkOrder] = await db
        .select()
        .from(g2bulkOrders)
        .where(eq(g2bulkOrders.lbOrderId, lbOrderId));

    if (!localG2bulkOrder) {
        console.warn(
            "[v2-webhook] g2bulk.order.delivered for unknown lbOrderId:",
            lbOrderId,
        );
        return;
    }

    const processed = await db.transaction(async (tx) => {
        // Idempotency guard: re-read the row under FOR UPDATE and only act on a
        // still-pending order. A replayed/duplicate webhook (already COMPLETED or
        // REFUNDED) becomes a no-op — prevents duplicate delivered-code rows and
        // races with the reconciler. Mirrors g2bulk-reconciler.markDelivered.
        const [fresh] = await tx
            .select()
            .from(g2bulkOrders)
            .where(eq(g2bulkOrders.id, localG2bulkOrder.id))
            .for("update");
        if (!fresh || fresh.status !== "PENDING_LOADBRAIN") return false;

        for (const c of codes) {
            await tx.insert(g2bulkDeliveredCodes).values({
                g2bulkOrderId: fresh.id,
                code: encrypt(c.code),
                redemptionUrl: c.redemptionUrl ?? null,
                pin: c.pin ? encrypt(c.pin) : null,
            });
        }

        await tx
            .update(g2bulkOrders)
            .set({
                status: "COMPLETED",
                completedAt: new Date(),
                // Merge (not replace) so checkout-time fields (title, playerName
                // for game top-ups) survive when upstream sends its own snapshot.
                wonSnapshot: wonSnapshot
                    ? {
                          ...((fresh.wonSnapshot as Record<string, unknown> | null) ?? {}),
                          ...(wonSnapshot as Record<string, unknown>),
                      }
                    : undefined,
            })
            .where(eq(g2bulkOrders.id, fresh.id));

        await tx
            .update(orders)
            .set({ status: "LIVRE", isDelivered: true })
            .where(eq(orders.id, fresh.localOrderId));
        return true;
    });

    if (!processed) {
        console.warn(
            "[v2-webhook] g2bulk.order.delivered ignored (already processed):",
            lbOrderId,
        );
        return;
    }

    // Best-effort WhatsApp notification — non-blocking.
    try {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.id, localG2bulkOrder.resellerId),
        });
        const localOrder = await db.query.orders.findFirst({
            where: eq(orders.id, localG2bulkOrder.localOrderId),
        });
        if (reseller?.contactPhone && localOrder) {
            const notifModule = (await import(
                "@/services/reseller-notifications.service"
            )) as unknown as {
                ResellerNotifications: Record<
                    string,
                    ((arg: unknown) => Promise<unknown>) | undefined
                >;
            };
            const notify = notifModule.ResellerNotifications.notifyOrderDelivered;
            if (typeof notify === "function") {
                await notify({
                    resellerId: reseller.id,
                    companyName: reseller.companyName,
                    contactPhone: reseller.contactPhone,
                    orderNumber: localOrder.orderNumber,
                    codeCount: codes.length,
                }).catch((err: unknown) => {
                    console.warn(
                        "[v2-webhook] g2bulk notifyOrderDelivered failed (non-bloquant):",
                        err,
                    );
                });
            }
        }
    } catch (err) {
        console.warn("[v2-webhook] g2bulk notify wiring failed:", err);
    }
}

async function handleG2BulkFailed(event: G2BulkFailedEvent): Promise<void> {
    const lbOrderId = event.data.orderId;
    const errorMsg = event.data.error ?? "unknown error";

    const [localG2bulkOrder] = await db
        .select()
        .from(g2bulkOrders)
        .where(eq(g2bulkOrders.lbOrderId, lbOrderId));

    if (!localG2bulkOrder) {
        console.warn(
            "[v2-webhook] g2bulk.order.failed for unknown lbOrderId:",
            lbOrderId,
        );
        return;
    }

    await db.transaction(async (tx) => {
        // Idempotency guard: re-read under FOR UPDATE and only refund a still-pending
        // order. Already COMPLETED or REFUNDED → no-op, so a retried `failed`/`refunded`
        // webhook can't credit the wallet twice. Mirrors g2bulk-reconciler.markRefunded.
        const [fresh] = await tx
            .select()
            .from(g2bulkOrders)
            .where(eq(g2bulkOrders.id, localG2bulkOrder.id))
            .for("update");
        if (!fresh || fresh.status !== "PENDING_LOADBRAIN") return;

        await tx
            .update(g2bulkOrders)
            .set({ status: "REFUNDED", completedAt: new Date() })
            .where(eq(g2bulkOrders.id, fresh.id));

        const reseller = await tx.query.resellers.findFirst({
            where: eq(resellers.id, fresh.resellerId),
            with: { wallet: true },
        });

        if (reseller?.wallet) {
            const refundAmount = parseFloat(fresh.pricePaidDzd);
            // Lock the wallet row before crediting (consistency with reconciler).
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
                description: `Remboursement G2Bulk - échec livraison: ${errorMsg}`,
                source: "UPSTREAM_REFUND",
            });
        }

        await tx
            .update(orders)
            .set({ status: "ANNULE" })
            .where(eq(orders.id, fresh.localOrderId));
    });

    // Best-effort failure notification
    try {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.id, localG2bulkOrder.resellerId),
        });
        const localOrder = await db.query.orders.findFirst({
            where: eq(orders.id, localG2bulkOrder.localOrderId),
        });
        if (reseller?.contactPhone && localOrder) {
            const notifModule = (await import(
                "@/services/reseller-notifications.service"
            )) as unknown as {
                ResellerNotifications: Record<
                    string,
                    ((arg: unknown) => Promise<unknown>) | undefined
                >;
            };
            const notify =
                notifModule.ResellerNotifications.notifyOrderFailed ??
                notifModule.ResellerNotifications.notifyOrderCancelled;
            if (typeof notify === "function") {
                await notify({
                    resellerId: reseller.id,
                    companyName: reseller.companyName,
                    contactPhone: reseller.contactPhone,
                    orderNumber: localOrder.orderNumber,
                    reason: errorMsg,
                }).catch((err: unknown) => {
                    console.warn(
                        "[v2-webhook] g2bulk failure notify failed (non-bloquant):",
                        err,
                    );
                });
            }
        }
    } catch (err) {
        console.warn("[v2-webhook] g2bulk failure notify wiring failed:", err);
    }

    console.warn(
        "[v2-webhook] g2bulk.order.failed processed:",
        lbOrderId,
        errorMsg,
    );
}

/**
 * SDK v2 webhook entry point. Lives side-by-side with the legacy
 * /api/loadbrain/webhook (manual HMAC verification). Once v2 is verified in
 * prod, the legacy handler can be retired.
 *
 * Signature verification, replay protection, and timestamp tolerance are
 * delegated to `createWebhookHandler` from the SDK.
 */
const handler = createWebhookHandler({
    secret: process.env.LOADBRAIN_WEBHOOK_SECRET ?? "",
    toleranceSeconds: 300,
    // SWAP WHEN sdk-v2 g2bulk webhook events land: drop the `as never` cast
    // once `WebhookEventName` includes "g2bulk.order.delivered" |
    // "g2bulk.order.failed" | "g2bulk.order.refunded".
    handlers: {
        // ────────────────────────────────────────────────────────────────
        // G2Bulk Mirror Shop (Lot 4) — same shape as BSV handlers, dedicated
        // tables (g2bulk_orders / g2bulk_delivered_codes).
        // ────────────────────────────────────────────────────────────────
        ["g2bulk.order.delivered" as never]: (async (event: G2BulkDeliveredEvent) =>
            handleG2BulkDelivered(event)) as never,
        ["g2bulk.order.failed" as never]: (async (event: G2BulkFailedEvent) =>
            handleG2BulkFailed(event)) as never,
        // Refund flow is identical to failed (refund + mark REFUNDED).
        ["g2bulk.order.refunded" as never]: (async (event: G2BulkFailedEvent) =>
            handleG2BulkFailed(event)) as never,

        "provision.task.completed": async (event) => {
            await processCompletedTask({
                orderId: event.data.taskId,
                status: "completed",
                credentials: event.data.credentials,
                completedAt: event.timestamp,
            });
            // Reseller mirror — additive, no-op for legacy B2C tasks.
            try {
                await dispatchIptvMirror(
                    event.data.taskId,
                    "completed",
                    event as unknown as { data: Record<string, unknown>; timestamp?: string },
                );
            } catch (err) {
                console.error("[v2-webhook] iptv mirror completed dispatch failed:", err);
            }
        },
        "provision.task.failed": async (event) => {
            await processFailedTask({
                orderId: event.data.taskId,
                status: "failed",
                error: event.data.error,
                errorCode: event.data.errorCode,
            });
            try {
                await dispatchIptvMirror(
                    event.data.taskId,
                    "failed",
                    event as unknown as { data: Record<string, unknown>; timestamp?: string },
                );
            } catch (err) {
                console.error("[v2-webhook] iptv mirror failed dispatch failed:", err);
            }
        },
        ["provision.task.cancelled" as never]: (async (event: {
            data: { taskId: string; [k: string]: unknown };
            timestamp?: string;
        }) => {
            try {
                await dispatchIptvMirror(
                    event.data.taskId,
                    "cancelled",
                    event as unknown as { data: Record<string, unknown>; timestamp?: string },
                );
            } catch (err) {
                console.error("[v2-webhook] iptv mirror cancelled dispatch failed:", err);
            }
        }) as never,

        // ────────────────────────────────────────────────────────────────
        // BSV Mirror Shop (Lot 3) — handles successful delivery of gift card
        // codes from LoadBrain. Persists encrypted codes, marks the local
        // bsv_orders row COMPLETED, and notifies the reseller.
        // ────────────────────────────────────────────────────────────────
        "giftcards.order.delivered": async (event) => {
            const lbOrderId = event.data.orderId;
            const codes = event.data.codes;
            // wonSnapshot is not yet in the SDK v2 type but the brief promises
            // it. Read defensively until Agent 1 ships it formally.
            const wonSnapshot =
                (event.data as unknown as { wonSnapshot?: unknown })
                    .wonSnapshot ?? null;

            const [localBsvOrder] = await db
                .select()
                .from(bsvOrders)
                .where(eq(bsvOrders.lbOrderId, lbOrderId));

            if (!localBsvOrder) {
                console.warn(
                    "[v2-webhook] giftcards.order.delivered for unknown lbOrderId:",
                    lbOrderId
                );
                return;
            }

            const processed = await db.transaction(async (tx) => {
                // Idempotency guard: re-read under FOR UPDATE and only act on a
                // still-pending order. A replayed/duplicate webhook (already
                // COMPLETED or REFUNDED) is a no-op — prevents duplicate code rows
                // and reconciler races. Mirrors g2bulk-reconciler.markDelivered.
                const [fresh] = await tx
                    .select()
                    .from(bsvOrders)
                    .where(eq(bsvOrders.id, localBsvOrder.id))
                    .for("update");
                if (!fresh || fresh.status !== "PENDING_LOADBRAIN") return false;

                for (const c of codes) {
                    // Codes are sensitive — encrypt at rest.
                    const enriched = c as unknown as {
                        code: string;
                        redemptionUrl?: string | null;
                        pin?: string | null;
                    };
                    await tx.insert(bsvDeliveredCodes).values({
                        bsvOrderId: fresh.id,
                        code: encrypt(enriched.code),
                        redemptionUrl: enriched.redemptionUrl ?? null,
                        pin: enriched.pin ? encrypt(enriched.pin) : null,
                    });
                }

                await tx
                    .update(bsvOrders)
                    .set({
                        status: "COMPLETED",
                        completedAt: new Date(),
                        wonSnapshot: wonSnapshot ?? undefined,
                    })
                    .where(eq(bsvOrders.id, fresh.id));

                await tx
                    .update(orders)
                    .set({
                        status: "LIVRE",
                        isDelivered: true,
                    })
                    .where(eq(orders.id, fresh.localOrderId));
                return true;
            });

            if (!processed) {
                console.warn(
                    "[v2-webhook] giftcards.order.delivered ignored (already processed):",
                    lbOrderId
                );
                return;
            }

            // Best-effort WhatsApp notification — non-blocking.
            try {
                const reseller = await db.query.resellers.findFirst({
                    where: eq(resellers.id, localBsvOrder.resellerId),
                });
                const localOrder = await db.query.orders.findFirst({
                    where: eq(orders.id, localBsvOrder.localOrderId),
                });
                if (reseller?.contactPhone && localOrder) {
                    const notifModule = (await import(
                        "@/services/reseller-notifications.service"
                    )) as unknown as {
                        ResellerNotifications: Record<
                            string,
                            ((arg: unknown) => Promise<unknown>) | undefined
                        >;
                    };
                    const notify =
                        notifModule.ResellerNotifications.notifyOrderDelivered;
                    if (typeof notify === "function") {
                        await notify({
                            resellerId: reseller.id,
                            companyName: reseller.companyName,
                            contactPhone: reseller.contactPhone,
                            orderNumber: localOrder.orderNumber,
                            codeCount: codes.length,
                        }).catch((err: unknown) => {
                            console.warn(
                                "[v2-webhook] notifyOrderDelivered failed (non-bloquant):",
                                err
                            );
                        });
                    }
                }
            } catch (err) {
                console.warn("[v2-webhook] notify wiring failed:", err);
            }
        },

        "giftcards.order.failed": async (event) => {
            const lbOrderId = event.data.orderId;
            const errorMsg = event.data.error;

            const [localBsvOrder] = await db
                .select()
                .from(bsvOrders)
                .where(eq(bsvOrders.lbOrderId, lbOrderId));

            if (!localBsvOrder) {
                console.warn(
                    "[v2-webhook] giftcards.order.failed for unknown lbOrderId:",
                    lbOrderId
                );
                return;
            }

            // Refund the wallet for the price paid and mark order REFUNDED.
            await db.transaction(async (tx) => {
                // Idempotency guard: re-read under FOR UPDATE and only refund a
                // still-pending order. Already COMPLETED or REFUNDED → no-op, so a
                // retried `failed` webhook can't credit the wallet twice. Mirrors
                // g2bulk-reconciler.markRefunded.
                const [fresh] = await tx
                    .select()
                    .from(bsvOrders)
                    .where(eq(bsvOrders.id, localBsvOrder.id))
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
                    const refundAmount = parseFloat(
                        fresh.pricePaidDzd
                    );
                    // Lock the wallet row before crediting (consistency with reconciler).
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
                        description: `Remboursement BSV - échec livraison: ${errorMsg}`,
                        source: "UPSTREAM_REFUND",
                    });
                }

                await tx
                    .update(orders)
                    .set({ status: "ANNULE" })
                    .where(eq(orders.id, fresh.localOrderId));
            });

            console.warn(
                "[v2-webhook] giftcards.order.failed processed:",
                lbOrderId,
                errorMsg
            );
        },
    },
    onError: (err) => {
        console.error("[v2-webhook] handler error:", err.message);
    },
});

export const POST = handler;
