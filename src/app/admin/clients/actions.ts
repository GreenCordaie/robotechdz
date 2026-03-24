"use server";

import { db } from "@/db";
import { clients, clientPayments, orders, users, webhookEvents, supportTickets } from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { UserRole, ReturnRequest } from "@/lib/constants";

export const getClientStats = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        const [totalClientsCount] = await db.select({ count: sql<number>`count(*)` }).from(clients);
        const [totalDetteSum] = await db.select({ sum: sql<string>`sum(cast(total_dette_dzd as decimal))` }).from(clients);

        // Count clients with active debt
        const [indebtedCount] = await db.select({ count: sql<number>`count(*)` })
            .from(clients)
            .where(sql`cast(total_dette_dzd as decimal) > 0`);

        return {
            success: true,
            totalClients: Number(totalClientsCount.count),
            totalDebt: totalDetteSum.sum || "0",
            indebtedCount: Number(indebtedCount.count),
            recoveredThisMonth: "0" // Placeholder or compute from clientPayments
        };
    }
);

export const getIndebtedClients = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        return await db.query.clients.findMany({
            where: sql`cast(total_dette_dzd as decimal) > 0`,
            orderBy: [desc(clients.totalDetteDzd)]
        });
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
            await db.transaction(async (tx) => {
                const client = await tx.query.clients.findFirst({ where: eq(clients.id, data.clientId) });
                if (!client) throw new Error("Client introuvable");

                await tx.insert(clientPayments).values({
                    clientId: data.clientId,
                    montantDzd: data.amount,
                    typeAction: data.typeAction,
                });

                const currentDette = parseFloat(client.totalDetteDzd || "0");
                const newDette = Math.max(0, currentDette - parseFloat(data.amount)).toFixed(2);
                await tx.update(clients)
                    .set({ totalDetteDzd: newDette })
                    .where(eq(clients.id, data.clientId));
            });

            revalidatePath("/admin/clients");

            // Sync update to CRM
            const client = await db.query.clients.findFirst({ where: eq(clients.id, data.clientId) });
            if (client) {
                const { N8nService } = await import("@/services/n8n.service");
                N8nService.syncCustomerToCRM(client, 'PAYMENT').catch(() => { });
            }

            return { success: true };
        } catch (error) {
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

        return { payments, orders: clientOrders };
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
            return { success: true, clients: list };
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
            await db.update(clients)
                .set({
                    nomComplet: data.nomComplet,
                    telephone: data.telephone
                })
                .where(eq(clients.id, data.id));

            revalidatePath("/admin/clients");
            return { success: true };
        } catch (error) {
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
                    timestamp: e.processedAt,
                };
            }).filter(Boolean).reverse();

            return { success: true, data: { messages, tickets, phone: intlPhone } };
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
