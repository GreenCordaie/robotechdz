"use server";

import { db } from "@/db";
import { orders, products, suppliers, productVariants, supplierTransactions } from "@/db/schema";
import { count, eq, sum, and, gte, desc, sql } from "drizzle-orm";

export async function getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Chiffre d'Affaires (CA) du jour (PAYE, TERMINE)
    const turnoverRes = await db.select({
        total: sum(orders.totalAmount)
    }).from(orders)
        .where(
            and(
                gte(orders.createdAt, today),
                sql`${orders.status} IN ('PAYE', 'TERMINE')`
            )
        );

    const totalTurnover = Number(turnoverRes[0]?.total || 0);

    // 2. Coût d'achat total (pour le bénéfice net)
    const costRes = await db.select({
        total: sum(supplierTransactions.amountDzd)
    }).from(supplierTransactions)
        .where(
            and(
                gte(supplierTransactions.createdAt, today),
                eq(supplierTransactions.type, "ACHAT_STOCK")
            )
        );

    const totalCost = Number(costRes[0]?.total || 0);
    const totalProfit = totalTurnover - totalCost;

    // 3. Commandes en attente (EN_ATTENTE, PAYE)
    const queueRes = await db.select({
        count: count()
    }).from(orders)
        .where(
            sql`${orders.status} IN ('EN_ATTENTE', 'PAYE')`
        );

    const pendingOrdersCount = queueRes[0]?.count || 0;

    // 4. Alertes de Stock (Variants with 0 DISPONIBLE codes)
    const allVariants = await db.query.productVariants.findMany({
        with: {
            digitalCodes: {
                where: (codes, { eq }) => eq(codes.status, "DISPONIBLE")
            }
        }
    });

    const stockAlerts = allVariants.filter(v => v.digitalCodes.length === 0).length;

    // 5. Activité Récente (Last 10 orders)
    const latestOrders = await db.query.orders.findMany({
        orderBy: (orders, { desc }) => [desc(orders.createdAt)],
        limit: 10,
        with: {
            items: {
                with: {
                    codes: true
                }
            }
        }
    });

    return {
        totalTurnover,
        pendingOrdersCount,
        totalProfit: totalProfit > 0 ? totalProfit : 0, // Avoid display artifacts if no sales
        latestOrders: latestOrders.map(o => ({
            ...o,
            items: o.items.map(i => ({
                ...i,
                codes: i.codes.map(c => c.code)
            }))
        })),
        stockAlerts
    };
}
