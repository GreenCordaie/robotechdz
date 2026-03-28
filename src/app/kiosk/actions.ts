"use server";

import { db } from "@/db";
import { orders, orderItems, productVariants, supportTickets, digitalCodes, products, digitalCodeSlots } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { sql, eq, and, count, exists } from "drizzle-orm";
import { sendTelegramNotification } from "@/lib/telegram";
import { sendPushToRoleAction } from "../admin/push/actions";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";

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
                        product: true,
                        variantSuppliers: {
                            limit: 1
                        }
                    }
                });

                if (!variant) throw new Error("Variante introuvable");

                const itemTotal = parseFloat(variant.salePriceDzd) * item.quantity;
                realTotalAmount += itemTotal;

                const supplierInfo = variant.variantSuppliers?.[0];
                const productName = (variant as any).product?.name;
                const fullName = productName ? `${productName} — ${variant.name}` : variant.name;

                secureItems.push({
                    variantId: item.variantId,
                    name: fullName,
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

        // Invalider le cache catalogue pour forcer le refresh des stocks
        await cacheDel(CACHE_KEYS.KIOSK_CATALOGUE);

        revalidatePath("/admin/caisse");

        // Publish ORDER_CREATED event (Background worker will handle Telegram/Push)
        const { eventBus, SystemEvent } = await import("@/lib/events");
        eventBus.publish(SystemEvent.ORDER_CREATED, {
            orderId: newOrder.id,
            orderNumber: orderNumber,
            totalAmount: (newOrder as any).verifiedTotal,
            items: items.map(i => ({ name: i.name, quantity: i.quantity }))
        });

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

    // Cache-aside: try to serve from Redis first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = await cacheGet<{ products: any[]; categories: any[] }>(CACHE_KEYS.KIOSK_CATALOGUE);
    if (cached) return cached;

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
        })),
        // On s'assure que isManualDelivery est explicitement passé
        isManualDelivery: !!p.isManualDelivery
    }));

    const categoriesList = await db.query.categories.findMany();

    const result = { products: safeProducts, categories: categoriesList };

    // Fire-and-forget: populate cache after DB fetch
    cacheSet(CACHE_KEYS.KIOSK_CATALOGUE, result, CACHE_TTL.KIOSK_CATALOGUE).catch(() => { });

    return result;
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
