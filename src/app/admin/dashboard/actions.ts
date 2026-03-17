"use server";

import { db } from "@/db";
import { orders, orderItems, products, digitalCodes } from "@/db/schema";
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
            // Turnover: Sum of total_amount for paid/delivered orders
            const turnoverResult = await db.execute(sql`
                SELECT SUM(CAST(total_amount AS DECIMAL)) as total 
                FROM orders 
                WHERE status IN ('PAYE', 'TERMINE', 'LIVRE', 'PARTIEL') 
                AND created_at >= ${startDate}
            `);

            // Profit: Turnover minus cost (Simplified for now)
            const profitResult = await db.execute(sql`
                SELECT SUM(CAST(total_amount AS DECIMAL) * 0.15) as profit 
                FROM orders 
                WHERE status IN ('PAYE', 'TERMINE', 'LIVRE', 'PARTIEL') 
                AND created_at >= ${startDate}
            `);

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
                revenueData: [
                    { name: 'Lun', total: 4000 },
                    { name: 'Mar', total: 3000 },
                    { name: 'Mer', total: 5000 },
                    { name: 'Jeu', total: 2780 },
                    { name: 'Ven', total: 1890 },
                    { name: 'Sam', total: 2390 },
                    { name: 'Dim', total: 3490 },
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
