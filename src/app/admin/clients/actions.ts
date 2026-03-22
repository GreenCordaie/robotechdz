"use server";

import { db } from "@/db";
import { clients, clientPayments, orders, users, webhookEvents, supportTickets } from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { UserRole } from "@/lib/constants";

export const getClientStats = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER] },
    async () => {
        const totalClients = await db.select({ count: sql<number>`count(*)` }).from(clients);
        const totalDette = await db.select({ sum: sql<string>`sum(cast(total_dette_dzd as decimal))` }).from(clients);
        const list = await db.query.clients.findMany({ limit: 5, orderBy: [desc(clients.createdAt)] });

        return {
            totalClients: Number(totalClients[0].count),
            totalDette: totalDette[0].sum || "0",
            lastClients: list
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
        return await db.query.clients.findMany({ orderBy: [desc(clients.createdAt)] });
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
