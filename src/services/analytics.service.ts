import { db } from "@/db";
import { orderItems, orders, products, productVariants, clients } from "@/db/schema";
import { desc, sql, and, gte, lte } from "drizzle-orm";
import { subDays, startOfMonth, endOfMonth } from "date-fns";

// Orders that count as revenue: paid, delivered, or completed
const PAID_STATUSES = `('PAYE', 'LIVRE', 'TERMINE')`;
const EXCHANGE_RATE_USD_DZD = 245;

// SQL fragment: convert purchasePrice to DZD based on purchaseCurrency
const costInDzd = sql`CASE WHEN ${orderItems.purchaseCurrency} = 'USD' THEN CAST(${orderItems.purchasePrice} AS numeric) * ${EXCHANGE_RATE_USD_DZD} ELSE COALESCE(CAST(${orderItems.purchasePrice} AS numeric), 0) END`;

export class AnalyticsService {
    static async getFinancialOverview(startDate?: Date, endDate?: Date) {
        const start = startDate || startOfMonth(new Date());
        const end = endDate || endOfMonth(new Date());

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
                    sql`${orders.status} IN ${sql.raw(PAID_STATUSES)}`,
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
            .where(sql`${orders.status} IN ${sql.raw(PAID_STATUSES)}`)
            .groupBy(clients.id)
            .orderBy(desc(sql`SUM(${orderItems.price} * ${orderItems.quantity})`))
            .limit(limit);
    }

    static async getTopProducts(limit = 10) {
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
            .where(sql`${orders.status} IN ${sql.raw(PAID_STATUSES)}`)
            .groupBy(products.id, productVariants.id)
            .orderBy(desc(sql`SUM(${orderItems.price} * ${orderItems.quantity}) - COALESCE(SUM(${costInDzd} * ${orderItems.quantity}), 0)`))
            .limit(limit);
    }

    static async getProfitTrend() {
        const thirtyDaysAgo = subDays(new Date(), 30);

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
                    sql`${orders.status} IN ${sql.raw(PAID_STATUSES)}`,
                    gte(orders.createdAt, thirtyDaysAgo)
                )
            )
            .groupBy(sql`DATE(${orders.createdAt})`)
            .orderBy(sql`DATE(${orders.createdAt})`);
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
