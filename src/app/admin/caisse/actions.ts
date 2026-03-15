"use server";

import { db } from "@/db";
import { orders, digitalCodes, orderItems, suppliers, supplierTransactions, productVariantSuppliers, clients, clientPayments, shopSettings } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendTelegramNotification } from "@/lib/telegram";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function findOrderByNumber(orderNumber: string) {
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
                    }
                }
            }
        }
    });

    if (!result) return null;

    // Flatten codes
    const mappedItems = result.items.map(item => ({
        ...item,
        codes: item.codes.map(c => c.code)
    }));

    return { ...result, items: mappedItems };
}

export async function getPendingOrders() {
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

    return results.map(order => ({
        ...order,
        items: order.items.map(item => ({
            ...item,
            codes: item.codes.map(c => c.code)
        }))
    }));
}

export async function payOrder(id: number, userId: number, options?: {
    remise: number,
    montantPaye: number,
    clientId?: number,
    itemSuppliers?: Record<number, number> // Map item index/id to supplierId
}) {
    const remise = options?.remise || 0;
    const montantPaye = options?.montantPaye || 0;
    const clientId = options?.clientId;

    try {
        await db.transaction(async (tx) => {
            // 1. Get current order to calculate debt
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

            // 2. Update order
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

            // 3. Update Client Debt if applicable
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

            // 4. Record Initial Payment if any
            if (clientId && montantPaye > 0) {
                await tx.insert(clientPayments).values({
                    clientId,
                    orderId: id,
                    montantDzd: montantPaye.toString(),
                    typeAction: "ACOMPTE"
                });
            }

            // 5. Fetch order items to handle supplier deductions
            const items = await tx.query.orderItems.findMany({
                where: (table, { eq }) => eq(table.orderId, id)
            });

            // 6. For each item, debit supplier
            for (const item of items) {
                let supplierId = options?.itemSuppliers?.[item.id];
                let purchasePriceUsd: string | null = null;

                if (supplierId) {
                    // Find the purchase price for this specific supplier
                    const link = await tx.query.productVariantSuppliers.findFirst({
                        where: (pvs, { and, eq }) => and(eq(pvs.variantId, item.variantId), eq(pvs.supplierId, supplierId!))
                    });
                    if (link) {
                        purchasePriceUsd = link.purchasePriceUsd;
                    }
                } else {
                    // Fallback to first available if none selected (should ideally be mandatory in UI)
                    const variantSuppliers = await tx.query.productVariantSuppliers.findFirst({
                        where: (pvs, { eq }) => eq(pvs.variantId, item.variantId)
                    });
                    if (variantSuppliers) {
                        supplierId = variantSuppliers.supplierId;
                        purchasePriceUsd = variantSuppliers.purchasePriceUsd;
                    }
                }

                if (supplierId && purchasePriceUsd) {
                    const totalCostUsd = (parseFloat(purchasePriceUsd) * item.quantity).toFixed(2);

                    const supplier = await tx.query.suppliers.findFirst({
                        where: (s, { eq }) => eq(s.id, supplierId)
                    });

                    if (supplier) {
                        const newBalanceUsd = (parseFloat(supplier.balanceUsd || "0") - parseFloat(totalCostUsd)).toString();
                        await tx.update(suppliers)
                            .set({ balanceUsd: newBalanceUsd })
                            .where(eq(suppliers.id, supplierId));

                        // Store selected supplier in order item for history
                        await tx.update(orderItems)
                            .set({ supplierId })
                            .where(eq(orderItems.id, item.id));

                        await tx.insert(supplierTransactions).values({
                            supplierId,
                            type: "ACHAT_STOCK",
                            amountUsd: totalCostUsd,
                            exchangeRate: supplier.exchangeRate || "0",
                            amountDzd: (parseFloat(totalCostUsd) * parseFloat(supplier.exchangeRate || "0")).toFixed(2),
                            salePriceDzd: (parseFloat(item.price || "0") * item.quantity).toFixed(2),
                            reason: `Vente Caisse : ${item.name} (x${item.quantity})`,
                            status: "COMPLETED"
                        });
                    }
                }
            }
        });

        revalidatePath("/admin/caisse");
        revalidatePath("/admin/fournisseurs");
        revalidatePath("/admin/clients");

        // 7. Send Telegram Notification
        // We need to fetch the order again or use the one from tx (was already fetched)
        const finalOrder = await db.query.orders.findFirst({
            where: (o, { eq }) => eq(o.id, id)
        });

        if (finalOrder) {
            // Get all items to provide a clear numbered list for the staff
            const orderWithItems = await db.query.orders.findFirst({
                where: (o, { eq }) => eq(o.id, id),
                with: {
                    items: true
                }
            });

            const itemsList = orderWithItems?.items.flatMap((item: any) =>
                Array.from({ length: item.quantity }, () => item.name)
            ).map((name, idx) => `  ${idx + 1}. *${name}*`).join("\n");

            const message = `✅ *Paiement Reçu : ${finalOrder.orderNumber}*\n\n` +
                `🛒 *Articles à fournir (dans cet ordre) :*\n${itemsList}\n\n` +
                `💰 *Montant Payé* : ${parseFloat(montantPaye.toString()).toLocaleString()} DZD\n` +
                `📊 *Statut* : ${finalOrder.status}\n` +
                `📉 *Reste à Payer* : ${parseFloat(finalOrder.resteAPayer || "0").toLocaleString()} DZD\n\n` +
                `📥 _Veuillez faire "Répondre" à ce message avec les codes correspondants._`;

            await sendTelegramNotification(message);
        }

        return { success: true };
    } catch (error) {
        console.error("Payment failed:", error);
        return { success: false, error: (error as Error).message };
    }
}

export async function updateOrderStatus(id: number, status: "EN_ATTENTE" | "PAYE" | "TERMINE" | "ANNULE" | "PARTIEL" | "NON_PAYE") {
    await db.update(orders)
        .set({ status })
        .where(eq(orders.id, id));
    revalidatePath("/admin/caisse");
}

export async function getPaidOrders() {
    const results = await db.query.orders.findMany({
        where: (orders, { and, eq, or, inArray }) => and(
            inArray(orders.status, ["PAYE", "LIVRE", "PARTIEL", "NON_PAYE"]),
            eq(orders.isDelivered, false)
        ),
        with: {
            items: {
                with: {
                    codes: true
                }
            }
        }
    });

    return results.map(order => ({
        ...order,
        items: order.items.map(item => ({
            ...item,
            codes: item.codes.map(c => c.code)
        }))
    }));
}

export async function markOrderAsTermine(id: number) {
    try {
        await db.update(orders)
            .set({ status: "TERMINE", isDelivered: true })
            .where(eq(orders.id, id));
        revalidatePath("/admin/traitement");
        revalidatePath("/admin/caisse");
        return { success: true };
    } catch (error) {
        console.error("Failed to mark order as termine:", error);
        return { success: false };
    }
}

export async function processOrder(id: number, codesData: any) {
    try {
        await db.transaction(async (tx) => {
            // 1. Get current status to see if it turns TERMINE or just delivered
            const current = await tx.query.orders.findFirst({
                where: (table, { eq }) => eq(table.id, id)
            });

            if (!current) throw new Error("Order not found");

            const isFullyPaid = current.status === "PAYE";
            const nextStatus = isFullyPaid ? "TERMINE" : current.status;

            await tx.update(orders)
                .set({
                    status: nextStatus,
                    isDelivered: true
                })
                .where(eq(orders.id, id));

            // 2. Save codes
            // codesData is [{ id: orderItemId, codes: ["code1", ...] }]
            if (Array.isArray(codesData)) {
                for (const itemData of codesData) {
                    const oi = await tx.query.orderItems.findFirst({
                        where: (table, { eq }) => eq(table.id, itemData.id)
                    });

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
            }
        });

        // 3. Trigger WhatsApp Delivery if needed
        const updatedOrder = await db.query.orders.findFirst({
            where: (orders, { eq }) => eq(orders.id, id),
            with: {
                items: {
                    with: {
                        codes: true
                    }
                }
            }
        });

        if (updatedOrder && updatedOrder.deliveryMethod === 'WHATSAPP' && updatedOrder.customerPhone) {
            const settings = await db.query.shopSettings.findFirst();
            if (settings?.whatsappToken && settings?.whatsappPhoneId) {
                let messageBody = `🎉 Merci pour votre achat !\nVoici votre commande ${updatedOrder.orderNumber} :\n\n`;

                updatedOrder.items.forEach(item => {
                    if (item.codes && item.codes.length > 0) {
                        messageBody += `🛒 *${item.name}* :\n`;
                        item.codes.forEach(c => {
                            messageBody += `\`${c.code}\`\n`;
                        });
                        messageBody += `\n`;
                    }
                });

                await sendWhatsAppMessage(updatedOrder.customerPhone, messageBody, {
                    whatsappToken: settings.whatsappToken,
                    whatsappPhoneId: settings.whatsappPhoneId
                });
            }
        }

        revalidatePath("/admin/traitement");
        revalidatePath("/admin/catalogue");

        return updatedOrder;
    } catch (error) {
        console.error("Order processing failed:", error);
        return { error: (error as Error).message };
    }
}

export async function getFinishedOrders() {
    const results = await db.query.orders.findMany({
        where: (orders, { and, eq, or }) => or(
            eq(orders.status, "TERMINE"),
            eq(orders.isDelivered, true)
        ),
        with: {
            items: {
                with: {
                    codes: true
                }
            }
        },
        orderBy: (orders, { desc }) => [desc(orders.createdAt)]
    });

    return results.map(order => ({
        ...order,
        items: order.items.map(item => ({
            ...item,
            codes: item.codes.map(c => c.code)
        }))
    }));
}

export async function getTodayOrders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const results = await db.query.orders.findMany({
        where: (orders, { gte }) => gte(orders.createdAt, today),
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
                    }
                }
            }
        },
        orderBy: (orders, { desc }) => [desc(orders.createdAt)]
    });

    return results.map(order => ({
        ...order,
        items: order.items.map(item => ({
            ...item,
            codes: item.codes.map(c => c.code)
        }))
    }));
}
