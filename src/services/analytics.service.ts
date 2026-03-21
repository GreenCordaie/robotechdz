import { db } from "@/db";
import { orderItems, orders, products, productVariants, clients } from "@/db/schema";
import { desc, sql, and, gte, lte } from "drizzle-orm";
import { subDays, startOfMonth, endOfMonth } from "date-fns";

export class AnalyticsService {
    /**
     * Get financial KPIs and summaries
     */
    static async getFinancialOverview(startDate?: Date, endDate?: Date) {
        const start = startDate || startOfMonth(new Date());
        const end = endDate || endOfMonth(new Date());

        const stats = await db
            .select({
                totalRevenue: sql<number>`COALESCE(SUM(${orderItems.price} * ${orderItems.quantity}), 0)`,
                totalCost: sql<number>`COALESCE(SUM(${orderItems.purchasePrice} * ${orderItems.quantity}), 0)`,
                orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
            })
            .from(orderItems)
            .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
            .where(
                and(
                    sql`${orders.status} = 'completed'`,
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

    /**
     * Get top contributing clients
     */
    static async getTopClients(limit = 10) {
        return await db
            .select({
                clientId: clients.id,
                name: clients.name,
                phone: clients.phone,
                totalSpent: sql<number>`SUM(${orderItems.price} * ${orderItems.quantity})`,
                orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
                points: clients.loyaltyPoints,
            })
            .from(orderItems)
            .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
            .innerJoin(clients, sql`${orders.clientId} = ${clients.id}`)
            .where(sql`${orders.status} = 'completed'`)
            .groupBy(clients.id)
            .orderBy(desc(sql`SUM(${orderItems.price} * ${orderItems.quantity})`))
            .limit(limit);
    }

    /**
     * Get top selling products/variants
     */
    static async getTopProducts(limit = 10) {
        return await db
            .select({
                productId: products.id,
                productName: products.name,
                variantName: productVariants.name,
                volume: sql<number>`SUM(${orderItems.quantity})`,
                revenue: sql<number>`SUM(${orderItems.price} * ${orderItems.quantity})`,
            })
            .from(orderItems)
            .innerJoin(productVariants, sql`${orderItems.variantId} = ${productVariants.id}`)
            .innerJoin(products, sql`${productVariants.productId} = ${products.id}`)
            .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
            .where(sql`${orders.status} = 'completed'`)
            .groupBy(products.id, productVariants.id)
            .orderBy(desc(sql`SUM(${orderItems.quantity})`))
            .limit(limit);
    }

    /**
     * Get revenue/profit trend for the last 30 days
     */
    static async getProfitTrend() {
        const thirtyDaysAgo = subDays(new Date(), 30);

        const dailyStats = await db
            .select({
                date: sql<string>`DATE(${orders.createdAt})`,
                revenue: sql<number>`SUM(${orderItems.price} * ${orderItems.quantity})`,
                cost: sql<number>`SUM(${orderItems.purchasePrice} * ${orderItems.quantity})`,
            })
            .from(orderItems)
            .innerJoin(orders, sql`${orderItems.orderId} = ${orders.id}`)
            .where(
                and(
                    sql`${orders.status} = 'completed'`,
                    gte(orders.createdAt, thirtyDaysAgo)
                )
            )
            .groupBy(sql`DATE(${orders.createdAt})`)
            .orderBy(sql`DATE(${orders.createdAt})`);

        return dailyStats;
    }

    /**
     * Get high-level marketing insights
     */
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
