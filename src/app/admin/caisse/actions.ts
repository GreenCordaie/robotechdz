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
import { N8nService } from "@/services/n8n.service";
// Dynamic Query loader to prevent client-side leakage
const getQueries = async () => {
    const { OrderQueries } = await import("@/services/queries/order.queries");
    return OrderQueries;
};

import { UserRole, OrderStatus, SupplierTransactionType, DigitalCodeStatus, DigitalCodeSlotStatus, ClientActionType, RemboursementType, ReturnRequest } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { cacheDel, CACHE_KEYS } from "@/lib/redis";

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
                itemSuppliers: z.record(z.string(), z.number()).optional(),
                itemPriceOverrides: z.record(z.string(), z.object({
                    price: z.string(),
                    currency: z.string()
                })).optional(),
                paymentMethod: z.string().optional(),
            })
        })
    },
    async ({ id, options }, user) => {
        try {
            const result = await OrderService.payOrder(id, user.id, options);

            revalidatePath("/admin/caisse");
            revalidatePath("/admin/traitement");
            cacheDel(...CACHE_KEYS.DASHBOARD_ALL, CACHE_KEYS.KIOSK_CATALOGUE).catch(() => { });

            return { success: true, order: result };
        } catch (error) {
            logger.error((error as Error).message, { userId: user.id, action: "PAY_ORDER_FAILED", metadata: { orderId: id } });
            return { success: false, error: (error as Error).message };
        }
    }
);

export const requeueForPrint = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR],
        schema: z.object({ orderId: z.number() })
    },
    async ({ orderId }) => {
        try {
            await db.update(orders).set({ printStatus: "print_pending" }).where(eq(orders.id, orderId));
            return { success: true };
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
        const OrderQueries = await getQueries();
        const order = await OrderQueries.getById(id);

        if (!order) throw new Error("Commande introuvable");

        await db.update(orders).set({ status: OrderStatus.TERMINE, isDelivered: true }).where(eq(orders.id, id));
        revalidatePath("/admin/traitement");
        revalidatePath("/admin/caisse");

        // trigger archival to Google Sheets via n8n
        N8nService.notifyOrderArchival(order).catch(err => console.error("Archival failed:", err));

        // Notify Reseller if applicable
        if (order.resellerId) {
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
            reason: z.string().optional()
        })
    },
    async ({ orderItemId, oldCodeId, oldSlotId }) => {
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
                        const parentIds = Array.from(new Set<number>(item.slots.map((s: any) => s.digitalCodeId)));
                        await Promise.all([
                            tx.update(digitalCodeSlots).set({ status: DigitalCodeSlotStatus.DISPONIBLE, orderItemId: null }).where(inArray(digitalCodeSlots.id, slotIds)),
                            tx.update(digitalCodes).set({ status: DigitalCodeStatus.DISPONIBLE, isDebitCompleted: false }).where(inArray(digitalCodes.id, parentIds))
                        ]);
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

                await Promise.all(relatedTransactions.map(async (st) => {
                    await tx.update(suppliers)
                        .set({ balance: sql`${suppliers.balance} + ${sql.param(st.amount)}` })
                        .where(eq(suppliers.id, st.supplierId));
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
                }));
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
export const getPaidOrdersCount = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR], schema: z.any().optional() },
    async () => {
        try {
            const OrderQueries = await getQueries();
            const res = await OrderQueries.getPaidCount();
            return { success: true, count: res.count };
        } catch (error) {
            return { success: false, error: "Failed to fetch paid count" };
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
export const initiateReturn = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({
            orderId: z.number().int().positive(),
            motif: z.string().min(5, "Motif requis (min 5 caractères)"),
            typeRemboursement: z.enum(["ESPECES", "CREDIT_WALLET"] as [RemboursementType, RemboursementType]),
            montant: z.number().positive(),
        })
    },
    async ({ orderId, motif, typeRemboursement, montant }, user) => {
        try {
            const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
            if (!order) return { success: false, error: "Commande introuvable" };

            const refundableStatuses: string[] = [OrderStatus.PAYE, OrderStatus.LIVRE];
            if (!refundableStatuses.includes(order.status)) {
                return { success: false, error: "Cette commande ne peut pas faire l'objet d'un retour" };
            }
            if ((order as any).returnRequest !== null) {
                return { success: false, error: "Une demande de retour existe déjà pour cette commande" };
            }
            if (montant > parseFloat(order.totalAmount as string)) {
                return { success: false, error: "Le montant ne peut pas dépasser le total de la commande" };
            }
            if (typeRemboursement === "CREDIT_WALLET" && !order.clientId) {
                return { success: false, error: "Le crédit wallet nécessite un client associé à la commande" };
            }

            const returnRequest: ReturnRequest = {
                motif,
                typeRemboursement,
                montant,
                status: "EN_ATTENTE",
                initiatedBy: user.id,
                initiatedAt: new Date().toISOString(),
                previousOrderStatus: order.status,
            };

            await db.update(orders).set({ returnRequest } as any).where(eq(orders.id, orderId));

            await logSecurityAction({
                userId: user.id,
                action: "INITIATE_RETURN",
                entityType: "ORDER",
                entityId: String(orderId),
                oldData: { status: order.status, returnRequest: null },
                newData: { returnRequest },
            });

            logger.info("Retour initié", { userId: user.id, action: "INITIATE_RETURN", metadata: { orderId } });
            revalidatePath("/admin/caisse");
            return { success: true, orderId };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const approveReturn = withAuth(
    {
        roles: [UserRole.SUPER_ADMIN],
        schema: z.object({ orderId: z.number().int().positive() })
    },
    async ({ orderId }, user) => {
        try {
            return await db.transaction(async (tx) => {
                const order = await tx.query.orders.findFirst({
                    where: eq(orders.id, orderId),
                    with: { items: true }
                }) as any;

                if (!order) return { success: false, error: "Commande introuvable" };

                const returnReq: ReturnRequest | null = order.returnRequest;
                if (!returnReq || returnReq.status !== "EN_ATTENTE") {
                    return { success: false, error: "Aucune demande de retour en attente pour cette commande" };
                }

                // 1. Create clientPayments record (requires clientId)
                if (order.clientId) {
                    await tx.insert(clientPayments).values({
                        clientId: order.clientId,
                        orderId: order.id,
                        montantDzd: String(returnReq.montant),
                        typeAction: ClientActionType.REMBOURSEMENT,
                    });

                    // 2. Reduce client stats (Spent and Loyalty)
                    const pointsToDeduct = Math.floor(returnReq.montant / 100);
                    await tx.execute(
                        sql`UPDATE clients 
                            SET total_spent_dzd = GREATEST(0, CAST(total_spent_dzd AS numeric) - ${returnReq.montant})::text,
                                loyalty_points = GREATEST(0, loyalty_points - ${pointsToDeduct})
                            WHERE id = ${order.clientId}`
                    );

                    // 3. If CREDIT_WALLET, reduce client debt
                    if (returnReq.typeRemboursement === "CREDIT_WALLET") {
                        await tx.execute(
                            sql`UPDATE clients SET total_dette_dzd = GREATEST(0, CAST(total_dette_dzd AS numeric) - ${returnReq.montant})::text WHERE id = ${order.clientId}`
                        );
                    }
                }

                // 4. Handle Reseller Balance Restoration
                if (order.resellerId) {
                    await tx.execute(
                        sql`UPDATE resellers SET balance = balance + ${returnReq.montant} WHERE id = ${order.resellerId}`
                    );

                    // Log transaction for traceability
                    await tx.insert(supplierTransactions).values({
                        resellerId: order.resellerId,
                        orderId: order.id,
                        type: SupplierTransactionType.RECHARGE,
                        paymentStatus: "PAID",
                        paidAt: new Date(),
                        amount: returnReq.montant,
                        currency: "DZD",
                        reason: `Remboursement Commande #${order.id} (Retour Approuvé)`
                    } as any);
                }

                // 5. Restore VENDU digital codes → DISPONIBLE
                const itemIds = (order.items || []).map((i: any) => i.id);
                if (itemIds.length > 0) {
                    await tx.update(digitalCodes)
                        .set({ status: DigitalCodeStatus.DISPONIBLE, orderItemId: null })
                        .where(and(
                            inArray(digitalCodes.orderItemId, itemIds),
                            eq(digitalCodes.status, DigitalCodeStatus.VENDU)
                        ));
                    await tx.update(digitalCodeSlots)
                        .set({ status: DigitalCodeSlotStatus.DISPONIBLE, orderItemId: null })
                        .where(and(
                            inArray(digitalCodeSlots.orderItemId, itemIds),
                            eq(digitalCodeSlots.status, DigitalCodeSlotStatus.VENDU)
                        ));
                }

                // 6. Update order status and returnRequest
                const updatedReturnRequest: ReturnRequest = {
                    ...returnReq,
                    status: "APPROUVE",
                    approvedBy: user.id,
                    approvedAt: new Date().toISOString(),
                };
                await tx.update(orders)
                    .set({ status: OrderStatus.REMBOURSE, returnRequest: updatedReturnRequest } as any)
                    .where(eq(orders.id, orderId));

                // 7. Audit log
                await logSecurityAction({
                    userId: user.id,
                    action: "APPROVE_RETURN",
                    entityType: "ORDER",
                    entityId: String(orderId),
                    oldData: { returnRequest: { status: "EN_ATTENTE" } },
                    newData: { status: OrderStatus.REMBOURSE, returnRequest: updatedReturnRequest },
                });

                // 8. Telegram notification
                const clientName = order.clientId ? `Client #${order.clientId}` : "Anonyme";
                sendTelegramNotification(
                    `✅ *Retour Approuvé*\nCommande: #${order.orderNumber}\nMontant: ${returnReq.montant.toLocaleString("fr-DZ")} DA\nType: ${returnReq.typeRemboursement === "ESPECES" ? "Espèces" : "Crédit Wallet"}\nClient: ${clientName}\nPar: ${user.nom}`,
                    ["ADMIN"]
                ).catch(err => console.error("Telegram failed:", err));

                logger.info("Retour approuvé", { userId: user.id, action: "APPROVE_RETURN", metadata: { orderId } });
                revalidatePath("/admin/caisse");
                revalidatePath("/admin/clients");
                revalidatePath("/admin/resellers");
                cacheDel(...CACHE_KEYS.DASHBOARD_ALL, CACHE_KEYS.KIOSK_CATALOGUE).catch(() => { });
                return { success: true };
            });
        } catch (error) {
            logger.error((error as Error).message, { userId: user.id, action: "APPROVE_RETURN_FAILED", metadata: { orderId } });
            return { success: false, error: (error as Error).message };
        }
    }
);

export const rejectReturn = withAuth(
    {
        roles: [UserRole.SUPER_ADMIN],
        schema: z.object({
            orderId: z.number().int().positive(),
            motifRejet: z.string().min(5, "Motif de rejet requis (min 5 caractères)"),
        })
    },
    async ({ orderId, motifRejet }, user) => {
        try {
            const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) }) as any;
            if (!order) return { success: false, error: "Commande introuvable" };

            const returnReq: ReturnRequest | null = order.returnRequest;
            if (!returnReq || returnReq.status !== "EN_ATTENTE") {
                return { success: false, error: "Aucune demande de retour en attente pour cette commande" };
            }

            const updatedReturnRequest: ReturnRequest = {
                ...returnReq,
                status: "REJETE",
                rejectedBy: user.id,
                rejectedAt: new Date().toISOString(),
                motifRejet,
            };

            await db.update(orders)
                .set({
                    status: returnReq.previousOrderStatus as any,
                    returnRequest: updatedReturnRequest,
                } as any)
                .where(eq(orders.id, orderId));

            await logSecurityAction({
                userId: user.id,
                action: "REJECT_RETURN",
                entityType: "ORDER",
                entityId: String(orderId),
                oldData: { returnRequest: { status: "EN_ATTENTE" } },
                newData: { status: returnReq.previousOrderStatus, returnRequest: updatedReturnRequest },
            });

            logger.info("Retour rejeté", { userId: user.id, action: "REJECT_RETURN", metadata: { orderId } });
            revalidatePath("/admin/caisse");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const notifyTraiteurAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ orderId: z.number() })
    },
    async ({ orderId }) => {
        try {
            const OrderQueries = await getQueries();
            const order = await OrderQueries.getById(orderId);

            if (!order) throw new Error("Commande introuvable");

            // Notify Processor via n8n
            await N8nService.notifyTraiteur(order);

            // Also send Push notification
            await sendPushToRoleAction(UserRole.TRAITEUR, {
                title: "🛎️ Commande à Traiter",
                body: `La commande #${order.orderNumber} est prête pour traitement manuel.`,
                url: "/admin/traitement"
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
