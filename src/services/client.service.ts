import { db } from "@/db";
import { clients, clientPayments, orders } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { eventBus, SystemEvent } from "@/lib/events";
import { OrderStatus } from "@/lib/constants";

export class ClientService {
    /**
     * Records a debt payment for a client and settles outstanding orders.
     * This is an atomic operation (Transactional).
     */
    static async recordPayment(data: {
        clientId: number;
        amount: string;
        typeAction: "ACOMPTE" | "REMBOURSEMENT" | "RETOUR";
        note?: string;
    }) {
        return await db.transaction(async (tx) => {
            // 1. Fetch Client
            const client = await tx.query.clients.findFirst({
                where: eq(clients.id, data.clientId)
            });
            if (!client) throw new Error("Client introuvable");

            const currentDette = parseFloat(client.totalDetteDzd || "0");
            const paymentAmount = parseFloat(data.amount);
            const newDette = Math.max(0, currentDette - paymentAmount).toFixed(2);

            // 2. Insert Payment Record
            const [payment] = await tx.insert(clientPayments).values({
                clientId: data.clientId,
                montantDzd: data.amount,
                typeAction: data.typeAction,
                receiptNumber: `PAY-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
                printStatus: "print_pending",
                oldBalanceDzd: currentDette.toFixed(2),
                newBalanceDzd: newDette,
            }).returning();

            // 3. Update Client Total Debt
            await tx.update(clients)
                .set({ totalDetteDzd: newDette })
                .where(eq(clients.id, data.clientId));

            // 4. Settle unpaid/partial orders (FIFO)
            const unpaidOrders = await tx.query.orders.findMany({
                where: and(
                    eq(orders.clientId, data.clientId),
                    sql`${orders.status} IN ('NON_PAYE', 'PARTIEL', 'EN_ATTENTE')`
                ),
                orderBy: (o, { asc }) => [asc(o.createdAt)]
            });

            let amountToAllocate = paymentAmount;
            for (const order of unpaidOrders) {
                if (amountToAllocate <= 0) break;

                const orderTotal = parseFloat(String(order.totalAmount)) - parseFloat(String(order.remise || 0));
                const orderPaid = parseFloat(String(order.montantPaye || 0));
                const orderReste = Math.max(0, orderTotal - orderPaid);

                if (amountToAllocate >= orderReste) {
                    amountToAllocate -= orderReste;
                    await tx.update(orders)
                        .set({
                            status: OrderStatus.TERMINE, // Assuming delivery or just marking as finalized for debt
                            montantPaye: orderTotal.toString(),
                            resteAPayer: "0"
                        })
                        .where(eq(orders.id, order.id));
                } else {
                    const newOrderPaid = orderPaid + amountToAllocate;
                    const newOrderReste = orderTotal - newOrderPaid;
                    await tx.update(orders)
                        .set({
                            status: OrderStatus.PARTIEL,
                            montantPaye: newOrderPaid.toString(),
                            resteAPayer: newOrderReste.toFixed(2)
                        })
                        .where(eq(orders.id, order.id));
                    amountToAllocate = 0;
                }
            }

            // 5. Emit Event for Background Processing (WhatsApp, etc.)
            // We do this inside the transaction or after? 
            // Better AFTER to avoid event being published if transaction fails.
            // But we need the ID.

            // Note: In a real DDD environment, we might use a context-bound event collection.
            // Here, we'll return the payment object and publish after success.
            return payment;
        }).then((payment) => {
            // Success! Publish to Event Bus.
            if (payment?.id) {
                eventBus.publish(SystemEvent.DEBT_PAYMENT_RECORDED, { paymentId: payment.id });
            }
            return payment;
        });
    }

    /**
     * Updates client basic info
     */
    static async updateClient(id: number, data: { nomComplet: string, telephone?: string }) {
        const [updated] = await db.update(clients)
            .set(data)
            .where(eq(clients.id, id))
            .returning();

        eventBus.publish(SystemEvent.CUSTOMER_UPDATED, { clientId: id });
        return updated;
    }
}
