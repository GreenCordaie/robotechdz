import { db } from "@/db";
import {
    orders,
    digitalCodes,
    digitalCodeSlots,
    orderItems,
    suppliers,
    supplierTransactions,
    productVariantSuppliers
} from "@/db/schema";
import { eq, and, sql, inArray, exists } from "drizzle-orm";
import { checkStockAndAlert } from "@/lib/stock-alerts";
import { logSecurityAction } from "@/lib/security";
import { logger } from "@/lib/logger";
import { OrderStatus, DigitalCodeStatus, DigitalCodeSlotStatus, SupplierTransactionType } from "@/lib/constants";

type Transaction = any; // Drizzle transaction type depends on client, using any for broad compatibility

export async function allocateOrderStock(
    tx: Transaction,
    orderId: number,
    options: {
        userId?: number,
        itemSuppliers?: Record<string, number>,
        itemPriceOverrides?: Record<string, { price: string, currency: string }>
    }
) {
    const items = await tx.query.orderItems.findMany({
        where: (table: any, { eq }: any) => eq(table.orderId, orderId),
        with: {
            variant: {
                with: {
                    product: true
                }
            }
        }
    });

    let hasManualDelivery = false;

    // Fetch dynamic exchange rate
    const settings = await tx.query.shopSettings.findFirst();
    const EXCHANGE_RATE = settings?.usdExchangeRate ? parseFloat(settings.usdExchangeRate) : 245;

    for (const item of items) {
        let currentItemSlots: any[] = [];

        // 1. Digital Stock Allocation
        if (item.variant?.product?.isManualDelivery === false) {
            if (item.variant.isSharing) {
                const availableSlots = await tx.select({
                    id: digitalCodeSlots.id,
                    digitalCodeId: digitalCodeSlots.digitalCodeId,
                    slotNumber: digitalCodeSlots.slotNumber,
                    status: digitalCodeSlots.status,
                    digitalCode: {
                        id: digitalCodes.id,
                        code: digitalCodes.code,
                        status: digitalCodes.status,
                        variantId: digitalCodes.variantId
                    }
                })
                    .from(digitalCodeSlots)
                    .innerJoin(digitalCodes, eq(digitalCodes.id, digitalCodeSlots.digitalCodeId))
                    .where(and(
                        eq(digitalCodeSlots.status, DigitalCodeSlotStatus.DISPONIBLE),
                        eq(digitalCodes.variantId, item.variantId),
                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE)
                    ))
                    .orderBy(digitalCodeSlots.digitalCodeId, digitalCodeSlots.slotNumber)
                    .limit(item.quantity)
                    .for('update');

                if (availableSlots.length < item.quantity) {
                    console.log(`[STOCK] Stock partiel pour ${item.name} (${availableSlots.length}/${item.quantity}). Bascule en livraison manuelle.`);
                    hasManualDelivery = true;
                    // On ne fait rien : l'article sera traité manuellement par l'admin plus tard
                    continue;
                }

                currentItemSlots = availableSlots;
                const slotIds = availableSlots.map((s: any) => s.id);
                await tx.update(digitalCodeSlots)
                    .set({ status: DigitalCodeSlotStatus.VENDU, orderItemId: item.id })
                    .where(inArray(digitalCodeSlots.id, slotIds));

                // Mark parent codes as VENDU if all slots are gone
                const parentCodeIds = Array.from(new Set(availableSlots.map((s: any) => s.digitalCodeId)));
                for (const pid of parentCodeIds) {
                    const remainingSlots = await tx.query.digitalCodeSlots.findMany({
                        where: (dcs: any, { and, eq }: any) => and(eq(dcs.digitalCodeId, pid), eq(dcs.status, "DISPONIBLE"))
                    });
                    if (remainingSlots.length === 0) {
                        await tx.update(digitalCodes).set({ status: DigitalCodeStatus.VENDU }).where(eq(digitalCodes.id, pid as number));
                    }
                }
            } else {
                const availableCodes = await tx.select()
                    .from(digitalCodes)
                    .where(and(
                        eq(digitalCodes.variantId, item.variantId),
                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE)
                    ))
                    .limit(item.quantity)
                    .for('update');

                if (availableCodes.length < item.quantity) {
                    console.log(`[STOCK] Stock épuisé pour ${item.name}. Bascule en livraison manuelle.`);
                    hasManualDelivery = true;
                    continue;
                }

                const codeIds = availableCodes.map((c: any) => (c as any).id);
                await tx.update(digitalCodes)
                    .set({ status: DigitalCodeStatus.VENDU, orderItemId: item.id })
                    .where(inArray(digitalCodes.id, codeIds));

                // Audit: Stock movement
                await logSecurityAction({
                    userId: options.userId || null,
                    action: "AUTO_STOCK_ALLOCATION",
                    entityType: "ORDER_ITEM",
                    entityId: item.id.toString(),
                    newData: { variantId: item.variantId, quantity: item.quantity, codeIds }
                });
            }
        } else {
            hasManualDelivery = true;
        }

        // 2. Supplier Reconciliation (Debit)
        let supplierId = (options?.itemSuppliers as any)?.[item.id];
        let purchasePrice: string | null = null;
        let currency: string = "USD";

        // Check if cashier provided a manual override for this item's cost
        const priceOverride = (options?.itemPriceOverrides as any)?.[item.id.toString()];

        if (!supplierId) {
            const variantSuppliers = await tx.query.productVariantSuppliers.findFirst({
                where: (pvs: any, { eq }: any) => eq(pvs.variantId, item.variantId)
            });
            if (variantSuppliers) {
                supplierId = variantSuppliers.supplierId;
                purchasePrice = priceOverride?.price ?? variantSuppliers.purchasePrice;
                currency = priceOverride?.currency ?? variantSuppliers.currency;
            }
        } else {
            const link = await tx.query.productVariantSuppliers.findFirst({
                where: (pvs: any, { and, eq }: any) => and(eq(pvs.variantId, item.variantId), eq(pvs.supplierId, supplierId))
            });
            purchasePrice = priceOverride?.price ?? (link?.purchasePrice || null);
            currency = priceOverride?.currency ?? (link?.currency || "USD");
        }

        if (supplierId && (purchasePrice || priceOverride)) {
            const priceNum = parseFloat(purchasePrice || priceOverride?.price || "0");
            const supplier = await tx.query.suppliers.findFirst({
                where: (s: any, { eq }: any) => eq(s.id, supplierId)
            });

            if (supplier) {
                let amountToDebit = item.variant?.isSharing ? 0 : priceNum * item.quantity;

                if (item.variant?.isSharing) {
                    const uniqueParentIds = Array.from(new Set(currentItemSlots.map(s => s.digitalCodeId)));
                    for (const pid of uniqueParentIds) {
                        const parent = await tx.query.digitalCodes.findFirst({ where: eq(digitalCodes.id, pid as number) });
                        if (parent && !parent.isDebitCompleted) {
                            // If it's a sharing variant, priceNum is the account price (if not overridden)
                            // or the overridden account price.
                            amountToDebit += priceNum;
                            await tx.update(digitalCodes).set({ isDebitCompleted: true }).where(eq(digitalCodes.id, pid as number));
                        }
                    }
                }

                if (amountToDebit > 0) {
                    let cost = amountToDebit;
                    const debitCurrency = priceOverride?.currency ?? currency;
                    if (supplier.currency !== debitCurrency) {
                        if (supplier.currency === 'DZD' && debitCurrency === 'USD') cost *= EXCHANGE_RATE;
                        else if (supplier.currency === 'USD' && debitCurrency === 'DZD') cost /= EXCHANGE_RATE;
                    }

                    await tx.update(suppliers).set({ balance: sql`${suppliers.balance} - ${cost}` }).where(eq(suppliers.id, supplierId));
                    await tx.insert(supplierTransactions).values({
                        supplierId,
                        orderId,
                        type: SupplierTransactionType.ACHAT_STOCK,
                        amount: cost.toFixed(2),
                        currency: supplier.currency!,
                        reason: `Vente Automatique : ${item.name} (#${orderId}) (Prix Manuel: ${priceOverride ? 'OUI' : 'NON'})`
                    });

                    await logSecurityAction({
                        userId: options.userId || null,
                        action: "AUTO_SUPPLIER_DEBIT",
                        entityType: "SUPPLIER",
                        entityId: supplierId.toString(),
                        newData: { amount: cost, currency: supplier.currency, orderId, isManual: !!priceOverride }
                    });
                }

                // --- 📊 Persist historical cost for margin analytics ---
                let finalPurchasePrice = priceOverride?.price ?? purchasePrice;
                let finalPurchaseCurrency = priceOverride?.currency ?? currency;

                // If it's a sharing variant AND NO MANUAL OVERRIDE, calculate prorated cost per slot
                if (item.variant?.isSharing && currentItemSlots.length > 0 && !priceOverride) {
                    let totalProratedCost = 0;
                    for (const slot of currentItemSlots) {
                        const dcPrice = slot.digitalCode?.purchasePrice ? parseFloat(slot.digitalCode.purchasePrice) : priceNum;
                        const totalSlots = item.variant.totalSlots || 5;
                        totalProratedCost += (dcPrice / totalSlots);
                    }
                    finalPurchasePrice = (totalProratedCost / item.quantity).toFixed(2);
                    finalPurchaseCurrency = currentItemSlots[0].digitalCode?.purchaseCurrency || currency;
                }

                await tx.update(orderItems)
                    .set({
                        supplierId,
                        purchasePrice: finalPurchasePrice,
                        purchaseCurrency: finalPurchaseCurrency
                    })
                    .where(eq(orderItems.id, item.id));
            }
        }

        // 3. Trigger Stock Alerts
        await checkStockAndAlert(item.variantId);
    }

    // 4. Final Finalization: If no manual items, mark as TERMINE
    if (!hasManualDelivery) {
        await tx.update(orders)
            .set({ status: OrderStatus.TERMINE, isDelivered: true })
            .where(eq(orders.id, orderId));
    }

    return { hasManualDelivery };
}
