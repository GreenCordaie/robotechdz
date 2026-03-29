import { db } from "@/db";
import { orders, clients, clientPayments, digitalCodes, orderItems } from "@/db/schema";
import { eq, and, sql, or } from "drizzle-orm";
import { allocateOrderStock } from "@/lib/orders";
import { decrypt, encrypt } from "@/lib/encryption";
import { OrderStatus, UserRole, ClientActionType, DigitalCodeStatus, OrderSource, DeliveryMethod } from "@/lib/constants";
import { eventBus, SystemEvent } from "@/lib/events";

export class OrderService {
    /**
     * Handles the payment logic for an order, including debt management, 
     * stock allocation, and initial notifications via Event Bus.
     */
    static async payOrder(id: number, userId: number, options: {
        remise: number;
        montantPaye: number;
        clientId?: number;
        itemSuppliers?: Record<string, number>;
        itemPriceOverrides?: Record<string, { price: string, currency: string }>;
        paymentMethod?: string;
    }) {
        const remise = options.remise || 0;
        const montantRecuMaintenant = options.montantPaye || 0;
        const clientId = options.clientId;

        const result = await db.transaction(async (tx) => {
            const order = await tx.query.orders.findFirst({
                where: (table, { eq }) => eq(table.id, id)
            });

            if (!order) throw new Error("Commande introuvable");

            const currentCumulativePaid = parseFloat(order.montantPaye || "0");
            const newTotalPaid = currentCumulativePaid + montantRecuMaintenant;
            const totalApresRemise = parseFloat(order.totalAmount) - remise;

            const resteAPayer = Math.max(0, totalApresRemise - newTotalPaid);
            const extraPayment = Math.max(0, newTotalPaid - totalApresRemise);

            let status: OrderStatus = OrderStatus.PAYE;
            if (resteAPayer > 0) {
                status = (newTotalPaid === 0) ? OrderStatus.NON_PAYE : OrderStatus.PARTIEL;
            }

            // 4. Check for manual products or WhatsApp delivery
            const enrichedOrder = await tx.query.orders.findFirst({
                where: eq(orders.id, id),
                with: {
                    items: {
                        with: {
                            variant: { with: { product: true } }
                        }
                    }
                }
            });

            const isWhatsApp = enrichedOrder?.deliveryMethod === DeliveryMethod.WHATSAPP;
            const printStatus = isWhatsApp ? "idle" : "print_pending";

            // 5. Update Order Status and Print Status
            await tx.update(orders)
                .set({
                    status,
                    userId,
                    remise: remise.toString(),
                    montantPaye: newTotalPaid.toString(),
                    resteAPayer: resteAPayer.toString(),
                    clientId: clientId || null,
                    paymentMethod: options.paymentMethod || null,
                    printStatus: printStatus as any,
                })
                .where(eq(orders.id, id));

            // 6. Manage Client Debt
            if (clientId) {
                const client = await tx.query.clients.findFirst({
                    where: (c, { eq }) => eq(c.id, clientId)
                });
                if (client) {
                    let newClientTotalDebt = parseFloat(client.totalDetteDzd || "0");

                    if (order.status === OrderStatus.EN_ATTENTE) {
                        newClientTotalDebt += resteAPayer;
                        if (extraPayment > 0) {
                            newClientTotalDebt = Math.max(0, newClientTotalDebt - extraPayment);
                        }
                    } else {
                        const previousRemaining = parseFloat(order.resteAPayer || "0");
                        const adjustment = resteAPayer - previousRemaining;
                        newClientTotalDebt = Math.max(0, newClientTotalDebt + adjustment);
                        if (extraPayment > 0) {
                            newClientTotalDebt = Math.max(0, newClientTotalDebt - extraPayment);
                        }
                    }

                    await tx.update(clients)
                        .set({ totalDetteDzd: newClientTotalDebt.toString() })
                        .where(eq(clients.id, clientId));
                }
            }

            if (clientId && montantRecuMaintenant > 0) {
                await tx.insert(clientPayments).values({
                    clientId,
                    orderId: id,
                    montantDzd: montantRecuMaintenant.toString(),
                    typeAction: ClientActionType.ACOMPTE
                });
            }

            // 7. Centralized Stock Allocation
            await allocateOrderStock(tx, id, {
                userId,
                itemSuppliers: options.itemSuppliers,
                itemPriceOverrides: options.itemPriceOverrides
            });

            // Re-fetch to return full object
            return await tx.query.orders.findFirst({
                where: eq(orders.id, id),
                with: {
                    client: true,
                    reseller: true,
                    items: {
                        with: {
                            codes: true,
                            slots: { with: { digitalCode: true } },
                            variant: { with: { product: true } }
                        }
                    }
                }
            });
        });

        if (!result) return null;

        const hasManualProducts = (result as any).items?.some((item: any) => item.variant?.product?.isManualDelivery) || false;
        const isFullyAuto = result.status === OrderStatus.TERMINE || (!hasManualProducts && result.status === OrderStatus.PAYE);

        // Post-payment triggers via Event Bus
        if (result.status === OrderStatus.PAYE || result.status === OrderStatus.TERMINE || result.status === OrderStatus.PARTIEL) {
            eventBus.publish(SystemEvent.ORDER_PAID, {
                orderId: result.id,
                isFullyAuto: isFullyAuto
            });
        }

        const hasCodesOrSlots = (result as any).items?.some((item: any) =>
            (item.codes && item.codes.length > 0) || (item.slots && item.slots.length > 0)
        );

        // Also fire for WhatsApp delivery on paid/complete orders even if no codes yet
        const isWhatsAppPaid = (result as any).deliveryMethod === DeliveryMethod.WHATSAPP
            && (result.status === OrderStatus.PAYE || result.status === OrderStatus.TERMINE);

        if (isFullyAuto || hasCodesOrSlots || isWhatsAppPaid) {
            eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: result.id });
        }

        return result;
    }

    /**
     * Processing for manual/delayed orders. 
     * Signals completion via Event Bus.
     */
    static async processOrder(id: number, codesData: { id: number; codes: string[] }[]) {
        const result = await db.transaction(async (tx) => {
            const current = await tx.query.orders.findFirst({ where: eq(orders.id, id) });
            if (!current) throw new Error("Commande introuvable");

            const nextStatus = current.status === OrderStatus.PAYE ? OrderStatus.TERMINE : current.status;
            await tx.update(orders).set({ status: nextStatus, isDelivered: true }).where(eq(orders.id, id));

            for (const itemData of codesData) {
                const oi = await tx.query.orderItems.findFirst({ where: eq(orderItems.id, itemData.id) });
                if (oi && itemData.codes) {
                    for (const codeContent of itemData.codes) {
                        if (codeContent) {
                            await tx.insert(digitalCodes).values({
                                variantId: oi.variantId,
                                orderItemId: oi.id,
                                code: encrypt(codeContent),
                                status: DigitalCodeStatus.VENDU
                            });
                        }
                    }
                }
            }

            return await tx.query.orders.findFirst({
                where: eq(orders.id, id),
                with: {
                    items: {
                        with: {
                            codes: true,
                            slots: { with: { digitalCode: true } }
                        }
                    },
                    client: true
                }
            });
        });

        if (result?.status === OrderStatus.TERMINE) {
            await db.update(orders).set({ printStatus: "print_pending" }).where(eq(orders.id, id));
            eventBus.publish(SystemEvent.ORDER_PRINTED, { orderId: id });
            eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: id });
        }

        return result;
    }

    /**
     * Used for manual delivery webhooks.
     */
    static async deliverManualCodes(orderId: number, codesFound: string[]) {
        return await db.transaction(async (tx) => {
            const order = await tx.query.orders.findFirst({
                where: (o, { eq }) => eq(o.id, orderId),
                with: { items: true }
            });
            if (!order) throw new Error("Commande introuvable");

            let codeIndex = 0;
            let insertedCount = 0;

            for (const item of (order as any).items || []) {
                const reservedCount = (item.codes || []).length + (item.slots || []).length;
                const needed = Math.max(0, item.quantity - reservedCount);

                if (needed > 0) {
                    const forThisItem = codesFound.slice(codeIndex, codeIndex + needed);
                    for (const code of forThisItem) {
                        await tx.insert(digitalCodes).values({
                            variantId: item.variantId,
                            orderItemId: item.id,
                            code: encrypt(code),
                            status: DigitalCodeStatus.VENDU
                        });
                        insertedCount++;
                    }
                    codeIndex += needed;
                }
            }

            if (insertedCount > 0) {
                const nextStatus = order.status === OrderStatus.PAYE ? OrderStatus.TERMINE : order.status;
                await tx.update(orders)
                    .set({
                        status: nextStatus,
                        isDelivered: true,
                        printStatus: "print_pending"
                    })
                    .where(eq(orders.id, order.id));

                eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: order.id });
                if (nextStatus === OrderStatus.TERMINE) {
                    eventBus.publish(SystemEvent.ORDER_PRINTED, { orderId: order.id });
                }

                return { success: true, nextStatus, insertedCount };
            }
            throw new Error("Aucun code mappé");
        });
    }

    /**
     * Post-payment triggers: fires ORDER_PAID and ORDER_DELIVERED events.
     * Used by reseller checkout (and any flow that creates an order without calling payOrder).
     */
    static async finalizeOrderAfterPayment(orderId: number) {
        const order = await db.query.orders.findFirst({
            where: eq(orders.id, orderId),
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } },
                        variant: { with: { product: true } }
                    }
                }
            }
        });

        if (!order) return;

        const hasManualProducts = (order as any).items?.some((item: any) => item.variant?.product?.isManualDelivery) || false;
        const isFullyAuto = order.status === OrderStatus.TERMINE || (!hasManualProducts && order.status === OrderStatus.PAYE);

        eventBus.publish(SystemEvent.ORDER_PAID, { orderId: order.id, isFullyAuto });

        const hasCodesOrSlots = (order as any).items?.some((item: any) =>
            (item.codes && item.codes.length > 0) || (item.slots && item.slots.length > 0)
        );
        const isWhatsAppPaid = (order as any).deliveryMethod === DeliveryMethod.WHATSAPP
            && (order.status === OrderStatus.PAYE || order.status === OrderStatus.TERMINE);

        if (isFullyAuto || hasCodesOrSlots || isWhatsAppPaid) {
            eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: order.id });
        }
    }

    /**
     * Illustrative function for IDOR prevention (Absolute Ownership rule).
     */
    static async getSecureOrderById(id: number, user: { id: number; role: string }) {
        return await db.query.orders.findFirst({
            where: (table) => {
                const baseCondition = eq(table.id, id);
                if (user.role === UserRole.ADMIN) return baseCondition;
                if (user.role === UserRole.RESELLER) {
                    return and(baseCondition, eq(table.resellerId, user.id));
                }
                return and(
                    baseCondition,
                    or(eq(table.userId, user.id), eq(table.source, OrderSource.KIOSK))
                );
            },
            with: {
                items: { with: { variant: true } },
                client: true
            }
        });
    }
}
