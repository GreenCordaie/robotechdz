"use server";

import { db } from "@/db";
import { orders, orderItems, productVariants, supportTickets, digitalCodes, products } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { sql, eq, and, count } from "drizzle-orm";
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
    const orderNumber = `#C${count}`;

    try {
        const newOrder = await db.transaction(async (tx) => {
            let realTotalAmount = 0;
            const secureItems = [];

            for (const item of items) {
                const variant = await tx.query.productVariants.findFirst({
                    where: (v, { eq }) => eq(v.id, item.variantId)
                });

                if (!variant) throw new Error("Variante introuvable");

                const itemTotal = parseFloat(variant.salePriceDzd) * item.quantity;
                realTotalAmount += itemTotal;

                secureItems.push({
                    variantId: item.variantId,
                    name: variant.name, // Use DB name
                    price: variant.salePriceDzd,
                    quantity: item.quantity,
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

        // Telegram Notification
        const itemsMsg = items.map(i => `• ${i.name} (x${i.quantity})`).join("\n");
        const msg = `📦 *Nouvelle Commande : ${orderNumber}*\n💰 *Total* : ${(newOrder as any).verifiedTotal.toLocaleString()} DZD\n🛒 *Articles* :\n${itemsMsg}`;
        await sendTelegramNotification(msg, ['ADMIN', 'CAISSIER']);

        return newOrder;
    } catch (error) {
        console.error("Kiosk order failed:", error);
        throw new Error("Échec de la commande");
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

    // Separately fetch counts to avoid large complex joins that might leak data
    const stockCounts = await db.select({
        variantId: digitalCodes.variantId,
        count: count()
    })
        .from(digitalCodes)
        .where(eq(digitalCodes.status, "DISPONIBLE"))
        .groupBy(digitalCodes.variantId);

    const stockMap = new Map(stockCounts.map(s => [s.variantId, s.count]));

    // Reassemble safe data
    const safeProducts = productsList.map(p => ({
        ...p,
        variants: p.variants.map(v => ({
            id: v.id,
            name: v.name,
            salePriceDzd: v.salePriceDzd,
            isSharing: v.isSharing,
            totalSlots: v.totalSlots,
            stockCount: stockMap.get(v.id) || 0
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
