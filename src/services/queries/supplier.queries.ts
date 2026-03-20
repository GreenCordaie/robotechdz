import { db } from "@/db";
import { suppliers, supplierTransactions, orderItems, orders, shopSettings } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { cache } from "react";
import { OrderStatus } from "@/lib/constants";

export class SupplierQueries {

    /**
     * Gets all suppliers with their last 5 transactions.
     */
    static getAll = cache(async () => {
        return await db.query.suppliers.findMany({
            orderBy: [desc(suppliers.id)],
            with: { transactions: { limit: 5, orderBy: [desc(supplierTransactions.createdAt)] } }
        });
    });

    /**
     * Gets transaction history for a specific supplier.
     */
    static getHistory = cache(async (supplierId: number) => {
        return await db.query.supplierTransactions.findMany({
            where: supplierId > 0 ? eq(supplierTransactions.supplierId, supplierId) : undefined,
            orderBy: [desc(supplierTransactions.createdAt)],
            with: { supplier: true }
        });
    });

    /**
     * Calculates financial stats related to suppliers (Debts, Net Profit).
     */
    static getFinancialStats = cache(async () => {
        const settings = await db.query.shopSettings.findFirst();
        const exchangeRate = parseFloat(settings?.usdExchangeRate || "245");

        const allTransactions = await db.query.supplierTransactions.findMany();

        let totalPaidDzd = 0;
        let totalUnpaidDzd = 0;

        allTransactions.forEach(r => {
            const amount = parseFloat(r.amount);
            const txRate = r.exchangeRate ? parseFloat(r.exchangeRate) : exchangeRate;
            const dzdAmount = r.currency === "USD" ? amount * txRate : amount;

            if (r.type === "RECHARGE") {
                if (r.paymentStatus === "PAID") {
                    totalPaidDzd += dzdAmount;
                } else {
                    totalUnpaidDzd += dzdAmount;
                }
            } else if (r.type === "PAYMENT") {
                totalUnpaidDzd -= dzdAmount;
                totalPaidDzd += dzdAmount;
            }
        });

        const salesItems = await db.select({
            price: orderItems.price,
            quantity: orderItems.quantity,
            purchasePrice: orderItems.purchasePrice,
            purchaseCurrency: orderItems.purchaseCurrency
        }).from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(
                sql`${orders.status} IN (${OrderStatus.PAYE}, ${OrderStatus.LIVRE}, ${OrderStatus.TERMINE})`
            );

        let totalNetProfit = 0;
        salesItems.forEach(item => {
            const saleTotal = parseFloat(item.price) * (item.quantity || 1);
            let costDzd = 0;

            if (item.purchasePrice) {
                const pPrice = parseFloat(item.purchasePrice);
                costDzd = item.purchaseCurrency === 'USD'
                    ? pPrice * (item.quantity || 1) * exchangeRate
                    : pPrice * (item.quantity || 1);
            } else {
                costDzd = saleTotal * 0.85;
            }

            totalNetProfit += (saleTotal - costDzd);
        });

        return {
            totalPaidDzd: totalPaidDzd.toFixed(2),
            totalUnpaidDzd: totalUnpaidDzd.toFixed(2),
            netProfit: totalNetProfit.toFixed(2),
            exchangeRate: exchangeRate.toString()
        };
    });
}
