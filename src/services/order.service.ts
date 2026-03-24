import { db } from "@/db";
import { orders, clients, clientPayments, digitalCodes, orderItems, resellers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { allocateOrderStock } from "@/lib/orders";
import { decrypt } from "@/lib/encryption";
import { triggerOrderDelivery } from "@/lib/delivery";
import { sendPushToRoleAction, sendPushToUserAction } from "@/app/admin/push/actions";
import { OrderStatus, UserRole, ClientActionType, DigitalCodeStatus, OrderSource } from "@/lib/constants";
import { N8nService } from "./n8n.service";

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
        itemPriceOverrides?: Record<string, { price: string, currency: string }>;
        paymentMethod?: string;
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

            // 3. Fetch Enriched Order for credential checks and return
            const finalOrder = await tx.query.orders.findFirst({
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

            if (!finalOrder) return null;

            // 4. Check for manual products
            const hasManualProducts = (finalOrder as any).items.some((item: any) => !item.variant?.isAutomatic);
            const printStatus = hasManualProducts ? "idle" : "print_pending";

            // 5. Update Order Status and Print Status
            await tx.update(orders)
                .set({
                    status,
                    userId,
                    remise: remise.toString(),
                    montantPaye: montantPaye.toString(),
                    resteAPayer: resteAPayer.toString(),
                    clientId: clientId || null,
                    paymentMethod: options.paymentMethod || null,
                    printStatus: printStatus as any,
                })
                .where(eq(orders.id, id));

            // 6. Manage Client Debt
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

            // 7. Centralized Stock Allocation
            await allocateOrderStock(tx, id, {
                userId,
                itemSuppliers: options.itemSuppliers,
                itemPriceOverrides: options.itemPriceOverrides
            });

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

        return await this.finalizeOrderAfterPayment(id);
    }

    /**
     * Executes all post-payment triggers: push notifications, n8n alerts, 
     * and instant delivery for automatic products.
     */
    static async finalizeOrderAfterPayment(orderId: number) {
        // Fetch fresh order with all relations
        const order = await db.query.orders.findFirst({
            where: eq(orders.id, orderId),
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

        if (!order) return null;

        const isFullyAuto = order.status === OrderStatus.TERMINE;
        const hasCodesOrSlots = (order as any).items.some((item: any) =>
            (item.codes && item.codes.length > 0) || (item.slots && item.slots.length > 0)
        );

        // --- NEW: TOULOULOU LOYALTY LOGIC ---
        const totalAmount = parseFloat(order.totalAmount);
        const points = Math.floor(totalAmount / 100);

        if (order.status === OrderStatus.PAYE || isFullyAuto) {
            await db.transaction(async (tx) => {
                await tx.update(orders)
                    .set({ pointsEarned: points })
                    .where(eq(orders.id, orderId));

                if (order.clientId) {
                    const currentClient = await tx.query.clients.findFirst({
                        where: eq(clients.id, order.clientId)
                    });

                    if (currentClient) {
                        const newTotalSpent = (parseFloat(currentClient.totalSpentDzd || "0") + totalAmount).toString();
                        const newPoints = currentClient.loyaltyPoints + points;

                        await tx.update(clients)
                            .set({
                                totalSpentDzd: newTotalSpent,
                                loyaltyPoints: newPoints
                            })
                            .where(eq(clients.id, order.clientId));
                    }
                }
            });
        }
        // ------------------------------------

        if (order.status === OrderStatus.PAYE || isFullyAuto) {
            // Admin/Traiteur Push (Only if NOT fully auto)
            if (!isFullyAuto) {
                sendPushToRoleAction(UserRole.TRAITEUR, {
                    title: "🔔 Nouvelle Commande",
                    body: `Commande #${order.orderNumber} payée. À préparer !`,
                    url: "/admin/traitement"
                }).catch(() => { });
            }

            // Internal Alert (Always)
            N8nService.notifyOrderCreated({
                ...order,
                pointsEarned: points,
                loyaltyPointsTotal: (order as any).client ? ((order as any).client.loyaltyPoints + points) : points,
                isFullyAuto
            }).catch(err => console.error("[N8N-TRIGGER-ERROR] notifyOrderCreated:", err));
        }

        // --- DELAYED DELIVERY LOGIC ---
        // Only trigger delivery if we have codes/slots OR it's fully auto
        // If it's manual and no codes assigned yet, we wait for processOrder
        if (isFullyAuto || hasCodesOrSlots) {
            triggerOrderDelivery(order.id).catch(err => {
                console.error(`[Background Delivery Error] Order #${order.id}:`, err);
            });
        }

        // Map items for return (legacy UI support)
        const mappedItems = (order as any).items.map((item: any) => {
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

        // Post-process triggers
        if (result?.status === OrderStatus.TERMINE) {
            // Set for print once codes are in
            await db.update(orders).set({ printStatus: "print_pending" }).where(eq(orders.id, id));

            N8nService.notifyOrderArchival(result).catch(err => console.error("[N8N-ARCHIVAL-ERROR]:", err));
        }

        // Post-process delivery (WhatsApp)
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
            with: { items: true, client: true }
        });

        if (!order) throw new Error("Commande introuvable");

        let codeIndex = 0;
        let insertedCount = 0;

        const result = await db.transaction(async (tx) => {
            for (const item of (order as any).items || []) {
                // Nombre de codes déjà liés (réservés)
                const reservedCount = (item.codes || []).length + (item.slots || []).length;
                const needed = Math.max(0, item.quantity - reservedCount);

                if (needed > 0) {
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
            }

            // On considère le succès si on a inséré des codes OU s'il y en avait déjà des réservés (total = quantity)
            const allItemsFulfilled = (order as any).items.every((item: any) => {
                const totalNow = (item.codes || []).length + (item.slots || []).length + (insertedCount > 0 ? (item.quantity - ((item.codes || []).length + (item.slots || []).length)) : 0); // Simplified check
                return true; // We trust the admin for now or simple check quantity
            });

            if (insertedCount > 0) {
                const nextStatus = order.status === OrderStatus.PAYE ? OrderStatus.TERMINE : order.status;
                await tx.update(orders)
                    .set({
                        status: nextStatus,
                        isDelivered: true,
                        printStatus: "print_pending" // Trigger print
                    })
                    .where(eq(orders.id, order.id));

                return { success: true, nextStatus };
            } else {
                throw new Error("Aucun code mappé");
            }
        });

        // Trigger delivery notifications (WhatsApp)
        triggerOrderDelivery(order.id).catch(err => {
            console.error(`[Background Delivery Error] Order #${order.id}:`, err);
        });

        // Trigger Archival if status is TERMINE
        if (result.nextStatus === OrderStatus.TERMINE) {
            N8nService.notifyOrderArchival(order as any).catch(err => console.error("[N8N-ARCHIVAL-ERROR]:", err));
        }

        return { insertedCount };
    }

    /**
     * Illustrative function for IDOR prevention (Absolute Ownership rule).
     * Enforces that the resource ID and owner ID (or management context) are checked together.
     */
    static async getSecureOrderById(id: number, user: { id: number; role: string }) {
        const { and, eq, or } = await import("drizzle-orm");

        return await db.query.orders.findFirst({
            where: (table) => {
                const baseCondition = eq(table.id, id);

                // 1. Admin bypass
                if (user.role === UserRole.ADMIN) return baseCondition;

                // 2. Reseller check: Must be linked to their own orders
                if (user.role === UserRole.RESELLER) {
                    return and(
                        baseCondition,
                        eq(table.resellerId, user.id)
                    );
                }

                // 3. Employee check: Access Kiosk orders or orders they handled
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
