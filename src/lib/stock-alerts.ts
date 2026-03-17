import { db } from "@/db";
import { digitalCodes, digitalCodeSlots, productVariants, products } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { sendTelegramNotification } from "./telegram";

const STOCK_THRESHOLD = 5;

/**
 * Checks the stock level for a specific product variant and sends an alert if it's below the threshold.
 */
export async function checkStockAndAlert(variantId: number) {
    try {
        // 1. Get variant and product info
        const variant = await db.query.productVariants.findFirst({
            where: eq(productVariants.id, variantId),
            with: {
                product: true
            }
        });

        if (!variant) return;

        // 2. Count available stock
        let availableCount = 0;
        if (variant.isSharing) {
            const res = await db.select({ val: count() })
                .from(digitalCodeSlots)
                .where(and(
                    eq(digitalCodeSlots.status, "DISPONIBLE"),
                    // Ensure the parent code is also available (safety check)
                    // This is simplified; we just count available slots linked to this variant indirectly via digitalCodes
                ));
            // For simplicity in sharing, we'll count available slots for ANY digitalCode belonging to this variant
            const availableSlots = await db.select({ val: count() })
                .from(digitalCodeSlots)
                .innerJoin(digitalCodes, eq(digitalCodeSlots.digitalCodeId, digitalCodes.id))
                .where(and(
                    eq(digitalCodes.variantId, variantId),
                    eq(digitalCodeSlots.status, "DISPONIBLE")
                ));
            availableCount = Number(availableSlots[0]?.val || 0);
        } else {
            const availableCodes = await db.select({ val: count() })
                .from(digitalCodes)
                .where(and(
                    eq(digitalCodes.variantId, variantId),
                    eq(digitalCodes.status, "DISPONIBLE")
                ));
            availableCount = Number(availableCodes[0]?.val || 0);
        }

        // 3. Alert if low
        if (availableCount <= STOCK_THRESHOLD) {
            const productName = (variant as any).product?.name || "Produit inconnu";
            const message = `⚠️ *ALERTE STOCK BAS*\n\n` +
                `Produit : *${productName}*\n` +
                `Variante : *${variant.name}*\n` +
                `Stock restant : *${availableCount}*\n\n` +
                `_Veuillez réapprovisionner rapidement._`;

            await sendTelegramNotification(message, ['ADMIN']);
        }
    } catch (error) {
        console.error("Error in checkStockAndAlert:", error);
    }
}
