import { db } from "@/db";
import { suppliers, supplierTransactions, orderItems, orders, shopSettings } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { cache } from "react";
import { OrderStatus } from "@/lib/constants";
import { logger } from "@/lib/logger";

// Hard ceilings for the transaction-history reader so a high-volume supplier
// can't return thousands of rows in one round trip. Default 200 is comfortably
// above the existing UI footprint (the only page caller renders a recent-
// history list); max 1_000 leaves headroom for an exceptional CSV-style dump.
const SUPPLIER_HISTORY_DEFAULT_LIMIT = 200;
const SUPPLIER_HISTORY_MAX_LIMIT = 1_000;

export class SupplierQueries {

    /**
     * Gets all INTERNAL_STOCK suppliers with their last 5 transactions.
     * External-API suppliers (CapSolver, 2Captcha, ...) are excluded; use
     * `getExternal()` to fetch those for the dedicated UI section.
     */
    static getAll = cache(async () => {
        return await db.query.suppliers.findMany({
            where: eq(suppliers.type, "INTERNAL_STOCK"),
            orderBy: [desc(suppliers.id)],
            with: { transactions: { limit: 5, orderBy: [desc(supplierTransactions.createdAt)] } }
        });
    });

    /**
     * Gets external-API balance-tracked suppliers (auto-refreshed by cron).
     */
    static getExternal = cache(async () => {
        return await db.query.suppliers.findMany({
            where: eq(suppliers.type, "EXTERNAL_API"),
            orderBy: [desc(suppliers.id)],
        });
    });

    /**
     * Gets transaction history for a specific supplier, or — when `supplierId === 0` —
     * the most-recent transactions across all suppliers (used by the admin
     * /fournisseurs landing page).
     *
     * Server-side hard ceiling: default 200, max 1_000. Prevents the previous
     * unbounded `findMany` that walked the entire `supplierTransactions` table
     * for a high-volume supplier (or for the cross-supplier `0` sentinel).
     *
     * `supplierId < 0` is rejected — it's never a legitimate value and the old
     * code silently treated it as "all" (same path as 0). Throws so the bug is
     * loud rather than silently returning every row.
     */
    static getHistory = cache(async (supplierId: number, limit: number = SUPPLIER_HISTORY_DEFAULT_LIMIT) => {
        if (!Number.isFinite(supplierId) || supplierId < 0) {
            throw new Error(`SupplierQueries.getHistory: invalid supplierId ${supplierId}`);
        }

        const requested = Number.isFinite(limit) ? Math.floor(limit) : SUPPLIER_HISTORY_DEFAULT_LIMIT;
        const effectiveLimit = Math.min(Math.max(requested, 1), SUPPLIER_HISTORY_MAX_LIMIT);
        if (requested > SUPPLIER_HISTORY_MAX_LIMIT) {
            logger.warn("SupplierQueries.getHistory: caller-requested limit capped", {
                action: "SupplierQueries.getHistory",
                metadata: { requested, capped: effectiveLimit, ceiling: SUPPLIER_HISTORY_MAX_LIMIT, supplierId },
            });
        }

        return await db.query.supplierTransactions.findMany({
            where: supplierId > 0 ? eq(supplierTransactions.supplierId, supplierId) : undefined,
            orderBy: [desc(supplierTransactions.createdAt)],
            limit: effectiveLimit,
            with: { supplier: true }
        });
    });

    /**
     * Calculates financial stats related to suppliers (Debts, Net Profit).
     *
     * Aggregation note: the previous implementation streamed every
     * `supplierTransactions` row into JS and reduced it. We now push the
     * SUM/COUNT into Postgres and group by `(type, paymentStatus, currency,
     * exchangeRate)` — the exchange rate is row-level, so we have to keep it
     * in the GROUP BY to preserve the per-transaction conversion the old code
     * did. That collapses N rows into a bounded handful of groups while
     * keeping the DZD math 1:1 with the previous behaviour.
     */
    static getFinancialStats = cache(async () => {
        const settings = await db.query.shopSettings.findFirst();
        const exchangeRate = parseFloat(settings?.usdExchangeRate || "245");

        // GROUP BY (type, paymentStatus, currency, exchangeRate). The row-level
        // exchangeRate has to stay in the grouping key so that each group has a
        // single rate to multiply by, exactly matching the previous per-row
        // `r.exchangeRate ?? settings.usdExchangeRate` logic.
        const txGroups = await db.select({
            type: supplierTransactions.type,
            paymentStatus: supplierTransactions.paymentStatus,
            currency: supplierTransactions.currency,
            exchangeRate: supplierTransactions.exchangeRate,
            totalAmount: sql<string>`COALESCE(SUM(${supplierTransactions.amount}), 0)::text`,
            count: sql<string>`COUNT(*)::int`,
        }).from(supplierTransactions)
            .groupBy(
                supplierTransactions.type,
                supplierTransactions.paymentStatus,
                supplierTransactions.currency,
                supplierTransactions.exchangeRate,
            );

        let totalPaidDzd = 0;
        let totalUnpaidDzd = 0;

        for (const g of txGroups) {
            const groupAmount = parseFloat(g.totalAmount);
            const groupRate = g.exchangeRate ? parseFloat(g.exchangeRate) : exchangeRate;
            const dzdAmount = g.currency === "USD" ? groupAmount * groupRate : groupAmount;

            if (g.type === "RECHARGE" || g.type === "AJUSTEMENT") {
                // AJUSTEMENT mirrors RECHARGE: PAID rows = settled adjustment
                // (e.g. caisse price-diff recorded as PAID), non-PAID = pending
                // balance correction (e.g. fournisseurs forcedBalance change).
                // Previously silent-dropped, which under-counted both the paid
                // and unpaid pools whenever an adjustment was recorded.
                if (g.paymentStatus === "PAID") {
                    totalPaidDzd += dzdAmount;
                } else {
                    totalUnpaidDzd += dzdAmount;
                }
            } else if (g.type === "PAYMENT") {
                totalUnpaidDzd -= dzdAmount;
                totalPaidDzd += dzdAmount;
            }
        }

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
