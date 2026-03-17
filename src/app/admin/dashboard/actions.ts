"use server";

import { db } from "@/db";
import { orders, orderItems, products, digitalCodes, shopSettings } from "@/db/schema";
import { eq, sql, and, gte, lte, desc, count, isNull } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { z } from "zod";

export const getDashboardStats = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            period: z.enum(["today", "yesterday", "week", "month", "all"]),
        })
    },
    async ({ period }) => {
        const now = new Date();
        let startDate = new Date(0);

        if (period === "today") {
            startDate = new Date(now.setHours(0, 0, 0, 0));
        } else if (period === "yesterday") {
            startDate = new Date(now.setDate(now.getDate() - 1));
            startDate.setHours(0, 0, 0, 0);
        } else if (period === "week") {
            startDate = new Date(now.setDate(now.getDate() - 7));
        } else if (period === "month") {
            startDate = new Date(now.setMonth(now.getMonth() - 1));
        }

        try {
            const turnoverResult = await db.select({ total: sql<string>`sum(total_amount)` })
                .from(orders)
                .where(and(
                    sql`status IN ('PAYE', 'TERMINE', 'LIVRE', 'PARTIEL')`,
                    gte(orders.createdAt, startDate)
                ));

            const profitResult = await db.select({ profit: sql<string>`sum(total_amount * 0.15)` })
                .from(orders)
                .where(and(
                    sql`status IN ('PAYE', 'TERMINE', 'LIVRE', 'PARTIEL')`,
                    gte(orders.createdAt, startDate)
                ));

            const ordersCount = await db.select({ count: count() })
                .from(orders)
                .where(gte(orders.createdAt, startDate));

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

            const latestOrders = await db.query.orders.findMany({
                limit: 10,
                orderBy: [desc(orders.createdAt)],
            });

            const pendingCount = await db.select({ count: count() })
                .from(orders)
                .where(eq(orders.status, "EN_ATTENTE"));

            const settings = await db.query.shopSettings.findFirst();

            // Fetch revenue data for the last 7 days
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            weekAgo.setHours(0, 0, 0, 0);

            const dailyRevenueBuffer = await db.execute(sql`
                SELECT 
                    TO_CHAR(created_at, 'Dy') as day_name,
                    SUM(CAST(total_amount AS NUMERIC)) as total_daily,
                    MIN(created_at) as sort_date
                FROM orders
                WHERE created_at >= ${weekAgo} AND status IN ('PAYE', 'TERMINE', 'LIVRE', 'PARTIEL')
                GROUP BY TO_CHAR(created_at, 'Dy')
                ORDER BY sort_date ASC
            `);

            const revenueData = (dailyRevenueBuffer as any[]).map((row: any) => ({
                name: row.day_name,
                total: parseFloat(row.total_daily || "0")
            }));

            return {
                totalTurnover: Number(turnoverResult[0]?.total || 0),
                turnoverChange: 12,
                totalProfit: Number(profitResult[0]?.profit || 0),
                profitChange: 8,
                ordersToday: Number(ordersCount[0]?.count || 0),
                ordersChange: 5,
                pendingOrdersCount: Number(pendingCount[0]?.count || 0),
                latestOrders: latestOrders,
                stockAlerts: Number((lowStockAlerts[0] as any)?.count || 0),
                openTicketsCount: 0,
                isMaintenanceMode: !!settings?.isMaintenanceMode,
                revenueData: revenueData.length > 0 ? revenueData : [
                    { name: 'Lun', total: 0 },
                    { name: 'Mar', total: 0 },
                    { name: 'Mer', total: 0 },
                    { name: 'Jeu', total: 0 },
                    { name: 'Ven', total: 0 },
                    { name: 'Sam', total: 0 },
                    { name: 'Dim', total: 0 },
                ],
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
                revenueData: [],
                notifications: []
            };
        }
    }
);

export const getRealtimeOrders = withAuth(
    { roles: ["ADMIN"] },
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
    { roles: ["ADMIN"] },
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
