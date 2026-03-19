"use server";

import { db } from "@/db";
import { clients, clientPayments, orders, users } from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";

export const getClientStats = withAuth(
    { roles: ["ADMIN", "CAISSIER"] },
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
    { roles: ["ADMIN", "CAISSIER"] },
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
        roles: ["ADMIN", "CAISSIER"],
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

                // ATOMIC Update: SQL-level decrement to prevent lost updates
                await tx.update(clients)
                    .set({ totalDetteDzd: sql`GREATEST(0, cast(total_dette_dzd as decimal) - ${data.amount})::text` })
                    .where(eq(clients.id, data.clientId));
            });

            revalidatePath("/admin/clients");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getClientHistory = withAuth(
    {
        roles: ["ADMIN", "CAISSIER"],
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
        roles: ["ADMIN", "CAISSIER"],
        schema: z.object({ nom: z.string().min(1), telephone: z.string().optional() })
    },
    async (data) => {
        // Map UI 'nom' to DB 'nomComplet'
        const [newClient] = await db.insert(clients).values({
            nomComplet: data.nom,
            telephone: data.telephone
        }).returning();
        revalidatePath("/admin/clients");
        return { success: true, client: newClient };
    }
);

export const getAllClients = withAuth(
    { roles: ["ADMIN", "CAISSIER"] },
    async () => {
        return await db.query.clients.findMany({ orderBy: [desc(clients.createdAt)] });
    }
);
