"use server";

import { db } from "@/db";
import { orders, digitalCodes, digitalCodeSlots, orderItems, suppliers, supplierTransactions, productVariantSuppliers, clients, clientPayments, shopSettings, resellers } from "@/db/schema";
import { eq, sql, desc, exists, and, inArray, count, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendTelegramNotification } from "@/lib/telegram";
import { triggerOrderDelivery } from "@/lib/delivery";
import { withAuth, logSecurityAction } from "@/lib/security";
import { z } from "zod";
import { allocateOrderStock } from "@/lib/orders";
import { sendPushToRoleAction, sendPushToUserAction } from "../push/actions";
import { decrypt } from "@/lib/encryption";

export const findOrderByNumber = withAuth(
    {
        roles: ["ADMIN", "CAISSIER"],
        schema: z.object({ orderNumber: z.string() })
    },
    async ({ orderNumber }) => {
        const result = await db.query.orders.findFirst({
            where: (orders, { sql }) => sql`upper(${orders.orderNumber}) = upper(${orderNumber})`,
            with: {
                items: {
                    with: {
                        codes: true,
                        variant: {
                            with: {
                                variantSuppliers: {
                                    with: {
                                        supplier: true
                                    }
                                }
                            }
                        },
                        slots: {
                            with: {
                                digitalCode: true
                            }
                        }
                    }
                }
            }
        });

        if (!result) return null;

        const mappedItems = (result as any).items.map((item: any) => {
            return {
                ...item,
                fullCodes: (item.codes || []).map((c: any) => ({ id: c.id, code: decrypt(c.code) || "[ERREUR DÉCRYPTAGE]" })),
                fullSlots: (item.slots || []).map((s: any) => ({
                    id: s.id,
                    code: decrypt(s.code) || "[ERREUR DÉCRYPTAGE]",
                    slotNumber: s.slotNumber,
                    profileName: s.profileName,
                    parentCode: decrypt(s.digitalCode.code) || "[ERREUR DÉCRYPTAGE]"
                }))
            };
        });

        return { ...result, items: mappedItems };
    }
);

export const getPendingOrders = withAuth(
    { roles: ["ADMIN", "CAISSIER"] },
    async () => {
        const results = await db.query.orders.findMany({
            where: (orders, { eq }) => eq(orders.status, "EN_ATTENTE"),
            with: {
                items: {
                    with: {
                        codes: true
                    }
                }
            },
            orderBy: (orders, { desc }) => [desc(orders.createdAt)]
        });

        return (results as any[]).map(order => ({
            ...order,
            items: (order.items || []).map((item: any) => ({
                ...item,
                codes: (item.codes || []).map((c: any) => decrypt(c.code) || "[ERREUR DÉCRYPTAGE]")
            }))
        }));
    }
);

export const payOrder = withAuth(
    {
        roles: ["ADMIN", "CAISSIER"],
        schema: z.object({
            id: z.number(),
            options: z.object({
                remise: z.number(),
                montantPaye: z.number(),
                clientId: z.number().optional(),
                itemSuppliers: z.record(z.string(), z.number()).optional()
            })
        })
    },
    async ({ id, options }, user) => {
        const remise = options.remise || 0;
        const montantPaye = options.montantPaye || 0;
        const clientId = options.clientId;
        const userId = user.id; // Fixed: Use ID from session, not argument

        try {
            const result = await db.transaction(async (tx) => {
                const order = await tx.query.orders.findFirst({
                    where: (table, { eq }) => eq(table.id, id)
                });

                if (!order) throw new Error("Commande introuvable");

                const totalApresRemise = parseFloat(order.totalAmount) - remise;
                const resteAPayer = Math.max(0, totalApresRemise - montantPaye);

                let status: "PAYE" | "PARTIEL" | "NON_PAYE" = "PAYE";
                if (resteAPayer > 0) {
                    status = montantPaye === 0 ? "NON_PAYE" : "PARTIEL";
                }

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
                        typeAction: "ACOMPTE"
                    });
                }

                // 3. Centralized Allocation
                await allocateOrderStock(tx, id, {
                    userId,
                    itemSuppliers: options.itemSuppliers
                });

                // 4. Fetch Enriched Order for Frontend Return
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

            revalidatePath("/admin/caisse");
            revalidatePath("/admin/traitement");

            // Trigger Push Notification for Traiteurs if paid
            if (result?.status === "PAYE") {
                // Start async without awaiting to not block response
                sendPushToRoleAction("TRAITEUR", {
                    title: "🔔 Nouvelle Commande",
                    body: `Commande #${result.orderNumber} payée. À préparer !`,
                    url: "/admin/traitement"
                }).catch(err => console.error("Push trigger error:", err));
            }

            // Non-blocking background delivery
            triggerOrderDelivery(id).catch(err => {
                console.error(`[Background Delivery Error] Order #${id}:`, err);
            });

            return { success: true, order: result };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const updateOrderStatus = withAuth(
    {
        roles: ["ADMIN", "CAISSIER"],
        schema: z.object({ id: z.number(), status: z.enum(["EN_ATTENTE", "PAYE", "TERMINE", "ANNULE", "PARTIEL", "NON_PAYE"]) })
    },
    async ({ id, status }) => {
        await db.update(orders).set({ status }).where(eq(orders.id, id));
        revalidatePath("/admin/caisse");
        return { success: true };
    }
);

export const getPaidOrders = withAuth(
    { roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
    async () => {
        try {
            const results = await db.query.orders.findMany({
                where: (orders, { and, eq, inArray }) => and(
                    inArray(orders.status, ["PAYE", "LIVRE", "PARTIEL", "NON_PAYE"]),
                    eq(orders.isDelivered, false)
                ),
                with: {
                    items: {
                        with: {
                            codes: true,
                            slots: { with: { digitalCode: true } }
                        }
                    }
                }
            });

            return (results as any[]).map(res => ({
                ...res,
                items: (res.items || []).map((item: any) => {
                    const standardCodes = (item.codes || []).map((c: any) => {
                        try { return decrypt(c.code) || "[Invalide]"; } catch { return "[Erreur]"; }
                    });
                    const slotCodes = (item.slots || []).map((s: any) => {
                        try {
                            const decryptedParent = decrypt(s.digitalCode.code);
                            const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                            let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                            if (decryptedSlotPin) slotInfo += ` | PIN: ${decryptedSlotPin}`;
                            return slotInfo;
                        } catch {
                            return "[Erreur Profil]";
                        }
                    });
                    return { ...item, codes: [...standardCodes, ...slotCodes] };
                })
            }));
        } catch (error) {
            console.error("getPaidOrders failed:", error);
            return { success: false, error: "Failed to fetch paid orders" };
        }
    }
);

export const processOrder = withAuth(
    {
        roles: ["ADMIN", "CAISSIER", "TRAITEUR"],
        schema: z.object({ id: z.number(), codesData: z.array(z.object({ id: z.number(), codes: z.array(z.string()) })) })
    },
    async ({ id, codesData }) => {
        try {
            await db.transaction(async (tx) => {
                const current = await tx.query.orders.findFirst({ where: eq(orders.id, id) });
                if (!current) throw new Error("Order not found");

                const nextStatus = current.status === "PAYE" ? "TERMINE" : current.status;
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
                                    status: "VENDU"
                                });
                            }
                        }
                    }
                }
            });

            revalidatePath("/admin/caisse");

            // Non-blocking background delivery
            triggerOrderDelivery(id).catch(err => {
                console.error(`[Background Delivery Error] Order #${id}:`, err);
            });

            const enrichedOrder = await db.query.orders.findFirst({
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

            if (!enrichedOrder) throw new Error("Erreur de récupération de la commande validée");

            const order = enrichedOrder as any;
            return {
                ...order,
                items: order.items.map((item: any) => {
                    const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code) || "[ERREUR DÉCRYPTAGE]");
                    const slotCodes = (item.slots || []).map((s: any) => {
                        const decryptedParent = decrypt(s.digitalCode.code) || "[ERREUR COMPTE]";
                        const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                        let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                        if (s.code) slotInfo += ` | PIN: ${decryptedSlotPin || "[ERREUR PIN]"}`;
                        return slotInfo;
                    });
                    return { ...item, codes: [...standardCodes, ...slotCodes] };
                })
            };
        } catch (error) {
            return { error: (error as Error).message };
        }
    }
);

export const getTodayOrders = withAuth(
    { roles: ["ADMIN", "CAISSIER"] },
    async () => {
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const results = await db.query.orders.findMany({
                where: (orders, { gte }) => gte(orders.createdAt, startOfDay),
                with: {
                    items: {
                        with: {
                            codes: true,
                            slots: { with: { digitalCode: true } }
                        }
                    },
                    client: true
                },
                orderBy: (orders, { desc }) => [desc(orders.createdAt)]
            });

            return (results as any[]).map(res => ({
                ...res,
                nomComplet: res.client?.nomComplet || "Anonyme",
                telephone: res.client?.telephone || res.customerPhone,
                items: (res.items || []).map((item: any) => {
                    const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code) || "[ERREUR DÉCRYPTAGE]");
                    const slotCodes = (item.slots || []).map((s: any) => {
                        const decryptedParent = decrypt(s.digitalCode.code) || "[ERREUR COMPTE]";
                        const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                        let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                        if (s.code) slotInfo += ` | PIN: ${decryptedSlotPin || "[ERREUR PIN]"}`;
                        return slotInfo;
                    });
                    return { ...item, codes: [...standardCodes, ...slotCodes] };
                })
            }));
        } catch (error) {
            console.error("getTodayOrders failed:", error);
            return { success: false, error: "Failed to fetch today orders" };
        }
    }
);

export const markOrderAsTermine = withAuth(
    {
        roles: ["ADMIN", "CAISSIER", "TRAITEUR"],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        const order = await db.query.orders.findFirst({
            where: eq(orders.id, id),
            columns: { orderNumber: true, userId: true, resellerId: true }
        });

        await db.update(orders).set({ status: "TERMINE", isDelivered: true }).where(eq(orders.id, id));
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
    { roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
    async () => {
        try {
            const results = await db.query.orders.findMany({
                where: (orders, { eq }) => eq(orders.status, "TERMINE"),
                with: {
                    items: {
                        with: {
                            codes: true,
                            slots: { with: { digitalCode: true } }
                        }
                    }
                },
                limit: 20,
                orderBy: (orders, { desc }) => [desc(orders.createdAt)]
            });

            return (results as any[]).map(res => ({
                ...res,
                items: (res.items || []).map((item: any) => {
                    const standardCodes = (item.codes || []).map((c: any) => {
                        try { return decrypt(c.code) || "[Invalide]"; } catch { return "[Erreur]"; }
                    });
                    const slotCodes = (item.slots || []).map((s: any) => {
                        try {
                            const decryptedParent = decrypt(s.digitalCode.code);
                            const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                            let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                            if (decryptedSlotPin) slotInfo += ` | PIN: ${decryptedSlotPin}`;
                            return slotInfo;
                        } catch {
                            return "[Erreur Profil]";
                        }
                    });
                    return { ...item, codes: [...standardCodes, ...slotCodes] };
                })
            }));
        } catch (error) {
            console.error("getFinishedOrders failed:", error);
            return { success: false, error: "Failed to fetch finished orders" };
        }
    }
);

export const replaceOrderItemCode = withAuth(
    {
        roles: ["ADMIN"],
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
                    await tx.update(digitalCodes).set({ status: "DEFECTUEUX" }).where(eq(digitalCodes.id, oldCodeId));
                } else if (oldSlotId) {
                    await tx.update(digitalCodeSlots).set({ status: "DEFECTUEUX" }).where(eq(digitalCodeSlots.id, oldSlotId));
                }

                // 2. Find new code/slot
                if (item.variant.isSharing) {
                    const newSlot = await tx.query.digitalCodeSlots.findFirst({
                        where: (dcs, { and, eq, exists }) => and(
                            eq(dcs.status, "DISPONIBLE"),
                            exists(
                                tx.select().from(digitalCodes)
                                    .where(and(
                                        eq(digitalCodes.id, dcs.digitalCodeId),
                                        eq(digitalCodes.variantId, item.variantId),
                                        eq(digitalCodes.status, "DISPONIBLE")
                                    ))
                            )
                        ),
                        orderBy: (dcs, { asc }) => [asc(dcs.digitalCodeId), asc(dcs.slotNumber)]
                    });

                    if (!newSlot) throw new Error("Plus de slots disponibles en stock");

                    await tx.update(digitalCodeSlots)
                        .set({ status: "VENDU", orderItemId: item.id })
                        .where(eq(digitalCodeSlots.id, newSlot.id));

                    revalidatePath("/admin/caisse");
                    return { success: true };
                } else {
                    const newCode = await tx.query.digitalCodes.findFirst({
                        where: and(eq(digitalCodes.variantId, item.variantId), eq(digitalCodes.status, "DISPONIBLE"))
                    });

                    if (!newCode) throw new Error("Plus de codes disponibles en stock");

                    await tx.update(digitalCodes)
                        .set({ status: "VENDU", orderItemId: item.id })
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
        roles: ["ADMIN"],
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

                const status = returnToStock ? "DISPONIBLE" : "DEFECTUEUX";

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
        roles: ["ADMIN"],
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
                    const status = returnToStock ? "DISPONIBLE" : "DEFECTUEUX";
                    await tx.update(digitalCodes).set({ status, orderItemId: null }).where(eq(digitalCodes.orderItemId, item.id));
                    await tx.update(digitalCodeSlots).set({ status, orderItemId: null }).where(eq(digitalCodeSlots.orderItemId, item.id));
                }

                await tx.update(orders).set({ status: "REMBOURSE" }).where(eq(orders.id, id));
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
        roles: ["ADMIN", "CAISSIER"],
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

                await tx.update(orders).set({ status: "ANNULE" }).where(eq(orders.id, orderId));

                for (const item of (order.items || [])) {
                    if (item.codes && item.codes.length > 0) {
                        const codeIds = item.codes.map((c: any) => c.id);
                        await tx.update(digitalCodes).set({ status: "DISPONIBLE", orderItemId: null, isDebitCompleted: false }).where(inArray(digitalCodes.id, codeIds));
                    }
                    if (item.slots && item.slots.length > 0) {
                        const slotIds = item.slots.map((s: any) => s.id);
                        await tx.update(digitalCodeSlots).set({ status: "DISPONIBLE", orderItemId: null }).where(inArray(digitalCodeSlots.id, slotIds));
                        const parentIds = Array.from(new Set(item.slots.map((s: any) => s.digitalCodeId)));
                        for (const pid of parentIds) {
                            await tx.update(digitalCodes).set({ status: "DISPONIBLE", isDebitCompleted: false }).where(eq(digitalCodes.id, pid as any as number));
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
                        .set({ balance: sql`${suppliers.balance} + ${st.amount}` })
                        .where(eq(suppliers.id, st.supplierId));

                    // Log the reversal
                    await tx.insert(supplierTransactions).values({
                        supplierId: st.supplierId,
                        orderId: orderId,
                        type: "RECHARGE",
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
    { roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
    async () => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const result = await db.select({ count: count() })
            .from(orders)
            .where(and(
                eq(orders.status, "EN_ATTENTE"),
                gte(orders.createdAt, startOfDay)
            ));

        return { count: result[0]?.count || 0 };
    }
);
export const resendWhatsAppAction = withAuth(
    {
        roles: ["ADMIN", "CAISSIER"],
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
