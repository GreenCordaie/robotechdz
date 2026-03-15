"use server";

import { db } from "@/db";
import { clients, clientPayments, orders, users } from "@/db/schema";
import { eq, sql, and, gte, sum, count, desc, or, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getClientsStats() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // 1. Total des créances (Sum of all totalDetteDzd)
    const totalDebtRes = await db.select({
        total: sum(clients.totalDetteDzd)
    }).from(clients);

    // 2. Paiements récupérés ce mois-ci (Sum of REMBOURSEMENT this month)
    const recoveredRes = await db.select({
        total: sum(clientPayments.montantDzd)
    }).from(clientPayments)
        .where(
            and(
                gte(clientPayments.createdAt, firstDayOfMonth),
                eq(clientPayments.typeAction, "REMBOURSEMENT")
            )
        );

    // 3. Nombre de clients endettés
    const indebtedCountRes = await db.select({
        count: count()
    }).from(clients)
        .where(sql`${clients.totalDetteDzd} > 0`);

    return {
        totalDebt: Number(totalDebtRes[0]?.total || 0),
        recoveredThisMonth: Number(recoveredRes[0]?.total || 0),
        indebtedCount: indebtedCountRes[0]?.count || 0,
    };
}

export async function getIndebtedClients(search?: string) {
    const query = db.query.clients.findMany({
        where: (clients, { gt, and, or, ilike }) => {
            const base = gt(clients.totalDetteDzd, "0");
            if (search) {
                return and(
                    base,
                    or(
                        ilike(clients.nomComplet, `%${search}%`),
                        ilike(clients.telephone, `%${search}%`)
                    )
                );
            }
            return base;
        },
        with: {
            orders: {
                orderBy: (orders, { desc }) => [desc(orders.createdAt)],
                limit: 1,
            }
        },
        orderBy: (clients, { desc }) => [desc(clients.totalDetteDzd)]
    });

    const result = await query;
    return result;
}

export async function recordPayment(clientId: number, montant: number) {
    // 1. Find all partial/non_paye orders for this client
    const unpaidOrders = await db.query.orders.findMany({
        where: and(
            eq(orders.clientId, clientId),
            sql`${orders.status} IN ('PARTIEL', 'NON_PAYE', 'EN_ATTENTE')`
        ),
        orderBy: (orders, { asc }) => [asc(orders.createdAt)]
    });

    let remainingPayment = montant;

    for (const order of unpaidOrders) {
        if (remainingPayment <= 0) break;

        const orderDebt = Number(order.resteAPayer);
        const amountToApply = Math.min(remainingPayment, orderDebt);

        const newPaid = Number(order.montantPaye) + amountToApply;
        const newReste = orderDebt - amountToApply;

        let newStatus = order.status;
        if (newReste <= 0) {
            newStatus = order.isDelivered ? "TERMINE" : "PAYE";
        } else {
            newStatus = "PARTIEL";
        }

        await db.update(orders)
            .set({
                montantPaye: newPaid.toString(),
                resteAPayer: newReste.toString(),
                status: newStatus as any
            })
            .where(eq(orders.id, order.id));

        // Record individual payment link if needed, or just one global?
        // Let's record one per order for traceability
        await db.insert(clientPayments).values({
            clientId,
            orderId: order.id,
            montantDzd: amountToApply.toString(),
            typeAction: "REMBOURSEMENT"
        });

        remainingPayment -= amountToApply;
    }

    // 3. Update client global debt
    const client = await db.query.clients.findFirst({
        where: eq(clients.id, clientId)
    });

    if (client) {
        const newTotalDebt = Math.max(0, Number(client.totalDetteDzd) - montant);
        await db.update(clients)
            .set({ totalDetteDzd: newTotalDebt.toString() })
            .where(eq(clients.id, clientId));
    }

    revalidatePath("/admin/clients");
    revalidatePath("/admin");
    return { success: true };
}

export async function getClientHistory(clientId: number) {
    const history = await db.query.clientPayments.findMany({
        where: eq(clientPayments.clientId, clientId),
        orderBy: (p, { desc }) => [desc(p.createdAt)],
        with: {
            order: true
        }
    });

    // Also get orders to see debt items
    const clientOrders = await db.query.orders.findMany({
        where: eq(orders.clientId, clientId),
        orderBy: (o, { desc }) => [desc(o.createdAt)]
    });

    return { payments: history, orders: clientOrders };
}

export async function createClient(data: { nomComplet: string, telephone?: string }) {
    const res = await db.insert(clients).values({
        nomComplet: data.nomComplet,
        telephone: data.telephone,
        totalDetteDzd: "0"
    }).returning();
    revalidatePath("/admin/clients");
    return res[0];
}

export async function getAllClients() {
    return await db.query.clients.findMany({
        orderBy: (c, { asc }) => [asc(c.nomComplet)]
    });
}
