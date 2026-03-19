"use server";

import { db } from "@/db";
import { orders, orderItems, productVariants, supportTickets, digitalCodes, products, digitalCodeSlots } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { sql, eq, and, count, exists } from "drizzle-orm";
import { sendTelegramNotification } from "@/lib/telegram";

export async function createKioskOrder(
    items: { variantId: number; quantity: number; name: string; customData?: string; playerNickname?: string }[],
    clientTotalAmount: string,
    deliveryMethod: "TICKET" | "WHATSAPP" = "TICKET",
    customerPhone?: string
) {
    // 1. Recalculate Short Order ID
    const countResult = await db.select({ count: sql`count(*)` }).from(orders);
    const count = (Number(countResult[0]?.count || 0) % 999) + 1;
    const orderNumber = `#C${count}-${Date.now().toString().slice(-3)}`;

    try {
        const newOrder = await db.transaction(async (tx) => {
            let realTotalAmount = 0;
            const secureItems = [];

            for (const item of items) {
                const variant = await tx.query.productVariants.findFirst({
                    where: (v, { eq }) => eq(v.id, item.variantId),
                    with: {
                        variantSuppliers: {
                            limit: 1
                        }
                    }
                });

                if (!variant) throw new Error("Variante introuvable");

                const itemTotal = parseFloat(variant.salePriceDzd) * item.quantity;
                realTotalAmount += itemTotal;

                const supplierInfo = variant.variantSuppliers?.[0];

                secureItems.push({
                    variantId: item.variantId,
                    name: variant.name,
                    price: variant.salePriceDzd,
                    quantity: item.quantity,
                    supplierId: supplierInfo?.supplierId || null,
                    purchasePrice: supplierInfo?.purchasePrice || null,
                    purchaseCurrency: supplierInfo?.currency || null,
                    customData: item.customData,
                    playerNickname: item.playerNickname
                });
            }

            const [order] = await tx.insert(orders).values({
                orderNumber,
                status: "EN_ATTENTE",
                totalAmount: realTotalAmount.toFixed(2),
                deliveryMethod,
                customerPhone
            }).returning();

            await tx.insert(orderItems).values(
                secureItems.map(si => ({ orderId: order.id, ...si }))
            );

            return { ...order, verifiedTotal: realTotalAmount };
        });

        revalidatePath("/admin/caisse");

        console.log(`[KIOSK] Order created: ${orderNumber}. Notifying admins...`);

        // Telegram Notification (Non-blocking)
        const itemsMsg = items.map(i => `• ${i.name} (x${i.quantity})`).join("\n");
        const msg = `📦 *Nouvelle Commande : ${orderNumber}*\n💰 *Total* : ${(newOrder as any).verifiedTotal.toLocaleString()} DZD\n🛒 *Articles* :\n${itemsMsg}`;

        // Fire and forget, don't block the client
        sendTelegramNotification(msg, ['ADMIN', 'CAISSIER']).catch(err =>
            console.error("[KIOSK] Telegram notification failed:", err)
        );

        return newOrder;
    } catch (error) {
        console.error("Kiosk order failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
        throw new Error(`Échec de la commande: ${errorMessage}`);
    }
}

export async function getKioskData() {
    // IMPORTANT: We do NOT use .with({ digitalCodes: true }) as it leaks the actual codes to the frontend!
    // Instead, we fetch products and join with a count of available codes.

    // We fetch products and their variants
    const productsList = await db.query.products.findMany({
        where: eq(products.status, "ACTIVE"),
        with: {
            category: true,
            variants: true
        }
    });

    // Separately fetch counts for STANDARD codes
    const standardStockCounts = await db.select({
        variantId: digitalCodes.variantId,
        count: count()
    })
        .from(digitalCodes)
        .where(and(
            eq(digitalCodes.status, "DISPONIBLE"),
            exists(
                db.select().from(productVariants)
                    .where(and(
                        eq(productVariants.id, digitalCodes.variantId),
                        eq(productVariants.isSharing, false)
                    ))
            )
        ))
        .groupBy(digitalCodes.variantId);

    // Separately fetch counts for SHARING slots
    const sharingStockCounts = await db.select({
        variantId: productVariants.id,
        count: count(digitalCodeSlots.id)
    })
        .from(digitalCodeSlots)
        .innerJoin(digitalCodes, eq(digitalCodeSlots.digitalCodeId, digitalCodes.id))
        .innerJoin(productVariants, eq(digitalCodes.variantId, productVariants.id))
        .where(and(
            eq(digitalCodeSlots.status, "DISPONIBLE"),
            eq(digitalCodes.status, "DISPONIBLE"),
            eq(productVariants.isSharing, true)
        ))
        .groupBy(productVariants.id);

    const standardMap = new Map(standardStockCounts.map(s => [s.variantId, s.count]));
    const sharingMap = new Map(sharingStockCounts.map(s => [s.variantId, s.count]));

    // Reassemble safe data
    const safeProducts = productsList.map(p => ({
        ...p,
        variants: p.variants.map(v => ({
            id: v.id,
            name: v.name,
            salePriceDzd: v.salePriceDzd,
            isSharing: v.isSharing,
            totalSlots: v.totalSlots,
            stockCount: v.isSharing ? (sharingMap.get(v.id) || 0) : (standardMap.get(v.id) || 0)
        }))
    }));

    const categoriesList = await db.query.categories.findMany();

    return { products: safeProducts, categories: categoriesList };
}

export async function createSupportTicket(data: { orderNumber: string; message: string; customerPhone: string }) {
    try {
        const order = await db.query.orders.findFirst({
            where: (o, { sql }) => sql`upper(${o.orderNumber}) = upper(${data.orderNumber})`
        });

        if (!order) return { success: false, error: "Commande introuvable" };

        const [ticket] = await db.insert(supportTickets).values({
            orderId: order.id,
            subject: `Support ${order.orderNumber}`,
            message: data.message,
            customerPhone: data.customerPhone,
            status: 'OUVERT'
        }).returning();

        return { success: true, ticketId: ticket.id };
    } catch (error) {
        return { success: false, error: "Erreur lors de la création du ticket" };
    }
}
