"use server";

import { db } from "@/db";
import { orders, orderItems, products, digitalCodes, shopSettings, supportTickets } from "@/db/schema";
import { eq, sql, and, gte, lte, desc, count, isNull } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { z } from "zod";

export const getDashboardStats = withAuth(
    {
        roles: ["ADMIN", "CAISSIER", "TRAITEUR"],
        schema: z.object({
            period: z.enum(["today", "yesterday", "week", "month", "all"]),
        })
    },
    async ({ period }) => {
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

        try {
            const getStats = async (start: Date, end?: Date) => {
                const filters = [sql`status IN ('PAYE', 'TERMINE', 'LIVRE', 'PARTIEL')`, gte(orders.createdAt, start)];
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

            const currentStats = await getStats(startDate);
            const previousStats = await getStats(prevStartDate, prevEndDate);

            const calculateChange = (current: number, previous: number) => {
                if (previous === 0) return current > 0 ? 100 : 0;
                return ((current - previous) / previous) * 100;
            };

            const turnoverChange = calculateChange(currentStats.turnover, previousStats.turnover);
            const profitChange = calculateChange(currentStats.profit, previousStats.profit);
            const ordersChange = calculateChange(currentStats.count, previousStats.count);

            const lowStockAlerts = await db.execute(sql`
                SELECT COUNT(*) as count FROM (
                    SELECT pv.id
                    FROM product_variants pv
                    JOIN products p ON pv.product_id = p.id
                    LEFT JOIN digital_codes dc ON dc.variant_id = pv.id AND dc.status = 'DISPONIBLE'
                    GROUP BY pv.id
                    HAVING COUNT(dc.id) < 5
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
                .where(eq(orders.status, "EN_ATTENTE"));

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
                        sql`status IN ('PAYE', 'TERMINE', 'LIVRE', 'PARTIEL')`,
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
                turnoverChange,
                totalProfit: currentStats.profit,
                profitChange,
                ordersToday: currentStats.count,
                ordersChange,
                pendingOrdersCount: Number(pendingCountResult[0]?.count || 0),
                latestOrders,
                stockAlerts: Number((lowStockAlerts[0] as any)?.count || 0),
                openTicketsCount: Number(openTicketsCount[0]?.count || 0),
                isMaintenanceMode: !!settings?.isMaintenanceMode,
                revenueData: weekData,
                notifications: []
            };
        } catch (error) {
            console.error("Dashboard stats error:", error);
            return {
                totalTurnover: 0,
                turnoverChange: 0,
                totalProfit: 0,
                profitChange: 0,
                ordersToday: 0,
                ordersChange: 0,
                pendingOrdersCount: 0,
                latestOrders: [],
                stockAlerts: 0,
                openTicketsCount: 0,
                isMaintenanceMode: false,
                revenueData: [],
                notifications: []
            };
        }
    }
);

export const getRealtimeOrders = withAuth(
    { roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
    async () => {
        return await db.query.orders.findMany({
            limit: 10,
            orderBy: [desc(orders.createdAt)],
            with: {
                items: true
            }
        });
    }
);

export const getLowStockAlerts = withAuth(
    { roles: ["ADMIN", "CAISSIER"] },
    async () => {
        const result = await db.execute(sql`
            SELECT pv.id, p.name as product_name, pv.name as variant_name, COUNT(dc.id) as stock_count
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            LEFT JOIN digital_codes dc ON dc.variant_id = pv.id AND dc.status = 'DISPONIBLE'
            GROUP BY pv.id, p.name, pv.name
            HAVING COUNT(dc.id) < 5
        `);
        return result;
    }
);
