"use server";

import { db } from "@/db";
import { clients, clientPayments, orders, users, webhookEvents, supportTickets } from "@/db/schema";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { UserRole, ReturnRequest } from "@/lib/constants";
import { N8nService } from "@/services/n8n.service";

import { triggerDebtPaymentNotification } from "@/lib/notifications";

export const getClientStats = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        const [totalClientsCount] = await db.select({ count: sql<number>`count(*)` }).from(clients);
        const [totalDetteSum] = await db.select({ sum: sql<string>`sum(cast(total_dette_dzd as numeric))` }).from(clients);

        // Count clients with active debt
        const [indebtedCount] = await db.select({ count: sql<number>`count(*)` })
            .from(clients)
            .where(sql`cast(total_dette_dzd as numeric) > 0`);

        // Compute recoveredThisMonth (ACOMPTE payments this month)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [recoveredSum] = await db.select({ sum: sql<string>`sum(cast(montant_dzd as numeric))` })
            .from(clientPayments)
            .where(and(
                eq(clientPayments.typeAction, 'ACOMPTE'),
                gte(clientPayments.createdAt, startOfMonth)
            ));

        return {
            success: true,
            totalClients: Number(totalClientsCount.count),
            totalDebt: totalDetteSum.sum || "0",
            indebtedCount: Number(indebtedCount.count),
            recoveredThisMonth: recoveredSum.sum || "0"
        };
    }
);

export const getIndebtedClients = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        const list = await db.query.clients.findMany({
            where: sql`cast(total_dette_dzd as numeric) > 0`,
            orderBy: [desc(clients.totalDetteDzd)]
        });
        return {
            success: true,
            clients: list.map(c => ({
                ...c,
                createdAt: c.createdAt ? c.createdAt.toISOString() : null
            }))
        };
    }
);

// Corrected export name and enum values for schema alignment
export const recordPayment = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({
            clientId: z.number(),
            amount: z.string(),
            typeAction: z.enum(["ACOMPTE", "REMBOURSEMENT", "RETOUR"]), // Exact enum from schema
            note: z.string().optional()
        })
    },
    async (data) => {
        try {
            const { ClientService } = await import("@/services/client.service");
            await ClientService.recordPayment(data);

            revalidatePath("/admin/clients");

            // Optional: CRM Sync (Should probably be an EventBus listener too, but keeping consistency)
            const client = await db.query.clients.findFirst({ where: eq(clients.id, data.clientId) });
            if (client) {
                const { N8nService } = await import("@/services/n8n.service");
                N8nService.syncCustomerToCRM(client, 'PAYMENT').catch(() => { });
            }

            return { success: true };
        } catch (error: any) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getClientHistory = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ clientId: z.number() })
    },
    async ({ clientId }) => {
        const payments = await db.query.clientPayments.findMany({
            where: eq(clientPayments.clientId, clientId),
            orderBy: [desc(clientPayments.createdAt)]
        });

        const clientOrders = await db.query.orders.findMany({
            where: eq(orders.clientId, clientId),
            orderBy: [desc(orders.createdAt)],
            with: { items: true }
        });

        // Fetch returns as well
        const clientReturns = await db.query.orders.findMany({
            where: and(
                eq(orders.clientId, clientId),
                sql`return_request IS NOT NULL`
            ),
            columns: {
                id: true,
                orderNumber: true,
                totalAmount: true,
                returnRequest: true,
                createdAt: true,
            },
            orderBy: [desc(orders.createdAt)],
        });

        return {
            success: true,
            payments: payments.map(p => ({
                ...p,
                createdAt: p.createdAt ? p.createdAt.toISOString() : null
            })),
            orders: clientOrders.map(o => ({
                ...o,
                createdAt: o.createdAt ? o.createdAt.toISOString() : null
            })),
            returns: clientReturns.map(o => ({
                orderId: o.id,
                orderNumber: o.orderNumber,
                totalAmount: o.totalAmount,
                returnRequest: o.returnRequest as ReturnRequest,
                orderCreatedAt: o.createdAt ? o.createdAt.toISOString() : null,
            }))
        };
    }
);

// Corrected export name and property name for schema alignment (nomComplet)
export const createClient = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ nom: z.string().min(1), telephone: z.string().optional() })
    },
    async (data) => {
        // Map UI 'nom' to DB 'nomComplet'
        const [newClient] = await db.insert(clients).values({
            nomComplet: data.nom,
            telephone: data.telephone
        }).returning();
        revalidatePath("/admin/clients");

        // Sync new client to CRM
        const { N8nService } = await import("@/services/n8n.service");
        N8nService.syncCustomerToCRM(newClient, 'CREATED').catch(() => { });

        return { success: true, client: newClient };
    }
);

export const getAllClients = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        try {
            const list = await db.query.clients.findMany({ orderBy: [desc(clients.createdAt)] });
            return {
                success: true,
                clients: list.map(c => ({
                    ...c,
                    createdAt: c.createdAt ? (c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt)) : null
                }))
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const updateClient = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            id: z.number(),
            nomComplet: z.string().min(1),
            telephone: z.string().optional()
        })
    },
    async (data) => {
        try {
            const { ClientService } = await import("@/services/client.service");
            await ClientService.updateClient(data.id, {
                nomComplet: data.nomComplet,
                telephone: data.telephone
            });

            revalidatePath("/admin/clients");
            return { success: true };
        } catch (error: any) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const deleteClient = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        try {
            // Check for dependencies (orders)
            const dependencies = await db.query.orders.findFirst({ where: eq(orders.clientId, id) });
            if (dependencies) {
                throw new Error("Impossible de supprimer un client ayant déjà des commandes.");
            }

            await db.delete(clients).where(eq(clients.id, id));
            revalidatePath("/admin/clients");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getClientWhatsAppHistory = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({ clientId: z.number() })
    },
    async ({ clientId }) => {
        try {
            const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
            if (!client?.telephone) return { success: false, error: "Client introuvable ou sans téléphone" };

            // Normalisation : '0XXXXXXXXX' → '213XXXXXXXXX'
            const intlPhone = client.telephone.startsWith('0')
                ? '213' + client.telephone.slice(1)
                : client.telephone;

            const [events, tickets] = await Promise.all([
                db.select()
                    .from(webhookEvents)
                    .where(and(
                        eq(webhookEvents.provider, 'whatsapp'),
                        eq(webhookEvents.customerPhone, intlPhone)
                    ))
                    .orderBy(desc(webhookEvents.processedAt))
                    .limit(30),
                db.select()
                    .from(supportTickets)
                    .where(eq(supportTickets.customerPhone, intlPhone))
                    .orderBy(desc(supportTickets.createdAt))
                    .limit(5)
            ]);

            const messages = events.map(e => {
                const p = e.payload as any;
                if (p?.event !== "message") return null;
                const inner = p.payload;
                return {
                    id: e.id,
                    fromMe: inner?.fromMe ?? false,
                    body: inner?.body || '[Message non textuel]',
                    messageType: inner?.type || 'text',
                    timestamp: e.processedAt ? e.processedAt.toISOString() : null,
                };
            }).filter(Boolean).reverse();

            return {
                success: true,
                data: {
                    messages,
                    tickets: tickets.map(t => ({
                        ...t,
                        createdAt: t.createdAt ? t.createdAt.toISOString() : null
                    })),
                    phone: intlPhone
                }
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getReturnsByClient = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.SUPER_ADMIN],
        schema: z.object({ clientId: z.number().int().positive() })
    },
    async ({ clientId }) => {
        try {
            const result = await db.query.orders.findMany({
                where: and(
                    eq(orders.clientId, clientId),
                    sql`return_request IS NOT NULL`
                ),
                columns: {
                    id: true,
                    orderNumber: true,
                    totalAmount: true,
                    returnRequest: true,
                    createdAt: true,
                },
                orderBy: [desc(orders.createdAt)],
            });

            return {
                success: true,
                returns: result.map(o => ({
                    orderId: o.id,
                    orderNumber: o.orderNumber,
                    totalAmount: o.totalAmount,
                    returnRequest: o.returnRequest as ReturnRequest,
                    orderCreatedAt: o.createdAt,
                })),
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
