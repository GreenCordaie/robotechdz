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
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { allocateOrderStock } from "@/lib/orders";
import { OrderService } from "@/services/order.service";

export const getCurrentResellerAction = withAuth(
    { roles: [UserRole.RESELLER] },
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
    { roles: [UserRole.RESELLER] },
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
    { roles: [UserRole.RESELLER] },
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
        roles: [UserRole.RESELLER],
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
                where: inArray(productVariants.id, variantIds),
                with: {
                    product: true,
                    variantSuppliers: {
                        limit: 1
                    }
                }
            });

            const variantMap = new Map(dbVariants.map(v => [v.id, v]));
            let totalAmount = 0;
            const enrichedCart = cart.map(item => {
                const variant = variantMap.get(item.id);
                if (!variant) throw new Error(`Variante ${item.id} introuvable`);
                const priceNum = parseFloat(variant.salePriceDzd);
                totalAmount += priceNum * item.quantity;

                const supplierInfo = variant.variantSuppliers?.[0];
                const productName = (variant as any).product?.name;
                const fullName = productName ? `${productName} — ${variant.name}` : variant.name;

                return {
                    ...item,
                    name: fullName,
                    price: priceNum,
                    supplierId: supplierInfo?.supplierId || null,
                    purchasePrice: supplierInfo?.purchasePrice || null,
                    purchaseCurrency: supplierInfo?.currency || null
                };
            });

            const orderNumber = `B2B-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const userId = user.id;

            const res = await db.transaction(async (tx) => {
                // 1. RE-FETCH Wallet inside transaction with FOR UPDATE lock
                const lockedReseller = await tx.query.resellers.findFirst({
                    where: and(eq(resellers.id, resellerId), eq(resellers.userId, userId)),
                    with: { wallet: true }
                });

                if (!lockedReseller || !lockedReseller.wallet) {
                    throw new Error("Portefeuille introuvable");
                }

                const currentBalance = parseFloat(lockedReseller.wallet.balance || "0");
                if (currentBalance < totalAmount) {
                    throw new Error("Solde insuffisant (Concurrence bloquée)");
                }

                // 2. Insert Order
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

                // 3. Insert Items
                for (const item of enrichedCart) {
                    await tx.insert(orderItems).values({
                        orderId: newOrder.id,
                        variantId: item.id,
                        name: item.name,
                        price: item.price.toString(),
                        quantity: item.quantity,
                        supplierId: item.supplierId,
                        purchasePrice: item.purchasePrice,
                        purchaseCurrency: item.purchaseCurrency
                    });
                }

                // 4. Centralized Allocation
                await allocateOrderStock(tx, newOrder.id, {
                    userId: userId
                });

                // 5. ATOMIC Wallet Update
                await tx.update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} - ${totalAmount}`,
                        totalSpent: sql`${resellerWallets.totalSpent} + ${totalAmount}`,
                        updatedAt: new Date()
                    })
                    .where(eq(resellerWallets.id, lockedReseller.wallet.id));

                const finalResult = await tx.insert(resellerTransactions).values({
                    walletId: lockedReseller.wallet.id,
                    type: "PURCHASE",
                    amount: totalAmount.toString(),
                    orderId: newOrder.id,
                    description: `Achat B2B - ${orderNumber}`
                });

                return { id: newOrder.id, orderNumber };
            });

            // 6. Post-Process Triggers (Push, n8n, Instant Delivery)
            await OrderService.finalizeOrderAfterPayment(res.id);

            return { success: true, orderNumber: res.orderNumber };
        } catch (error) {
            console.error("Checkout error:", error);
            return { success: false, error: "Erreur lors du traitement de la commande" };
        }
    }
);
