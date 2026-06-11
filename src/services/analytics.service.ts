import { db } from "@/db";
import { orderItems, orders, products, productVariants, clients, shopSettings } from "@/db/schema";
import { desc, sql, and, gte, lte, inArray } from "drizzle-orm";
import { subDays, startOfMonth, endOfMonth } from "date-fns";
import { OrderStatus } from "@/lib/constants";

// Orders that count as revenue: paid, delivered, or completed
const PAID_STATUSES = [OrderStatus.PAYE, OrderStatus.LIVRE, OrderStatus.TERMINE];

const FALLBACK_USD_DZD = 245;

/** Live USD→DZD rate from shop settings (same source the pricing/POS use). */
async function getUsdRate(): Promise<number> {
    const settings = await db.query.shopSettings.findFirst({
        columns: { usdExchangeRate: true },
    });
    const rate = parseFloat(settings?.usdExchangeRate ?? "");
    return Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_USD_DZD;
}

// SQL fragment: convert purchasePrice to DZD based on purchaseCurrency, using
// the live rate instead of a hardcoded constant (which undervalued USD costs).
const buildCostInDzd = (rate: number) =>
    sql`CASE WHEN ${orderItems.purchaseCurrency} = 'USD' THEN CAST(${orderItems.purchasePrice} AS numeric) * ${rate} ELSE COALESCE(CAST(${orderItems.purchasePrice} AS numeric), 0) END`;

export class AnalyticsService {
    static async getFinancialOverview(startDate?: Date, endDate?: Date) {
        const start = startDate || startOfMonth(new Date());
        const end = endDate || endOfMonth(new Date());
        const costInDzd = buildCostInDzd(await getUsdRate());

        const stats = await db
            .select({
                totalRevenue: sql<number>`COALESCE(SUM(${orderItems.price} * ${orderItems.quantity}), 0)`,
                totalCost: sql<number>`COALESCE(SUM(${costInDzd} * ${orderItems.quantity}), 0)`,
                orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
            })
            .from(orderItems)
            .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
            .where(
                and(
                    inArray(orders.status, PAID_STATUSES),
                    gte(orders.createdAt, start),
                    lte(orders.createdAt, end)
                )
            );

        const result = stats[0];
        const revenue = Number(result.totalRevenue);
        const cost = Number(result.totalCost);
        const margin = revenue - cost;
        const marginPercentage = revenue > 0 ? (margin / revenue) * 100 : 0;

        return {
            revenue,
            cost,
            margin,
            marginPercentage,
            orderCount: Number(result.orderCount),
        };
    }

    static async getTopClients(limit = 10) {
        return await db
            .select({
                clientId: clients.id,
                name: clients.nomComplet,
                phone: clients.telephone,
                totalSpent: sql<number>`SUM(${orderItems.price} * ${orderItems.quantity})`,
                orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
                points: clients.loyaltyPoints,
            })
            .from(orderItems)
            .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
            .innerJoin(clients, sql`${orders.clientId} = ${clients.id}`)
            .where(inArray(orders.status, PAID_STATUSES))
            .groupBy(clients.id, clients.nomComplet, clients.telephone, clients.loyaltyPoints)
            .orderBy(desc(sql`SUM(${orderItems.price} * ${orderItems.quantity})`))
            .limit(limit);
    }

    static async getTopProducts(limit = 10) {
        const costInDzd = buildCostInDzd(await getUsdRate());
        return await db
            .select({
                productId: products.id,
                productName: products.name,
                variantName: productVariants.name,
                volume: sql<number>`SUM(${orderItems.quantity})`,
                revenue: sql<number>`SUM(${orderItems.price} * ${orderItems.quantity})`,
                cost: sql<number>`COALESCE(SUM(${costInDzd} * ${orderItems.quantity}), 0)`,
                profit: sql<number>`SUM(${orderItems.price} * ${orderItems.quantity}) - COALESCE(SUM(${costInDzd} * ${orderItems.quantity}), 0)`,
            })
            .from(orderItems)
            .innerJoin(productVariants, sql`${orderItems.variantId} = ${productVariants.id}`)
            .innerJoin(products, sql`${productVariants.productId} = ${products.id}`)
            .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
            .where(inArray(orders.status, PAID_STATUSES))
            .groupBy(products.id, products.name, productVariants.id, productVariants.name)
            .orderBy(desc(sql`SUM(${orderItems.price} * ${orderItems.quantity}) - COALESCE(SUM(${costInDzd} * ${orderItems.quantity}), 0)`))
            .limit(limit);
    }

    static async getProfitTrend() {
        const thirtyDaysAgo = subDays(new Date(), 30);
        const costInDzd = buildCostInDzd(await getUsdRate());

        return await db
            .select({
                date: sql<string>`DATE(${orders.createdAt})`,
                revenue: sql<number>`SUM(${orderItems.price} * ${orderItems.quantity})`,
                cost: sql<number>`COALESCE(SUM(${costInDzd} * ${orderItems.quantity}), 0)`,
            })
            .from(orderItems)
            .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
            .where(
                and(
                    inArray(orders.status, PAID_STATUSES),
                    gte(orders.createdAt, thirtyDaysAgo)
                )
            )
            .groupBy(sql`${orders.createdAt}::date`)
            .orderBy(sql`${orders.createdAt}::date`);
    }

    static async getMarketingInsights() {
        const [topClients, topProducts] = await Promise.all([
            this.getTopClients(5),
            this.getTopProducts(5)
        ]);

        return {
            topClients,
            topProducts,
            statsSummary: {
                totalActiveClients: topClients.length,
                bestSeller: topProducts[0]?.productName || "Aucun",
                bestVariant: topProducts[0]?.variantName || "Aucun"
            }
        };
    }
}
