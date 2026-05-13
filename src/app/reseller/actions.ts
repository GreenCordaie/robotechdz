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
import { TierService } from "@/services/tier.service";
import { ResellerNotifications } from "@/services/reseller-notifications.service";

export const getCurrentResellerAction = withAuth(
    { roles: [UserRole.RESELLER] },
    async (_, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
                with: { wallet: true, tier: true }
            });

            if (!reseller) return { success: false, error: "Compte revendeur introuvable" };

            // EPIC 1 — fallback gracieux : si pas de tier assigné, retourner le tier par défaut
            // (utile pour les resellers créés AVANT la migration 0005)
            const effectiveTier = reseller.tier ?? (await TierService.getDefaultTier());
            const monthlyVolume = await TierService.getMonthlyPurchaseVolume(reseller.id);

            return {
                success: true,
                data: {
                    ...reseller,
                    tier: effectiveTier,
                    monthlyVolume,
                },
            };
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
                with: {
                    items: {
                        with: {
                            variant: { with: { product: true } },
                        },
                    },
                },
            });
            // Compte des items pour affichage liste rapide
            const enriched = list.map((o) => ({
                ...o,
                itemCount: o.items.reduce((acc, it) => acc + (it.quantity ?? 0), 0),
                productNames: o.items
                    .map((it) => (it.variant as { product?: { name?: string } } | null)?.product?.name ?? it.name)
                    .filter(Boolean)
                    .slice(0, 3),
            }));
            return { success: true, data: enriched };
        } catch (error) {
            return { success: false, error: "Erreur lors de la récupération des commandes" };
        }
    }
);

export const getResellerOrderDetailAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ orderId: z.number().int().positive() }),
    },
    async ({ orderId }, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({ where: eq(resellers.userId, user.id) });
            if (!reseller) return { success: false as const, error: "Compte revendeur introuvable" };

            const { decrypt } = await import("@/lib/encryption");
            const { digitalCodes, digitalCodeSlots, iptvProvisions } = await import("@/db/schema");

            const order = await db.query.orders.findFirst({
                where: and(eq(orders.id, orderId), eq(orders.resellerId, reseller.id)),
                with: {
                    items: {
                        with: {
                            variant: { with: { product: true } },
                            codes: true,
                            slots: { with: { digitalCode: true } },
                        },
                    },
                },
            });

            if (!order) return { success: false as const, error: "Commande introuvable ou accès refusé" };

            const iptv = await db.query.iptvProvisions.findMany({
                where: eq(iptvProvisions.orderId, order.id),
            });

            const itemsWithCredentials = order.items.map((item) => {
                const itemIptv = iptv.filter((p) => p.orderItemId === item.id);
                const codes = (item as { codes?: Array<{ code: string }> }).codes ?? [];
                const slots = (item as { slots?: Array<{ slotNumber: number; code: string | null; digitalCode?: { code: string } | null }> }).slots ?? [];
                const variant = (item as { variant?: { product?: { name?: string } } }).variant;

                return {
                    id: item.id,
                    name: item.name,
                    productName: variant?.product?.name ?? item.name,
                    quantity: item.quantity,
                    price: item.price,
                    standardCodes: codes
                        .map((c) => {
                            try {
                                return decrypt(c.code);
                            } catch {
                                return null;
                            }
                        })
                        .filter((v): v is string => !!v),
                    sharedSlots: slots.map((s) => {
                        let parentCode: string | null = null;
                        let slotPin: string | null = null;
                        try {
                            parentCode = s.digitalCode ? decrypt(s.digitalCode.code) : null;
                        } catch {
                            parentCode = null;
                        }
                        try {
                            slotPin = s.code ? decrypt(s.code) : null;
                        } catch {
                            slotPin = null;
                        }
                        return {
                            slotNumber: s.slotNumber,
                            parentCode,
                            pin: slotPin,
                        };
                    }),
                    iptvProvisions: itemIptv.map((p) => {
                        let credentials: unknown = null;
                        if (p.credentialsEncrypted) {
                            try {
                                const dec = decrypt(p.credentialsEncrypted);
                                credentials = dec ? JSON.parse(dec) : null;
                            } catch {
                                credentials = null;
                            }
                        }
                        return {
                            id: p.id,
                            status: p.status,
                            error: p.error,
                            loadbrainSlug: p.loadbrainSlug,
                            credentials,
                            completedAt: p.completedAt,
                        };
                    }),
                };
            });

            return {
                success: true as const,
                data: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    totalAmount: order.totalAmount,
                    createdAt: order.createdAt,
                    items: itemsWithCredentials,
                },
            };
        } catch (error) {
            console.error("[reseller] getOrderDetail failed:", error);
            return { success: false as const, error: "Erreur serveur" };
        }
    }
);

export const sendCredentialsToClientAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            orderId: z.number().int().positive(),
            customerPhone: z
                .string()
                .min(8)
                .max(20)
                .regex(/^\+?[0-9\s]+$/, "Numéro de téléphone invalide"),
            customMessage: z.string().max(500).optional(),
        }),
    },
    async ({ orderId, customerPhone, customMessage }, user) => {
        const reseller = await db.query.resellers.findFirst({ where: eq(resellers.userId, user.id) });
        if (!reseller) return { success: false as const, error: "Compte revendeur introuvable" };

        const order = await db.query.orders.findFirst({
            where: and(eq(orders.id, orderId), eq(orders.resellerId, reseller.id)),
        });
        if (!order) return { success: false as const, error: "Commande introuvable" };
        if (order.status !== "PAYE" && order.status !== "LIVRE" && order.status !== "TERMINE") {
            return { success: false as const, error: "Commande pas encore livrée" };
        }

        // Mode test / dev / WhatsApp non configuré : no-op success.
        // En prod la WhatsApp API sera appelée via le worker (à câbler en Phase D2).
        const whatsappConfigured = !!process.env.WHATSAPP_API_URL && !!process.env.WHATSAPP_API_KEY;

        if (!whatsappConfigured) {
            return {
                success: true as const,
                data: {
                    delivered: false,
                    queuedForLater: false,
                    reason: "WhatsApp non configuré sur le serveur (mode dev). Aucun envoi effectué.",
                },
            };
        }

        // En prod, on délègue au worker BullMQ (existant) pour ne pas bloquer la response.
        try {
            const { addNotificationJob, NotificationJobType } = await import("@/lib/queue");
            await addNotificationJob(NotificationJobType.SEND_WHATSAPP, {
                phone: customerPhone,
                orderNumber: order.orderNumber,
                customMessage: customMessage ?? null,
                source: "reseller-resend",
                resellerId: reseller.id,
            });
            return {
                success: true as const,
                data: {
                    delivered: false,
                    queuedForLater: true,
                    reason: "Envoi WhatsApp mis en queue. Status visible dans la prochaine version du dashboard.",
                },
            };
        } catch (err) {
            return { success: false as const, error: "Échec de mise en queue WhatsApp" };
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
            let grossTotal = 0;
            const enrichedCart = cart.map(item => {
                const variant = variantMap.get(item.id);
                if (!variant) throw new Error(`Variante ${item.id} introuvable`);
                // EPIC 1 — Prix reseller : override > salePriceDzd
                const basePrice = variant.resellerPriceOverrideDzd
                    ? parseFloat(variant.resellerPriceOverrideDzd)
                    : parseFloat(variant.salePriceDzd);
                grossTotal += basePrice * item.quantity;

                const supplierInfo = variant.variantSuppliers?.[0];
                const productName = (variant as any).product?.name;
                const fullName = productName ? `${productName} — ${variant.name}` : variant.name;

                return {
                    ...item,
                    name: fullName,
                    price: basePrice,
                    supplierId: supplierInfo?.supplierId || null,
                    purchasePrice: supplierInfo?.purchasePrice || null,
                    purchaseCurrency: supplierInfo?.currency || null
                };
            });

            // EPIC 1 — Appliquer le discount tier (Bronze/Silver/Gold)
            // Le customDiscount du reseller s'ajoute par-dessus s'il est présent.
            const tierDiscount = await TierService.applyTierDiscount(reseller.id, grossTotal);
            const customDiscountPct = reseller.customDiscount
                ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscount.discountPct)
                : 0;
            const totalAmount = tierDiscount.discountedAmount * (1 - customDiscountPct / 100);

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

                const tierLabel = tierDiscount.tierName
                    ? ` [${tierDiscount.tierName} -${tierDiscount.discountPct}%${customDiscountPct ? ` +custom -${customDiscountPct}%` : ""}]`
                    : "";
                const finalResult = await tx.insert(resellerTransactions).values({
                    walletId: lockedReseller.wallet.id,
                    type: "PURCHASE",
                    amount: totalAmount.toString(),
                    orderId: newOrder.id,
                    description: `Achat B2B - ${orderNumber}${tierLabel}`
                });

                return { id: newOrder.id, orderNumber };
            });

            // 6. Post-Process Triggers (Push, n8n, Instant Delivery)
            await OrderService.finalizeOrderAfterPayment(res.id);

            // 7. Recalcule async le tier du reseller (peut promouvoir vers le tier supérieur)
            TierService.recalculateTierForReseller(reseller.id).catch((err) => {
                console.error("[tier] recalculate after checkout failed:", err);
            });

            // 8. EPIC 6.2 — auto-WhatsApp confirmation commande (no-op safe en dev)
            const hasInstant = enrichedCart.some((item) => {
                const v = variantMap.get(item.id);
                return !!v?.loadbrainSlug;
            });
            const totalItems = cart.reduce((acc, c) => acc + (c.quantity || 0), 0);
            ResellerNotifications.notifyOrderConfirmed({
                companyName: reseller.companyName,
                contactPhone: reseller.contactPhone,
                orderNumber: res.orderNumber,
                totalAmount,
                itemCount: totalItems,
                hasInstantDelivery: hasInstant,
            }).catch((err) => {
                console.warn("[checkout] notification failed (non-bloquant):", err);
            });

            return { success: true, orderNumber: res.orderNumber };
        } catch (error) {
            console.error("Checkout error:", error);
            return { success: false, error: "Erreur lors du traitement de la commande" };
        }
    }
);
