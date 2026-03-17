"use server";

import { db } from "@/db";
import {
    resellers,
    orders,
    orderItems,
    resellerWallets,
    resellerTransactions,
    users,
    productVariants
} from "@/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";

export const getCurrentResellerAction = withAuth(
    { roles: ["RESELLER"] },
    async (_, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
                with: { wallet: true }
            });

            if (!reseller) return { success: false, error: "Compte revendeur introuvable" };
            return { success: true, data: reseller };
        } catch (error) {
            return { success: false, error: "Erreur serveur" };
        }
    }
);

export const getResellerOrdersAction = withAuth(
    { roles: ["RESELLER"] },
    async (_, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({ where: eq(resellers.userId, user.id) });
            if (!reseller) return { success: false, error: "Compte revendeur introuvable" };

            const list = await db.query.orders.findMany({
                where: eq(orders.resellerId, reseller.id),
                orderBy: [desc(orders.createdAt)],
                with: { items: true }
            });
            return { success: true, data: list };
        } catch (error) {
            return { success: false, error: "Erreur lors de la récupération des commandes" };
        }
    }
);

export const getResellerTransactionsAction = withAuth(
    { roles: ["RESELLER"] },
    async (_, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
                with: { wallet: true }
            });
            if (!reseller || !reseller.wallet) return { success: true, data: [] };

            const list = await db.query.resellerTransactions.findMany({
                where: eq(resellerTransactions.walletId, reseller.wallet.id),
                orderBy: [desc(resellerTransactions.createdAt)]
            });
            return { success: true, data: list };
        } catch (error) {
            return { success: false, error: "Erreur lors de la récupération des transactions" };
        }
    }
);

export const checkoutResellerAction = withAuth(
    {
        roles: ["RESELLER"],
        schema: z.object({
            resellerId: z.number(),
            cart: z.array(z.object({
                id: z.number(), // variantId
                quantity: z.number().min(1)
            }))
        })
    },
    async ({ resellerId, cart }, user) => {
        // Enforce ownership: session user must own this reseller account
        const reseller = await db.query.resellers.findFirst({
            where: and(eq(resellers.id, resellerId), eq(resellers.userId, user.id)),
            with: { wallet: true }
        });

        if (!reseller) return { success: false, error: "Compte revendeur invalide" };

        try {
            // HARDENING: Recalculate prices server-side to prevent client-side manipulation
            const variantIds = cart.map(item => item.id);
            const dbVariants = await db.query.productVariants.findMany({
                where: inArray(productVariants.id, variantIds)
            });

            const variantMap = new Map(dbVariants.map(v => [v.id, v]));
            let totalAmount = 0;
            const enrichedCart = cart.map(item => {
                const variant = variantMap.get(item.id);
                if (!variant) throw new Error(`Variante ${item.id} introuvable`);
                const priceNum = parseFloat(variant.salePriceDzd);
                totalAmount += priceNum * item.quantity;
                return { ...item, name: variant.name, price: priceNum };
            });

            const wallet = reseller.wallet;
            if (!wallet || parseFloat(wallet.balance) < totalAmount) {
                return { success: false, error: "Solde insuffisant" };
            }

            const orderNumber = `B2B-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            return await db.transaction(async (tx) => {
                const [newOrder] = await tx.insert(orders).values({
                    orderNumber,
                    status: "PAYE",
                    totalAmount: totalAmount.toFixed(2),
                    montantPaye: totalAmount.toFixed(2),
                    resteAPayer: "0",
                    resellerId: reseller.id,
                    source: "B2B_WEB",
                    deliveryMethod: "TICKET",
                }).returning();

                for (const item of (newOrder as any).items) {
                    await tx.insert(orderItems).values({
                        orderId: newOrder.id,
                        variantId: item.id,
                        name: item.name,
                        price: item.price.toString(),
                        quantity: item.quantity,
                    });
                }

                await tx.update(resellerWallets)
                    .set({
                        balance: (parseFloat(wallet.balance!) - totalAmount).toString(),
                        totalSpent: (parseFloat(wallet.totalSpent || "0") + totalAmount).toString(),
                        updatedAt: new Date()
                    })
                    .where(eq(resellerWallets.id, wallet.id));

                await tx.insert(resellerTransactions).values({
                    walletId: wallet.id,
                    type: "PURCHASE",
                    amount: totalAmount.toString(),
                    orderId: newOrder.id,
                    description: `Achat B2B - ${orderNumber}`
                });

                return { success: true, orderNumber };
            });
        } catch (error) {
            console.error("Checkout error:", error);
            return { success: false, error: "Erreur lors du traitement de la commande" };
        }
    }
);
