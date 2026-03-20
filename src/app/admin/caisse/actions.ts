"use server";

import { db } from "@/db";
import { orders, digitalCodes, digitalCodeSlots, orderItems, suppliers, supplierTransactions, productVariantSuppliers, clients, clientPayments, shopSettings, resellers } from "@/db/schema";
import { eq, sql, desc, exists, and, inArray, count, gte, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendTelegramNotification } from "@/lib/telegram";
import { triggerOrderDelivery } from "@/lib/delivery";
import { withAuth, logSecurityAction } from "@/lib/security";
import { z } from "zod";
import { allocateOrderStock } from "@/lib/orders";
import { sendPushToRoleAction, sendPushToUserAction } from "../push/actions";
import { decrypt } from "@/lib/encryption";
import { OrderService } from "@/services/order.service";
// Dynamic Query loader to prevent client-side leakage
const getQueries = async () => {
    const { OrderQueries } = await import("@/services/queries/order.queries");
    return OrderQueries;
};

import { UserRole, OrderStatus, SupplierTransactionType, DigitalCodeStatus, DigitalCodeSlotStatus, ClientActionType } from "@/lib/constants";

export const findOrderByNumber = withAuth(
    // ... (omitting for brevity in thought, but tool call will have full content)
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ orderNumber: z.string() })
    },
    async ({ orderNumber }) => {
        const OrderQueries = await getQueries();
        return OrderQueries.findByNumber(orderNumber);
    }
);

export const getPendingOrders = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        const OrderQueries = await getQueries();
        return OrderQueries.getPending();
    }
);

export const payOrder = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({
            id: z.number(),
            options: z.object({
                remise: z.number().nonnegative().max(1000000),
                montantPaye: z.number().nonnegative(),
                clientId: z.number().optional(),
                itemSuppliers: z.record(z.string(), z.number()).optional()
            })
        })
    },
    async ({ id, options }, user) => {
        try {
            const result = await OrderService.payOrder(id, user.id, options);

            revalidatePath("/admin/caisse");
            revalidatePath("/admin/traitement");

            return { success: true, order: result };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const updateOrderStatus = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ id: z.number(), status: z.enum(Object.values(OrderStatus) as [string, ...string[]]) })
    },
    async ({ id, status }) => {
        await db.update(orders).set({ status }).where(eq(orders.id, id));
        revalidatePath("/admin/caisse");
        return { success: true };
    }
);

export const getPaidOrders = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR] },
    async () => {
        const OrderQueries = await getQueries();
        return OrderQueries.getPaid();
    }
);

export const processOrder = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR],
        schema: z.object({ id: z.number(), codesData: z.array(z.object({ id: z.number(), codes: z.array(z.string()) })) })
    },
    async ({ id, codesData }) => {
        try {
            const result = await OrderService.processOrder(id, codesData);

            revalidatePath("/admin/caisse");
            revalidatePath("/admin/traitement");

            return result;
        } catch (error) {
            return { error: (error as Error).message };
        }
    }
);

export const getTodayOrders = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        const OrderQueries = await getQueries();
        return OrderQueries.getToday();
    }
);

export const markOrderAsTermine = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        const order = await db.query.orders.findFirst({
            where: eq(orders.id, id),
            columns: { orderNumber: true, userId: true, resellerId: true }
        });

        await db.update(orders).set({ status: OrderStatus.TERMINE, isDelivered: true }).where(eq(orders.id, id));
        revalidatePath("/admin/traitement");
        revalidatePath("/admin/caisse");

        // Notify Reseller if applicable
        if (order?.resellerId) {
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.id, order.resellerId),
                columns: { userId: true }
            });
            if (reseller) {
                sendPushToUserAction(reseller.userId, {
                    title: "✅ Commande Prête",
                    body: `Votre commande ${order.orderNumber} est terminée et prête !`,
                    url: "/reseller/orders"
                }).catch(err => console.error("Push to reseller failed:", err));
            }
        }

        return { success: true };
    }
);

export const getFinishedOrders = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR] },
    async () => {
        const OrderQueries = await getQueries();
        return OrderQueries.getFinished();
    }
);

export const replaceOrderItemCode = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            orderItemId: z.number(),
            oldCodeId: z.number().optional(),
            oldSlotId: z.number().optional(),
            reason: z.string()
        })
    },
    async ({ orderItemId, oldCodeId, oldSlotId, reason }) => {
        try {
            return await db.transaction(async (tx) => {
                const item = await tx.query.orderItems.findFirst({
                    where: eq(orderItems.id, orderItemId),
                    with: { variant: true }
                });

                if (!item) throw new Error("Article introuvable");

                // 1. Mark old code/slot as DEFECTUEUX
                if (oldCodeId) {
                    await tx.update(digitalCodes).set({ status: DigitalCodeStatus.DEFECTUEUX }).where(eq(digitalCodes.id, oldCodeId));
                } else if (oldSlotId) {
                    await tx.update(digitalCodeSlots).set({ status: DigitalCodeStatus.DEFECTUEUX }).where(eq(digitalCodeSlots.id, oldSlotId));
                }

                // 2. Find new code/slot (Locked selection to prevent race conditions)
                if (item.variant.isSharing) {
                    const [newSlot] = await tx.select().from(digitalCodeSlots)
                        .where(and(
                            eq(digitalCodeSlots.status, DigitalCodeSlotStatus.DISPONIBLE),
                            exists(
                                tx.select().from(digitalCodes)
                                    .where(and(
                                        eq(digitalCodes.id, digitalCodeSlots.digitalCodeId),
                                        eq(digitalCodes.variantId, item.variantId),
                                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE)
                                    ))
                            )
                        ))
                        .orderBy(asc(digitalCodeSlots.digitalCodeId), asc(digitalCodeSlots.slotNumber))
                        .limit(1)
                        .for("update", { skipLocked: true });

                    if (!newSlot) throw new Error("Plus de slots disponibles en stock");

                    await tx.update(digitalCodeSlots)
                        .set({ status: DigitalCodeSlotStatus.VENDU, orderItemId: item.id })
                        .where(eq(digitalCodeSlots.id, newSlot.id));

                    revalidatePath("/admin/caisse");
                    return { success: true };
                } else {
                    const [newCode] = await tx.select().from(digitalCodes)
                        .where(and(
                            eq(digitalCodes.variantId, item.variantId),
                            eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE)
                        ))
                        .limit(1)
                        .for("update", { skipLocked: true });

                    if (!newCode) throw new Error("Plus de codes disponibles en stock");

                    await tx.update(digitalCodes)
                        .set({ status: DigitalCodeStatus.VENDU, orderItemId: item.id })
                        .where(eq(digitalCodes.id, newCode.id));

                    revalidatePath("/admin/caisse");
                    return { success: true };
                }
            });
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const refundOrderItem = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ orderItemId: z.number(), returnToStock: z.boolean() })
    },
    async ({ orderItemId, returnToStock }) => {
        try {
            await db.transaction(async (tx) => {
                const item = await tx.query.orderItems.findFirst({
                    where: eq(orderItems.id, orderItemId),
                    with: { codes: true, slots: true }
                });

                if (!item) throw new Error("Article introuvable");

                const status = returnToStock ? DigitalCodeStatus.DISPONIBLE : DigitalCodeStatus.DEFECTUEUX;

                if (item.codes && item.codes.length > 0) {
                    await tx.update(digitalCodes)
                        .set({ status, orderItemId: null })
                        .where(inArray(digitalCodes.id, item.codes.map(c => c.id)));
                }

                if (item.slots && item.slots.length > 0) {
                    await tx.update(digitalCodeSlots)
                        .set({ status, orderItemId: null })
                        .where(inArray(digitalCodeSlots.id, item.slots.map(s => s.id)));
                }

                // Note: We don't delete the order item, we just free the codes. 
                // The UI should probably handle the "Refunded" state visually.
            });

            revalidatePath("/admin/caisse");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const refundFullOrder = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ id: z.number(), returnToStock: z.boolean() })
    },
    async ({ id, returnToStock }) => {
        try {
            await db.transaction(async (tx) => {
                const order = await tx.query.orders.findFirst({
                    where: eq(orders.id, id),
                    with: { items: true }
                });

                if (!order) throw new Error("Commande introuvable");

                for (const item of (order as any).items) {
                    const status = returnToStock ? DigitalCodeStatus.DISPONIBLE : DigitalCodeStatus.DEFECTUEUX;
                    await tx.update(digitalCodes).set({ status, orderItemId: null }).where(eq(digitalCodes.orderItemId, item.id));
                    await tx.update(digitalCodeSlots).set({ status, orderItemId: null }).where(eq(digitalCodeSlots.orderItemId, item.id));
                }

                await tx.update(orders).set({ status: OrderStatus.REMBOURSE }).where(eq(orders.id, id));
            });

            revalidatePath("/admin/caisse");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const cancelOrderAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ orderId: z.number() })
    },
    async ({ orderId }) => {
        try {
            await db.transaction(async (tx) => {
                const order = await tx.query.orders.findFirst({
                    where: eq(orders.id, orderId),
                    with: { items: { with: { codes: true, slots: true } } }
                }) as any;

                if (!order) throw new Error("Commande introuvable");

                await tx.update(orders).set({ status: OrderStatus.ANNULE }).where(eq(orders.id, orderId));

                for (const item of (order.items || [])) {
                    if (item.codes && item.codes.length > 0) {
                        const codeIds = item.codes.map((c: any) => c.id);
                        await tx.update(digitalCodes).set({ status: DigitalCodeStatus.DISPONIBLE, orderItemId: null, isDebitCompleted: false }).where(inArray(digitalCodes.id, codeIds));
                    }
                    if (item.slots && item.slots.length > 0) {
                        const slotIds = item.slots.map((s: any) => s.id);
                        await tx.update(digitalCodeSlots).set({ status: DigitalCodeSlotStatus.DISPONIBLE, orderItemId: null }).where(inArray(digitalCodeSlots.id, slotIds));
                        const parentIds = Array.from(new Set(item.slots.map((s: any) => s.digitalCodeId)));
                        for (const pid of parentIds) {
                            await tx.update(digitalCodes).set({ status: DigitalCodeStatus.DISPONIBLE, isDebitCompleted: false }).where(eq(digitalCodes.id, pid as any as number));
                        }
                    }
                }

                // --- 🔄 BALANCE REVERSAL LOGIC ---
                // Find all previous debits for this order
                const relatedTransactions = await tx.query.supplierTransactions.findMany({
                    where: (table: any, { and, eq }: any) => and(
                        eq(table.orderId, orderId),
                        eq(table.type, "ACHAT_STOCK")
                    )
                });

                for (const st of relatedTransactions) {
                    // Credit the supplier back
                    await tx.update(suppliers)
                        .set({ balance: sql`${suppliers.balance} + ${sql.param(st.amount)}` })
                        .where(eq(suppliers.id, st.supplierId));

                    // Log the reversal
                    await tx.insert(supplierTransactions).values({
                        supplierId: st.supplierId,
                        orderId: orderId,
                        type: SupplierTransactionType.RECHARGE,
                        paymentStatus: "PAID",
                        paidAt: new Date(),
                        amount: st.amount,
                        currency: st.currency,
                        reason: `Annulation Commande #${orderId} (Remboursement Auto)`
                    });
                }
            });

            revalidatePath("/admin/caisse");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getPendingOrdersCount = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR], schema: z.any().optional() },
    async () => {
        try {
            const OrderQueries = await getQueries();
            const res = await OrderQueries.getPendingCount();
            return { success: true, count: res.count };
        } catch (error) {
            return { success: false, error: "Failed to fetch pending count" };
        }
    }
);
export const resendWhatsAppAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ orderId: z.number() })
    },
    async ({ orderId }) => {
        try {
            await triggerOrderDelivery(orderId);
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
