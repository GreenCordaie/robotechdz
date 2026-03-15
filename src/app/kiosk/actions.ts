"use server";

import { db } from "@/db";
import { orders, orderItems, suppliers, supplierTransactions, productVariants } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { sql, eq } from "drizzle-orm";
import { sendTelegramNotification } from "@/lib/telegram";

export async function createKioskOrder(
    items: any[],
    clientTotalAmount: string, // Renamed to clarify it's an untrusted input
    deliveryMethod: "TICKET" | "WHATSAPP" = "TICKET",
    customerPhone?: string
) {
    // Generate a simple short ID (e.g., #C42)
    const countResult = await db.select({ count: sql`count(*)` }).from(orders);
    const count = (Number(countResult[0]?.count || 0) % 999) + 1; // Cycle through 1-999
    const orderNumber = `#C${count}`;

    try {
        const newOrder = await db.transaction(async (tx) => {
            // 1. Recalculate real total amount securely on the server
            let realTotalAmount = 0;
            const secureItemsToInsert = [];

            for (const item of items) {
                const variant = await tx.query.productVariants.findFirst({
                    where: (v, { eq }) => eq(v.id, item.variantId)
                });

                if (!variant) throw new Error(`Variante introuvable: ${item.variantId}`);

                const itemTotal = parseFloat(variant.salePriceDzd) * item.quantity;
                realTotalAmount += itemTotal;

                secureItemsToInsert.push({
                    variantId: item.variantId,
                    name: item.name,
                    price: variant.salePriceDzd, // Use verified DB price
                    quantity: item.quantity,
                    customData: item.customData
                });
            }

            // 2. Create the order in EN_ATTENTE status with the SERVER-VERIFIED total
            const [order] = await tx.insert(orders).values({
                orderNumber,
                status: "EN_ATTENTE",
                totalAmount: realTotalAmount.toString(),
                deliveryMethod,
                customerPhone
            }).returning();

            // 3. Create order items using secure items array
            if (secureItemsToInsert.length > 0) {
                await tx.insert(orderItems).values(
                    secureItemsToInsert.map((item) => ({
                        orderId: order.id,
                        ...item
                    }))
                );
            }

            // Bind the verified total for Telegram notification down the line
            return { ...order, verifiedTotal: realTotalAmount };
        });


        revalidatePath("/admin/caisse");
        revalidatePath("/admin/fournisseurs");

        // 3. Send Telegram Notification
        const itemsList = items.map(i => `• ${i.name} (x${i.quantity})${i.customData ? ` - *ID: ${i.customData}*` : ""}`).join("\n");
        const deliveryInfo = deliveryMethod === "WHATSAPP"
            ? `🟢 *LIVRAISON : WHATSAPP* (+213 ${customerPhone})\n`
            : `📄 *LIVRAISON : TICKET*\n`;

        const message = `📦 *Nouvelle Commande : ${orderNumber}*\n\n` +
            deliveryInfo +
            `💰 *Total* : ${(newOrder as any).verifiedTotal.toLocaleString()} DZD\n` +
            `🛒 *Articles* :\n${itemsList}\n\n` +
            `👉 _Veuillez traiter cette commande à la caisse._`;

        await sendTelegramNotification(message);

        return newOrder;
    } catch (error) {
        console.error("Kiosk transaction failed:", error);
        throw error;
    }
}

export async function getKioskData() {
    // 1. Fetch products with their variants
    // To implement "Stock Aware", we need to check DISPONIBLE codes
    const result = await db.query.products.findMany({
        with: {
            category: true,
            variants: {
                with: {
                    digitalCodes: true // Fetch all digital codes for the variant
                }
            }
        }
    });

    // No filtering for available products, return all products with their variants and codes
    const categories = await db.query.categories.findMany();

    return { products: result, categories };
}
