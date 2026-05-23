import { createWebhookHandler } from "@loadbrain/sdk-v2";
import {
    processCompletedTask,
    processFailedTask,
} from "@/lib/iptv-webhook-processor";
import { db } from "@/db";
import {
    bsvOrders,
    bsvDeliveredCodes,
    orders,
    resellerWallets,
    resellerTransactions,
    resellers,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";

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
    handlers: {
        "provision.task.completed": async (event) => {
            await processCompletedTask({
                orderId: event.data.taskId,
                status: "completed",
                credentials: event.data.credentials,
                completedAt: event.timestamp,
            });
        },
        "provision.task.failed": async (event) => {
            await processFailedTask({
                orderId: event.data.taskId,
                status: "failed",
                error: event.data.error,
                errorCode: event.data.errorCode,
            });
        },

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

            await db.transaction(async (tx) => {
                for (const c of codes) {
                    // Codes are sensitive — encrypt at rest.
                    const enriched = c as unknown as {
                        code: string;
                        redemptionUrl?: string | null;
                        pin?: string | null;
                    };
                    await tx.insert(bsvDeliveredCodes).values({
                        bsvOrderId: localBsvOrder.id,
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
                    .where(eq(bsvOrders.id, localBsvOrder.id));

                await tx
                    .update(orders)
                    .set({
                        status: "LIVRE",
                        isDelivered: true,
                    })
                    .where(eq(orders.id, localBsvOrder.localOrderId));
            });

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
                await tx
                    .update(bsvOrders)
                    .set({ status: "REFUNDED", completedAt: new Date() })
                    .where(eq(bsvOrders.id, localBsvOrder.id));

                const reseller = await tx.query.resellers.findFirst({
                    where: eq(resellers.id, localBsvOrder.resellerId),
                    with: { wallet: true },
                });

                if (reseller?.wallet) {
                    const refundAmount = parseFloat(
                        localBsvOrder.pricePaidDzd
                    );
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
                        orderId: localBsvOrder.localOrderId,
                        description: `Remboursement BSV - échec livraison: ${errorMsg}`,
                    });
                }

                await tx
                    .update(orders)
                    .set({ status: "ANNULE" })
                    .where(eq(orders.id, localBsvOrder.localOrderId));
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
