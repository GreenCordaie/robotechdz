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
import { OrderStatus, DigitalCodeStatus, DigitalCodeSlotStatus, SupplierTransactionType } from "@/lib/constants";

type Transaction = any; // Drizzle transaction type depends on client, using any for broad compatibility

export async function allocateOrderStock(
    tx: Transaction,
    orderId: number,
    options: { userId?: number, itemSuppliers?: Record<string, number> }
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
                    hasManualDelivery = true;
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

        if (!supplierId) {
            const variantSuppliers = await tx.query.productVariantSuppliers.findFirst({
                where: (pvs: any, { eq }: any) => eq(pvs.variantId, item.variantId)
            });
            if (variantSuppliers) {
                supplierId = variantSuppliers.supplierId;
                purchasePrice = variantSuppliers.purchasePrice;
                currency = variantSuppliers.currency;
            }
        } else {
            const link = await tx.query.productVariantSuppliers.findFirst({
                where: (pvs: any, { and, eq }: any) => and(eq(pvs.variantId, item.variantId), eq(pvs.supplierId, supplierId))
            });
            if (link) {
                purchasePrice = link.purchasePrice;
                currency = link.currency;
            }
        }

        if (supplierId && purchasePrice) {
            const priceNum = parseFloat(purchasePrice || "0");
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
                            amountToDebit += priceNum;
                            await tx.update(digitalCodes).set({ isDebitCompleted: true }).where(eq(digitalCodes.id, pid as number));
                        }
                    }
                }

                if (amountToDebit > 0) {
                    let cost = amountToDebit;
                    if (supplier.currency !== currency) {
                        if (supplier.currency === 'DZD' && currency === 'USD') cost *= EXCHANGE_RATE;
                        else if (supplier.currency === 'USD' && currency === 'DZD') cost /= EXCHANGE_RATE;
                    }

                    await tx.update(suppliers).set({ balance: sql`${suppliers.balance} - ${cost}` }).where(eq(suppliers.id, supplierId));
                    await tx.insert(supplierTransactions).values({
                        supplierId,
                        orderId,
                        type: SupplierTransactionType.ACHAT_STOCK,
                        amount: cost.toFixed(2),
                        currency: supplier.currency!,
                        reason: `Vente Automatique : ${item.name} (#${orderId})`
                    });

                    // Audit: Supplier Debit
                    await logSecurityAction({
                        userId: options.userId || null,
                        action: "AUTO_SUPPLIER_DEBIT",
                        entityType: "SUPPLIER",
                        entityId: supplierId.toString(),
                        newData: { amount: cost, currency: supplier.currency, orderId }
                    });
                }

                // Persist historical cost for margin analytics
                await tx.update(orderItems)
                    .set({
                        supplierId,
                        purchasePrice,
                        purchaseCurrency: currency
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
