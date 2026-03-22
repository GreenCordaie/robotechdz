import "server-only";
import { db } from "@/db";
import { orders, orderItems, products, digitalCodes, shopSettings, supportTickets } from "@/db/schema";
import { eq, sql, and, gte, lte, desc, count } from "drizzle-orm";
import { cache } from "react";
import { OrderStatus, DigitalCodeStatus, DigitalCodeSlotStatus } from "@/lib/constants";

export class DashboardQueries {

    /**
     * Gets main dashboard statistics for a given period.
     */
    static getStats = cache(async (period: "today" | "yesterday" | "week" | "month" | "all") => {
        const now = new Date();
        let startDate = new Date();
        let prevStartDate = new Date();
        let prevEndDate = new Date();

        if (period === "today") {
            startDate = new Date(now.setHours(0, 0, 0, 0));
            prevStartDate = new Date(new Date(startDate).setDate(startDate.getDate() - 1));
            prevEndDate = new Date(startDate);
        } else if (period === "yesterday") {
            startDate = new Date(new Date(now).setDate(now.getDate() - 1));
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            prevStartDate = new Date(new Date(startDate).setDate(startDate.getDate() - 1));
            prevEndDate = new Date(startDate);
        } else if (period === "week") {
            startDate = new Date(new Date(now).setDate(now.getDate() - 7));
            prevStartDate = new Date(new Date(startDate).setDate(startDate.getDate() - 7));
            prevEndDate = new Date(startDate);
        } else if (period === "month") {
            startDate = new Date(new Date(now).setMonth(now.getMonth() - 1));
            prevStartDate = new Date(new Date(startDate).setMonth(startDate.getMonth() - 1));
            prevEndDate = new Date(startDate);
        } else {
            startDate = new Date(0);
            prevStartDate = new Date(0);
            prevEndDate = new Date(0);
        }

        const fetchStatsInRange = async (start: Date, end?: Date) => {
            const filters = [
                sql`status IN (${OrderStatus.PAYE}, ${OrderStatus.TERMINE}, ${OrderStatus.LIVRE}, ${OrderStatus.PARTIEL})`,
                gte(orders.createdAt, start)
            ];
            if (end) filters.push(lte(orders.createdAt, end));

            const turnoverResult = await db.select({ total: sql<string>`sum(total_amount)` })
                .from(orders)
                .where(and(...filters));

            const profitResult = await db.select({
                totalProfit: sql<string>`sum(
                    cast(${orderItems.price} as numeric) * ${orderItems.quantity} - 
                    case 
                        when ${orderItems.purchasePrice} is not null then cast(${orderItems.purchasePrice} as numeric) * ${orderItems.quantity} 
                        else cast(${orderItems.price} as numeric) * ${orderItems.quantity} * 0.85
                    end
                )`
            })
                .from(orderItems)
                .innerJoin(orders, eq(orders.id, orderItems.orderId))
                .where(and(...filters));

            const countResult = await db.select({ count: count() })
                .from(orders)
                .where(and(...filters));

            return {
                turnover: Number(turnoverResult[0]?.total || 0),
                profit: Number(profitResult[0]?.totalProfit || 0),
                count: Number(countResult[0]?.count || 0)
            };
        };

        const currentStats = await fetchStatsInRange(startDate);
        const previousStats = await fetchStatsInRange(prevStartDate, prevEndDate);

        const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return ((current - previous) / previous) * 100;
        };

        const thresholdSettings = await db.query.shopSettings.findFirst();
        const alertThreshold = thresholdSettings?.stockAlertThreshold ?? 5;
        const lowStockAlerts = await db.execute(sql`
            SELECT COUNT(*) as count FROM (
                SELECT pv.id,
                    CASE
                        WHEN pv.is_sharing THEN (
                            SELECT COUNT(dcs.id) FROM digital_code_slots dcs
                            INNER JOIN digital_codes dc2 ON dc2.id = dcs.digital_code_id
                            WHERE dc2.variant_id = pv.id AND dcs.status = ${DigitalCodeSlotStatus.DISPONIBLE}
                        )
                        ELSE (
                            SELECT COUNT(dc.id) FROM digital_codes dc
                            WHERE dc.variant_id = pv.id AND dc.status = ${DigitalCodeStatus.DISPONIBLE}
                        )
                    END as stock_count
                FROM product_variants pv
                JOIN products p ON pv.product_id = p.id
                WHERE p.status = 'ACTIVE' AND p.is_manual_delivery = false
                HAVING stock_count <= ${alertThreshold}
            ) as alerts
        `);

        const openTicketsCount = await db.select({ count: count() })
            .from(supportTickets)
            .where(eq(supportTickets.status, "OUVERT"));

        const latestOrders = await db.query.orders.findMany({
            limit: 10,
            orderBy: [desc(orders.createdAt)],
            with: { items: true }
        });

        const pendingCountResult = await db.select({ count: count() })
            .from(orders)
            .where(eq(orders.status, OrderStatus.EN_ATTENTE));

        const settings = await db.query.shopSettings.findFirst();

        const weekData = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date();
            day.setDate(day.getDate() - i);
            day.setHours(0, 0, 0, 0);
            const nextDay = new Date(day);
            nextDay.setDate(nextDay.getDate() + 1);

            const dayResult = await db.select({ total: sql<string>`sum(total_amount)` })
                .from(orders)
                .where(and(
                    sql`status IN (${OrderStatus.PAYE}, ${OrderStatus.TERMINE}, ${OrderStatus.LIVRE}, ${OrderStatus.PARTIEL})`,
                    gte(orders.createdAt, day),
                    lte(orders.createdAt, nextDay)
                ));

            const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
            weekData.push({
                name: dayNames[day.getDay()],
                total: Number(dayResult[0]?.total || 0)
            });
        }

        return {
            totalTurnover: currentStats.turnover,
            turnoverChange: calculateChange(currentStats.turnover, previousStats.turnover),
            totalProfit: currentStats.profit,
            profitChange: calculateChange(currentStats.profit, previousStats.profit),
            ordersToday: currentStats.count,
            ordersChange: calculateChange(currentStats.count, previousStats.count),
            pendingOrdersCount: Number(pendingCountResult[0]?.count || 0),
            latestOrders,
            stockAlerts: Number((lowStockAlerts[0] as any)?.count || 0),
            openTicketsCount: Number(openTicketsCount[0]?.count || 0),
            isMaintenanceMode: !!settings?.isMaintenanceMode,
            revenueData: weekData,
            notifications: []
        };
    });

    /**
     * Gets low stock alerts with product details, using dynamic threshold from settings.
     * Handles both standard digital codes and sharing variants (slots).
     */
    static getLowStockList = async () => {
        const settings = await db.query.shopSettings.findFirst();
        const threshold = settings?.stockAlertThreshold ?? 5;

        const result = await db.execute(sql`
            SELECT
                pv.id,
                p.name as product_name,
                pv.name as variant_name,
                pv.is_sharing,
                CASE
                    WHEN pv.is_sharing THEN (
                        SELECT COUNT(dcs.id)
                        FROM digital_code_slots dcs
                        INNER JOIN digital_codes dc2 ON dc2.id = dcs.digital_code_id
                        WHERE dc2.variant_id = pv.id AND dcs.status = ${DigitalCodeSlotStatus.DISPONIBLE}
                    )
                    ELSE (
                        SELECT COUNT(dc.id)
                        FROM digital_codes dc
                        WHERE dc.variant_id = pv.id AND dc.status = ${DigitalCodeStatus.DISPONIBLE}
                    )
                END as stock_count
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE p.status = 'ACTIVE' AND p.is_manual_delivery = false
            HAVING stock_count <= ${threshold}
            ORDER BY stock_count ASC
        `);
        return { rows: result, threshold };
    };

    /**
     * Recent orders for realtime components.
     */
    static getRecentOrders = cache(async (limit = 10) => {
        return await db.query.orders.findMany({
            limit,
            orderBy: [desc(orders.createdAt)],
            with: {
                items: true
            }
        });
    });
}
