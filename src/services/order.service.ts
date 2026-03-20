import { db } from "@/db";
import { orders, clients, clientPayments, digitalCodes, orderItems, resellers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { allocateOrderStock } from "@/lib/orders";
import { decrypt } from "@/lib/encryption";
import { triggerOrderDelivery } from "@/lib/delivery";
import { sendPushToRoleAction, sendPushToUserAction } from "@/app/admin/push/actions";
import { OrderStatus, UserRole, ClientActionType, DigitalCodeStatus } from "@/lib/constants";

export class OrderService {
    /**
     * Handles the payment logic for an order, including debt management, 
     * stock allocation, and initial notifications.
     */
    static async payOrder(id: number, userId: number, options: {
        remise: number;
        montantPaye: number;
        clientId?: number;
        itemSuppliers?: Record<string, number>;
    }) {
        const remise = options.remise || 0;
        const montantPaye = options.montantPaye || 0;
        const clientId = options.clientId;

        const result = await db.transaction(async (tx) => {
            const order = await tx.query.orders.findFirst({
                where: (table, { eq }) => eq(table.id, id)
            });

            if (!order) throw new Error("Commande introuvable");

            const totalApresRemise = parseFloat(order.totalAmount) - remise;
            const resteAPayer = Math.max(0, totalApresRemise - montantPaye);

            let status: OrderStatus = OrderStatus.PAYE;
            if (resteAPayer > 0) {
                status = montantPaye === 0 ? OrderStatus.NON_PAYE : OrderStatus.PARTIEL;
            }

            // 1. Update Order Status
            await tx.update(orders)
                .set({
                    status,
                    userId,
                    remise: remise.toString(),
                    montantPaye: montantPaye.toString(),
                    resteAPayer: resteAPayer.toString(),
                    clientId: clientId || null
                })
                .where(eq(orders.id, id));

            // 2. Manage Client Debt
            if (clientId && resteAPayer > 0) {
                const client = await tx.query.clients.findFirst({
                    where: (c, { eq }) => eq(c.id, clientId)
                });
                if (client) {
                    const newTotalDebt = (parseFloat(client.totalDetteDzd || "0") + resteAPayer).toString();
                    await tx.update(clients)
                        .set({ totalDetteDzd: newTotalDebt })
                        .where(eq(clients.id, clientId));
                }
            }

            if (clientId && montantPaye > 0) {
                await tx.insert(clientPayments).values({
                    clientId,
                    orderId: id,
                    montantDzd: montantPaye.toString(),
                    typeAction: ClientActionType.ACOMPTE
                });
            }

            // 3. Centralized Stock Allocation
            await allocateOrderStock(tx, id, {
                userId,
                itemSuppliers: options.itemSuppliers
            });

            // 4. Fetch Enriched Order for return
            const finalOrder = await tx.query.orders.findFirst({
                where: eq(orders.id, id),
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

            if (!finalOrder) return null;

            const mappedItems = (finalOrder as any).items.map((item: any) => {
                const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code) || "[ERREUR DÉCRYPTAGE]");
                const slotCodes = (item.slots || []).map((s: any) => {
                    const decryptedParent = decrypt(s.digitalCode.code) || "[ERREUR COMPTE]";
                    const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                    let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                    if (s.code) slotInfo += ` | PIN: ${decryptedSlotPin || "[ERREUR PIN]"}`;
                    return slotInfo;
                });
                return { ...item, codes: [...standardCodes, ...slotCodes] };
            });

            return { ...finalOrder, items: mappedItems };
        });

        // 5. Post-Process Triggers (Push & Background Delivery)
        if (result?.status === OrderStatus.PAYE) {
            sendPushToRoleAction(UserRole.TRAITEUR, {
                title: "🔔 Nouvelle Commande",
                body: `Commande #${result.orderNumber} payée. À préparer !`,
                url: "/admin/traitement"
            }).catch(err => console.error("Push trigger error:", err));
        }

        triggerOrderDelivery(id).catch(err => {
            console.error(`[Background Delivery Error] Order #${id}:`, err);
        });

        return result;
    }

    /**
     * Finalizes order processing by mapping provided codes to items and 
     * transitioning the order to a finished state.
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
                                code: codeContent,
                                status: DigitalCodeStatus.VENDU
                            });
                        }
                    }
                }
            }

            // Fetch enriched order for response
            const enrichedOrder = await tx.query.orders.findFirst({
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

            if (!enrichedOrder) throw new Error("Erreur de récupération de la commande");

            const order = enrichedOrder as any;
            const mappedItems = order.items.map((item: any) => {
                const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code) || "[ERREUR DÉCRYPTAGE]");
                const slotCodes = (item.slots || []).map((s: any) => {
                    const decryptedParent = decrypt(s.digitalCode.code) || "[ERREUR COMPTE]";
                    const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                    let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                    if (s.code) slotInfo += ` | PIN: ${decryptedSlotPin || "[ERREUR PIN]"}`;
                    return slotInfo;
                });
                return { ...item, codes: [...standardCodes, ...slotCodes] };
            });

            return { ...order, items: mappedItems };
        });

        // Post-process delivery
        triggerOrderDelivery(id).catch(err => {
            console.error(`[Background Delivery Error] Order #${id}:`, err);
        });

        return result;
    }

    /**
     * Maps manually provided codes (from Telegram/Admin) to an order's items.
     * Used mainly for manual delivery webhooks.
     */
    static async deliverManualCodes(orderId: number, codesFound: string[]) {
        const order = await db.query.orders.findFirst({
            where: (o, { eq }) => eq(o.id, orderId),
            with: { items: true }
        });

        if (!order) throw new Error("Commande introuvable");

        let codeIndex = 0;
        let insertedCount = 0;

        await db.transaction(async (tx) => {
            for (const item of (order as any).items || []) {
                const needed = item.quantity;
                const forThisItem = codesFound.slice(codeIndex, codeIndex + needed);

                for (const code of forThisItem) {
                    await tx.insert(digitalCodes).values({
                        variantId: item.variantId,
                        orderItemId: item.id,
                        code: code,
                        status: DigitalCodeStatus.VENDU
                    });
                    insertedCount++;
                }
                codeIndex += needed;
            }

            if (insertedCount > 0) {
                await tx.update(orders)
                    .set({ status: OrderStatus.LIVRE })
                    .where(eq(orders.id, order.id));
            } else {
                throw new Error("Aucun code mappé");
            }
        });

        // Trigger delivery notifications
        triggerOrderDelivery(order.id).catch(err => {
            console.error(`[Background Delivery Error] Order #${order.id}:`, err);
        });

        return { insertedCount };
    }
}
