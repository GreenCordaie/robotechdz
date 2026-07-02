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
import { allocateOrderStock, refundResellerWallet } from "@/lib/orders";
import { OrderService } from "@/services/order.service";
import { TierService } from "@/services/tier.service";
import { ResellerNotifications, notifyLowBalanceAfterDebit } from "@/services/reseller-notifications.service";

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

            // Surface the next tier so the client can render real progression
            // (replaces the SILVER/GOLD hardcodes on /reseller/dashboard).
            const allTiers = await TierService.listAll();
            const currentRank = effectiveTier?.rank ?? 0;
            const nextTier =
                allTiers
                    .slice()
                    .sort((a, b) => a.rank - b.rank)
                    .find((t) => t.rank > currentRank) ?? null;

            return {
                success: true,
                data: {
                    ...reseller,
                    tier: effectiveTier,
                    monthlyVolume,
                    nextTier,
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

            // G2Bulk + IPTV checkouts do NOT insert order_items rows — they
            // write to g2bulk_orders / reseller_iptv_orders mirrors instead.
            // Pull those side-tables in one batch and fold their human title
            // into the enriched payload so the list never falls back to
            // "0 article" / "Produit 47" for those flows.
            const orderIds = list.map((o) => o.id);
            const { g2bulkOrders: g2bTable, resellerIptvOrders: iptvTable } =
                await import("@/db/schema");
            const [g2bRows, iptvRows] =
                orderIds.length === 0
                    ? [[] as Array<{ localOrderId: number; productId: string; quantity: number; wonSnapshot: unknown }>, [] as Array<{ localOrderId: number; provider: string; productName: string; quantity: number }>]
                    : await Promise.all([
                          db
                              .select({
                                  localOrderId: g2bTable.localOrderId,
                                  productId: g2bTable.productId,
                                  quantity: g2bTable.quantity,
                                  wonSnapshot: g2bTable.wonSnapshot,
                              })
                              .from(g2bTable)
                              .where(inArray(g2bTable.localOrderId, orderIds)),
                          db
                              .select({
                                  localOrderId: iptvTable.localOrderId,
                                  provider: iptvTable.provider,
                                  productName: iptvTable.productName,
                                  quantity: iptvTable.quantity,
                              })
                              .from(iptvTable)
                              .where(inArray(iptvTable.localOrderId, orderIds)),
                      ]);

            const g2bByOrder = new Map<number, { title: string; quantity: number }>();
            for (const r of g2bRows) {
                const snap = (r.wonSnapshot ?? null) as { title?: string } | null;
                g2bByOrder.set(r.localOrderId, {
                    title: snap?.title || `Produit ${r.productId}`,
                    quantity: r.quantity,
                });
            }
            const iptvByOrder = new Map<number, { title: string; quantity: number }>();
            for (const r of iptvRows) {
                iptvByOrder.set(r.localOrderId, {
                    title: r.productName,
                    quantity: r.quantity,
                });
            }

            const enriched = list.map((o) => {
                const baseNames = o.items
                    .map((it) => (it.variant as { product?: { name?: string } } | null)?.product?.name ?? it.name)
                    .filter(Boolean);
                const baseCount = o.items.reduce((acc, it) => acc + (it.quantity ?? 0), 0);
                const g2b = g2bByOrder.get(o.id);
                const iptv = iptvByOrder.get(o.id);
                const sideNames: string[] = [];
                let sideCount = 0;
                if (g2b) {
                    sideNames.push(g2b.title);
                    sideCount += g2b.quantity;
                }
                if (iptv) {
                    sideNames.push(iptv.title);
                    sideCount += iptv.quantity;
                }
                return {
                    ...o,
                    itemCount: baseCount + sideCount,
                    productNames: [...baseNames, ...sideNames].slice(0, 3),
                };
            });
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
                            // Customer-facing magic link (/activer/[token]) the reseller
                            // forwards to their client via their own WhatsApp.
                            activationUrl: (s as { activationUrl?: string | null }).activationUrl ?? null,
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
                            // loadbrainSlug intentionally omitted — never leak upstream
                            // provider identifier (e.g. "atlaspro-12m") to reseller browser.
                            credentials,
                            completedAt: p.completedAt,
                        };
                    }),
                };
            });

            // BSV mirror orders keep their delivered codes in bsv_delivered_codes
            // (not order_item_codes), so the mapping above misses them. Surface
            // each BSV line as a standard-code item — product name from the
            // LoadBrain wonSnapshot (rawTitle) — so the success modal + the order
            // detail show the PIN with copy + WhatsApp.
            const { bsvOrders: bsvOrdersT, bsvDeliveredCodes: bsvCodesT } =
                await import("@/db/schema");
            const bsvRows = await db
                .select()
                .from(bsvOrdersT)
                .where(eq(bsvOrdersT.localOrderId, order.id));
            const bsvItems: typeof itemsWithCredentials = [];
            if (bsvRows.length > 0) {
                const bsvCodeRows = await db
                    .select()
                    .from(bsvCodesT)
                    .where(
                        inArray(
                            bsvCodesT.bsvOrderId,
                            bsvRows.map((r) => r.id),
                        ),
                    );
                const byOrder = new Map<number, typeof bsvCodeRows>();
                for (const c of bsvCodeRows) {
                    const arr = byOrder.get(c.bsvOrderId) ?? [];
                    arr.push(c);
                    byOrder.set(c.bsvOrderId, arr);
                }
                for (const br of bsvRows) {
                    const title =
                        (br.wonSnapshot as { rawTitle?: string } | null)?.rawTitle ??
                        null;
                    const decoded = (byOrder.get(br.id) ?? [])
                        .map((c) => {
                            try {
                                return decrypt(c.code);
                            } catch {
                                return null;
                            }
                        })
                        .filter((v): v is string => !!v);
                    bsvItems.push({
                        id: -br.id,
                        name: title ?? "Carte cadeau",
                        productName: title ?? "Carte cadeau",
                        quantity: br.quantity,
                        price: br.pricePaidDzd,
                        standardCodes: decoded,
                        sharedSlots: [],
                        iptvProvisions: [],
                    });
                }
            }

            return {
                success: true as const,
                data: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    totalAmount: order.totalAmount,
                    createdAt: order.createdAt,
                    items: [...itemsWithCredentials, ...bsvItems],
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

// Note: WhatsApp code delivery for the legacy/streaming reseller path is NOT
// enqueued here. It is driven by OrderService.finalizeOrderAfterPayment(), which
// fires SystemEvent.ORDER_DELIVERED → triggerOrderDelivery() — the same proven
// path the kiosk/caisse use. That helper reads the order's allocated codes/slots,
// gates on deliveryMethod === 'WHATSAPP', and formats the real message. Persisting
// deliveryMethod + customerPhone on the order (below) is all that path needs.

export const checkoutResellerAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            resellerId: z.number(),
            // Cart line is one of four variants:
            //   - legacy local variant (`id`)
            //   - BSV mirror listing (`listingId`) — legacy frozen-seller buy
            //   - BSV SKU catalog (`sku`) — stable cluster buy (auto-fallback)
            //   - G2Bulk product (`g2bulkProductId`)
            cart: z.array(
                z.union([
                    z.object({
                        id: z.number(),
                        quantity: z.number().min(1),
                    }),
                    z.object({
                        listingId: z.string().min(1),
                        quantity: z.number().min(1),
                        // Manual-delivery buyer field (e.g. account login) the
                        // seller needs. Forwarded to LoadBrain; required-but-empty
                        // is rejected there (refunded line).
                        buyerInfo: z.string().max(2000).optional(),
                    }),
                    z.object({
                        sku: z.string().min(1),
                        quantity: z.number().min(1),
                        buyerInfo: z.string().max(2000).optional(),
                    }),
                    z.object({
                        g2bulkProductId: z.number().int().positive(),
                        quantity: z.number().min(1),
                    }),
                ])
            ),
            // Idempotency key (a client UUID per buy click) — a retry with the
            // same key returns the original order instead of a second debit (#3).
            idempotencyKey: z.string().min(1).max(128).optional(),
            // Max total (DZD) the reseller confirmed in the UI — the LIVE charge
            // is rejected if it exceeds this, so a price move can't over-charge (#4).
            maxPriceDzd: z.number().positive().optional(),
            // Delivery choice (print vs WhatsApp) — additive. TICKET (default)
            // queues the order for the per-reseller print agent; WHATSAPP skips
            // printing and best-effort enqueues a WhatsApp notification.
            deliveryMethod: z.enum(["TICKET", "WHATSAPP"]).optional(),
            customerPhone: z.string().max(40).optional(),
        }),
    },
    async ({ resellerId, cart, idempotencyKey, maxPriceDzd, deliveryMethod, customerPhone }, user) => {
        // Enforce ownership: session user must own this reseller account
        const reseller = await db.query.resellers.findFirst({
            where: and(eq(resellers.id, resellerId), eq(resellers.userId, user.id)),
            with: { wallet: true }
        });

        if (!reseller) return { success: false, error: "Compte revendeur invalide" };

        // Split cart into legacy local, BSV mirror, BSV SKU, and G2Bulk lines.
        const legacyCart = cart.filter(
            (c): c is { id: number; quantity: number } => "id" in c
        );
        const bsvListingCart = cart.filter(
            (c): c is { listingId: string; quantity: number; buyerInfo?: string } => "listingId" in c
        );
        const bsvSkuCart = cart.filter(
            (c): c is { sku: string; quantity: number; buyerInfo?: string } => "sku" in c
        );
        const g2bulkCart = cart.filter(
            (c): c is { g2bulkProductId: number; quantity: number } =>
                "g2bulkProductId" in c
        );

        // Both BSV variants resolve to the same fulfilment path; normalize to a
        // single discriminated cart so handleBsvCheckout has one code path.
        const bsvCart: Array<
            | { kind: "listing"; listingId: string; quantity: number; buyerInfo?: string }
            | { kind: "sku"; sku: string; quantity: number; buyerInfo?: string }
        > = [
            ...bsvListingCart.map((c) => ({
                kind: "listing" as const,
                listingId: c.listingId,
                quantity: c.quantity,
                buyerInfo: c.buyerInfo,
            })),
            ...bsvSkuCart.map((c) => ({
                kind: "sku" as const,
                sku: c.sku,
                quantity: c.quantity,
                buyerInfo: c.buyerInfo,
            })),
        ];

        if (g2bulkCart.length > 0 && bsvCart.length === 0 && legacyCart.length === 0) {
            return handleG2BulkCheckout({
                reseller,
                userId: user.id,
                g2bulkCart,
            });
        }

        if (g2bulkCart.length > 0 && (bsvCart.length > 0 || legacyCart.length > 0)) {
            return {
                success: false,
                error: "Mixer panier G2Bulk avec BSV ou variants locaux pas supporté",
            };
        }

        if (bsvCart.length > 0 && legacyCart.length === 0) {
            return handleBsvCheckout({
                reseller,
                userId: user.id,
                bsvCart,
                idempotencyKey,
                maxPriceDzd,
            });
        }

        if (bsvCart.length > 0 && legacyCart.length > 0) {
            return {
                success: false,
                error: "Mixer panier BSV + variants locaux pas supporté",
            };
        }

        try {
            // HARDENING: Recalculate prices server-side to prevent client-side manipulation
            const variantIds = legacyCart.map(item => item.id);
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
            const enrichedCart = legacyCart.map(item => {
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

                // Verrou réel de la ligne wallet : tx.query ne pose AUCUN lock ;
                // sans ce SELECT ... FOR UPDATE deux checkouts concurrents passent
                // tous deux le contrôle de solde et débitent → balance négative.
                const [lockedWallet] = await tx
                    .select({ balance: resellerWallets.balance })
                    .from(resellerWallets)
                    .where(eq(resellerWallets.id, lockedReseller.wallet.id))
                    .for("update");
                const currentBalance = parseFloat(lockedWallet?.balance ?? "0");
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
                    deliveryMethod: deliveryMethod === "WHATSAPP" ? "WHATSAPP" : "TICKET",
                    printStatus: (deliveryMethod === "WHATSAPP" ? "not_required" : "print_pending") as any,
                    customerPhone: customerPhone ?? null,
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
                    description: `Achat B2B - ${orderNumber}${tierLabel}`,
                    source: "LEGACY",
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
            const totalItems = legacyCart.reduce((acc, c) => acc + (c.quantity || 0), 0);
            ResellerNotifications.notifyOrderConfirmed({
                resellerId: reseller.id,
                companyName: reseller.companyName,
                contactPhone: reseller.contactPhone,
                orderNumber: res.orderNumber,
                totalAmount,
                itemCount: totalItems,
                hasInstantDelivery: hasInstant,
            }).catch((err) => {
                console.warn("[checkout] notification failed (non-bloquant):", err);
            });

            // Low-balance alert (edge-triggered, opt-in via reseller threshold).
            notifyLowBalanceAfterDebit(
                { id: reseller.id, companyName: reseller.companyName, contactPhone: reseller.contactPhone },
                totalAmount,
            ).catch(() => {});

            // 8b. WhatsApp delivery: nothing to enqueue here. Step 6
            // (finalizeOrderAfterPayment) already fires ORDER_DELIVERED, which
            // sends the codes via triggerOrderDelivery when deliveryMethod is
            // WHATSAPP — the same path the kiosk/caisse use. TICKET orders are
            // picked up by the per-reseller print agent (printStatus=print_pending).

            // 9. EPIC 1 / Phase G — dispatch outbound webhooks (no-op si pas d'abonnement)
            const { dispatchResellerEvent } = await import("@/services/webhook-dispatcher.service");
            dispatchResellerEvent(reseller.id, "order.paid", {
                orderNumber: res.orderNumber,
                orderId: res.id,
                totalAmount,
                itemCount: totalItems,
                hasInstantDelivery: hasInstant,
            }).catch((err) => {
                console.warn("[checkout] webhook dispatch failed (non-bloquant):", err);
            });

            return { success: true, orderId: res.id, orderNumber: res.orderNumber };
        } catch (error) {
            console.error("Checkout error:", error);
            return { success: false, error: "Erreur lors du traitement de la commande" };
        }
    }
);

/* ----------------------------------------------------------------------
 * BSV mirror checkout — production path.
 *
 * Two cart variants resolve here, unified to a single fulfilment flow:
 *   - `listing` — legacy frozen-seller buy (orders.create by listingId).
 *   - `sku`     — stable cluster buy (orders.create by SKU; LoadBrain then
 *     auto-falls-back across live member listings → no "listing no longer
 *     active" error).
 *
 * MONEY-SAFETY refactor (2026-06-11):
 *   The LoadBrain `orders.create` network call is NO LONGER held inside the
 *   db.transaction. The tx now ONLY debits the wallet + writes the local
 *   order + writes bsv_orders rows as PENDING_LOADBRAIN with lbOrderId=NULL,
 *   then commits. AFTER commit we call orders.create per line and patch
 *   lbOrderId. A per-line failure marks that line FAILED and refunds exactly
 *   that line via refundResellerWallet — no orphaned LoadBrain order, no
 *   lock held across the network, no all-or-nothing money loss.
 * --------------------------------------------------------------------- */
type BsvCartLine =
    | { kind: "listing"; listingId: string; quantity: number; buyerInfo?: string }
    | { kind: "sku"; sku: string; quantity: number; buyerInfo?: string };

async function handleBsvCheckout({
    reseller,
    userId,
    bsvCart,
    idempotencyKey,
    maxPriceDzd,
}: {
    reseller: { id: number; companyName: string; contactPhone: string | null; customDiscount: string | null; wallet: { id: number; balance: string | null } | null };
    userId: number;
    bsvCart: Array<BsvCartLine>;
    idempotencyKey?: string;
    maxPriceDzd?: number;
}) {
    try {
        const { bsvOrders: bsvOrdersTable } = await import("@/db/schema");
        const { lbV2 } = await import("@/lib/loadbrain-v2");
        const { bsvPricingService } = await import(
            "@/services/bsv-pricing.service"
        );

        if (!lbV2) {
            return {
                success: false as const,
                error: "LoadBrain non configuré (LOADBRAIN_API_KEY manquant)",
            };
        }

        // ── Price every line (cost basis differs by variant) ──────────────
        // listing → fetch the seller offer (priceCents). sku → read the
        // stable cluster catalog once (salePriceCents = post-site-markup USD).
        type PricingInput = {
            priceCentsUsd: number;
            category: string;
            brand: string;
            sku: string;
        };
        const pricingInputs: Array<PricingInput | null> = new Array(
            bsvCart.length,
        ).fill(null);
        // upstreamRef = what we store on the bsv_orders row + pass to
        // orders.create (listingId or sku). Human-friendly for error text too.
        const upstreamRef: string[] = new Array(bsvCart.length).fill("");

        // SKU lines: one shared catalog read → sku→item map.
        const skuLines = bsvCart
            .map((c, i) => ({ c, i }))
            .filter((x) => x.c.kind === "sku");
        if (skuLines.length > 0) {
            let catalog: ReadonlyArray<{
                sku?: string;
                category?: string;
                brand?: string;
                salePriceCents?: number;
            }>;
            try {
                // The gateway returns the cluster catalog as `{ items, mode }`,
                // but the SDK types it as a bare array. Accept either shape —
                // casting `{items,...}` to an array makes `.filter` below throw
                // `.filter is not a function` AT CHECKOUT (money path).
                const resp = await lbV2.giftcards.catalog.list();
                catalog = (Array.isArray(resp)
                    ? resp
                    : ((resp as { items?: unknown[] } | null)?.items ?? [])) as ReadonlyArray<{
                    sku?: string;
                    category?: string;
                    brand?: string;
                    salePriceCents?: number;
                }>;
            } catch (err) {
                return {
                    success: false as const,
                    error: `LoadBrain catalogue: ${(err as Error).message}`,
                };
            }
            const bySku = new Map(
                catalog
                    .filter((x) => typeof x.sku === "string")
                    .map((x) => [x.sku as string, x]),
            );
            for (const { c, i } of skuLines) {
                if (c.kind !== "sku") continue;
                const item = bySku.get(c.sku);
                if (!item) {
                    return {
                        success: false as const,
                        error: `Produit ${c.sku} indisponible (catalogue mis à jour)`,
                    };
                }
                upstreamRef[i] = c.sku;
                pricingInputs[i] = {
                    priceCentsUsd: item.salePriceCents ?? 0,
                    category: item.category ?? "giftcard",
                    brand: item.brand ?? "",
                    sku: c.sku,
                };
            }
        }

        // Listing lines: resolve each seller offer via the SDK.
        const listingLines = bsvCart
            .map((c, i) => ({ c, i }))
            .filter((x) => x.c.kind === "listing");
        if (listingLines.length > 0) {
            type Detail = Awaited<ReturnType<typeof lbV2.giftcards.listings.get>>;
            const fetched = await Promise.all(
                listingLines.map(async ({ c }) => {
                    if (c.kind !== "listing") return null;
                    try {
                        return await lbV2.giftcards.listings.get(c.listingId);
                    } catch {
                        return null;
                    }
                }),
            );
            for (let k = 0; k < listingLines.length; k++) {
                const { c, i } = listingLines[k];
                if (c.kind !== "listing") continue;
                const l = fetched[k] as Detail | null;
                if (!l) {
                    return {
                        success: false as const,
                        error: `Annonce ${c.listingId} introuvable (peut-être expirée)`,
                    };
                }
                upstreamRef[i] = c.listingId;
                pricingInputs[i] = {
                    priceCentsUsd: l.priceCents,
                    category: l.product.category,
                    brand: l.product.brand,
                    sku: l.product.sku,
                };
            }
        }

        const resolvedInputs = pricingInputs.filter(
            (p): p is PricingInput => p !== null,
        );
        if (resolvedInputs.length !== bsvCart.length) {
            return {
                success: false as const,
                error: "Produit BSV introuvable (peut-être expiré)",
            };
        }

        const tier = await TierService.getCurrentTierForReseller(reseller.id);
        const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
        const customDiscountPct = reseller.customDiscount
            ? Math.min(
                  parseFloat(reseller.customDiscount),
                  100 - tierDiscountPct
              )
            : 0;

        const prices = await bsvPricingService.computeBulk(resolvedInputs, {
            resellerId: reseller.id,
            tierDiscountPct,
            customDiscountPct,
        });

        const lineTotals = bsvCart.map(
            (c, i) => prices[i].finalPriceDzd * c.quantity,
        );
        const totalAmount = lineTotals.reduce((acc, n) => acc + n, 0);

        // #4 — price guard: never debit MORE than the reseller confirmed in the
        // UI. A small tolerance absorbs rounding/FX; beyond it the live price has
        // moved, so abort cleanly (no debit) and let them re-confirm.
        if (maxPriceDzd != null && totalAmount > maxPriceDzd * 1.02) {
            return {
                success: false as const,
                error: "Le prix a changé depuis l'affichage — réessayez.",
            };
        }

        // #3 — idempotency: a stable order number derived from the client key so a
        // network retry maps to the SAME order. A pre-check returns the original
        // (no second debit) when the first attempt already committed.
        const orderNumber = idempotencyKey
            ? `BSV-${idempotencyKey}`
            : `BSV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        if (idempotencyKey) {
            const [existing] = await db
                .select({ id: orders.id })
                .from(orders)
                .where(
                    and(
                        eq(orders.orderNumber, orderNumber),
                        eq(orders.resellerId, reseller.id),
                    ),
                )
                .limit(1);
            if (existing) {
                return {
                    success: true as const,
                    orderId: existing.id,
                    orderNumber,
                };
            }
        }

        // ── Phase 1 (in tx): debit + local order + PENDING bsv_orders rows ──
        // NO network call inside the lock. Each bsv_orders row starts
        // PENDING_LOADBRAIN with lbOrderId = NULL; we patch it after commit.
        const res = await db.transaction(async (tx) => {
            const lockedReseller = await tx.query.resellers.findFirst({
                where: and(eq(resellers.id, reseller.id), eq(resellers.userId, userId)),
                with: { wallet: true },
            });
            if (!lockedReseller || !lockedReseller.wallet) {
                throw new Error("Portefeuille introuvable");
            }
            // Verrou réel de la ligne wallet (la relational query ne verrouille pas)
            const [lockedWallet] = await tx
                .select({ balance: resellerWallets.balance })
                .from(resellerWallets)
                .where(eq(resellerWallets.id, lockedReseller.wallet.id))
                .for("update");
            const currentBalance = parseFloat(lockedWallet?.balance ?? "0");
            if (currentBalance < totalAmount) {
                throw new Error("Solde insuffisant");
            }

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

            await tx
                .update(resellerWallets)
                .set({
                    balance: sql`${resellerWallets.balance} - ${totalAmount}`,
                    totalSpent: sql`${resellerWallets.totalSpent} + ${totalAmount}`,
                    updatedAt: new Date(),
                })
                .where(eq(resellerWallets.id, lockedReseller.wallet.id));

            await tx.insert(resellerTransactions).values({
                walletId: lockedReseller.wallet.id,
                type: "PURCHASE",
                amount: totalAmount.toString(),
                orderId: newOrder.id,
                description: `Achat BSV - ${orderNumber}`,
                source: "BSV",
            });

            // PENDING rows — lbOrderId filled in Phase 2 (after commit).
            const bsvOrderIds: number[] = [];
            for (let i = 0; i < bsvCart.length; i++) {
                const c = bsvCart[i];
                const [row] = await tx
                    .insert(bsvOrdersTable)
                    .values({
                        localOrderId: newOrder.id,
                        resellerId: reseller.id,
                        // Generic upstream reference: listingId OR sku.
                        listingId: upstreamRef[i],
                        quantity: c.quantity,
                        pricePaidDzd: lineTotals[i].toFixed(2),
                        lbOrderId: null,
                        status: "PENDING_LOADBRAIN",
                    })
                    .returning({ id: bsvOrdersTable.id });
                bsvOrderIds.push(row.id);
            }

            return { id: newOrder.id, orderNumber, bsvOrderIds };
        });

        // ── Phase 2 (after commit): place each LoadBrain order, patch row ──
        // A per-line failure marks that line FAILED and refunds exactly that
        // line. Other lines stay valid. We never roll back the whole order.
        let failedLines = 0;
        let refundFailedLines = 0;
        let refundedTotal = 0;
        for (let i = 0; i < bsvCart.length; i++) {
            const c = bsvCart[i];
            const bsvOrderId = res.bsvOrderIds[i];
            const externalOrderId = `${res.orderNumber}-${i}`;
            const buyerInfo = c.buyerInfo?.trim() || undefined;
            const createInput =
                c.kind === "listing"
                    ? { listingId: c.listingId, quantity: c.quantity, externalOrderId, buyerInfo }
                    : { sku: c.sku, quantity: c.quantity, externalOrderId, buyerInfo };
            try {
                const lbCreate = await lbV2.giftcards.orders.create(
                    createInput as Parameters<typeof lbV2.giftcards.orders.create>[0],
                );
                const lbOrderId =
                    (lbCreate as { id?: string; orderId?: string }).id ??
                    (lbCreate as { id?: string; orderId?: string }).orderId ??
                    null;
                await db
                    .update(bsvOrdersTable)
                    .set({ lbOrderId })
                    .where(eq(bsvOrdersTable.id, bsvOrderId));
            } catch (err) {
                console.error(
                    `[bsv-checkout] line ${i} (${upstreamRef[i]}) LB order failed:`,
                    err,
                );
                failedLines++;
                refundedTotal += lineTotals[i];
                // Mark the line failed + refund exactly its amount.
                await db
                    .transaction(async (tx) => {
                        await tx
                            .update(bsvOrdersTable)
                            .set({ status: "FAILED" })
                            .where(eq(bsvOrdersTable.id, bsvOrderId));
                        await refundResellerWallet(tx, {
                            resellerId: reseller.id,
                            montant: lineTotals[i],
                            orderId: res.id,
                            description: `Remboursement BSV (ligne indisponible) - ${res.orderNumber}`,
                        });
                    })
                    .catch((refundErr) => {
                        // Refund failed → the reseller is debited for an
                        // unfulfilled line. Count it so the response warns the
                        // user (no silent money loss); an operator reconciles a
                        // FAILED bsv_order that has no matching REFUND tx.
                        refundFailedLines++;
                        console.error(
                            `[bsv-checkout] refund FAILED for line ${i} — manual reconcile needed:`,
                            refundErr,
                        );
                    });
            }
        }

        const settledAmount = totalAmount - refundedTotal;

        // Notification (non-blocking)
        ResellerNotifications.notifyOrderConfirmed({
            resellerId: reseller.id,
            companyName: reseller.companyName,
            contactPhone: reseller.contactPhone,
            orderNumber: res.orderNumber,
            totalAmount: settledAmount,
            itemCount: bsvCart.reduce((a, c) => a + c.quantity, 0),
            hasInstantDelivery: true,
        }).catch((err) => {
            console.warn("[bsv-checkout] notify failed (non-bloquant):", err);
        });

        // Low-balance alert (edge-triggered, opt-in via reseller threshold).
        notifyLowBalanceAfterDebit(
            { id: reseller.id, companyName: reseller.companyName, contactPhone: reseller.contactPhone },
            settledAmount,
        ).catch(() => {});

        revalidatePath("/reseller/orders");

        // Every line failed → treat as a failed checkout (wallet fully refunded).
        if (failedLines === bsvCart.length) {
            return {
                success: false as const,
                error: "Produit momentanément indisponible — réessayez. Vous avez été remboursé.",
            };
        }

        // Partial failure — at least one line was not fulfilled. Never present
        // this as a clean success; surface it (and flag any refund that itself
        // failed, so the reseller knows money is pending reconciliation).
        if (failedLines > 0) {
            const refundNote =
                refundFailedLines > 0
                    ? ` ⚠️ ${refundFailedLines} ligne(s) NON remboursée(s) automatiquement — le support régularise.`
                    : " Les lignes concernées ont été remboursées.";
            return {
                success: true as const,
                orderId: res.id,
                orderNumber: res.orderNumber,
                warning: `${failedLines}/${bsvCart.length} produit(s) indisponible(s).${refundNote}`,
            };
        }
        return { success: true as const, orderId: res.id, orderNumber: res.orderNumber };
    } catch (error) {
        console.error("BSV checkout error:", error);
        const msg =
            error instanceof Error
                ? error.message
                : "Erreur traitement commande BSV";
        return { success: false as const, error: msg };
    }
}

/* ----------------------------------------------------------------------
 * G2Bulk mirror checkout (Lot 5)
 *
 * Mirrors handleBsvCheckout for the G2Bulk catalogue. Uses
 * lbV2.g2bulk.products.get + lbV2.g2bulk.orders.create when LoadBrain
 * is configured; falls back to the mock SDK otherwise (mirrors the
 * BSV mock fallback pattern).
 *
 * SWAP WHEN sdk-v2 g2bulk methods land in this codebase's installed
 * SDK: replace mock helpers with direct lbV2.g2bulk.products.get /
 * lbV2.g2bulk.orders.create calls. The SDK already exposes them
 * (see ../LoadBrain/packages/sdk-v2/src/client.ts) — only the
 * package re-install is pending.
 * --------------------------------------------------------------------- */
async function handleG2BulkCheckout({
    reseller,
    userId,
    g2bulkCart,
}: {
    reseller: { id: number; companyName: string; contactPhone: string | null; customDiscount: string | null; wallet: { id: number; balance: string | null } | null };
    userId: number;
    g2bulkCart: Array<{ g2bulkProductId: number; quantity: number }>;
}) {
    try {
        const { g2bulkOrders: g2bulkOrdersTable } = await import("@/db/schema");
        const { lbV2 } = await import("@/lib/loadbrain-v2");
        const { g2bulkPricingService } = await import(
            "@/services/g2bulk-pricing.service"
        );
        // Shared classification — same source of truth as the catalog pricing
        // path so the displayed price and the debited price never diverge.
        const { deriveG2BulkBrand, inferG2BulkCategory } = await import(
            "./shop/brand-utils"
        );
        const {
            getG2BulkProductMock,
            createG2BulkOrderMock,
        } = await import("@/lib/__mocks__/g2bulk-sdk.mock");

        // Resolve every cart productId. Prefer real SDK, fall back to mock.
        type ProviderProduct = {
            id: number;
            providerId: string;
            categoryId: number | null;
            title: string;
            unitPriceCents: number;
            currency: string;
            stock: number;
            /** Upstream raw payload; `category_title` is the operator-friendly
             * brand label used by deriveG2BulkBrand. May be absent (mock/SDK
             * `get`), in which case classification falls back to the title. */
            raw?: { category_title?: string } | null;
        };

        const sdkAny = lbV2 as unknown as {
            g2bulk?: {
                products?: { get?: (id: number) => Promise<{ product: ProviderProduct }> };
                orders?: { create?: (input: { productId: number; quantity: number; externalOrderId: string }) => Promise<{ orderId: string }> };
            };
        } | null;
        const useRealSdk = !!sdkAny?.g2bulk?.products?.get;

        const fetched: Array<{ product: ProviderProduct } | null> = await Promise.all(
            g2bulkCart.map(async (c) => {
                try {
                    if (useRealSdk) {
                        return await sdkAny!.g2bulk!.products!.get!(c.g2bulkProductId);
                    }
                    return await getG2BulkProductMock(c.g2bulkProductId);
                } catch {
                    return null;
                }
            })
        );
        const failedIdx = fetched.findIndex((r) => r === null);
        if (failedIdx >= 0) {
            return {
                success: false as const,
                error: `Produit G2Bulk ${g2bulkCart[failedIdx].g2bulkProductId} introuvable`,
            };
        }
        const productMap = new Map<number, ProviderProduct>(
            fetched.map((r, i) => [g2bulkCart[i].g2bulkProductId, r!.product])
        );

        const tier = await TierService.getCurrentTierForReseller(reseller.id);
        const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
        const customDiscountPct = reseller.customDiscount
            ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscountPct)
            : 0;

        const pricingInputs = g2bulkCart.map((c) => {
            const p = productMap.get(c.g2bulkProductId)!;
            const brand = deriveG2BulkBrand({
                title: p.title,
                categoryTitle: p.raw?.category_title ?? null,
            });
            return {
                priceCentsUsd: p.unitPriceCents,
                category: inferG2BulkCategory(p.categoryId, brand),
                brand,
                sku: `g2b__${p.providerId}`,
            };
        });

        const prices = await g2bulkPricingService.computeBulk(pricingInputs, {
            resellerId: reseller.id,
            tierDiscountPct,
            customDiscountPct,
        });

        const totalAmount = g2bulkCart.reduce(
            (acc, c, i) => acc + prices[i].finalPriceDzd * c.quantity,
            0
        );

        const orderNumber = `G2B-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const res = await db.transaction(async (tx) => {
            const lockedReseller = await tx.query.resellers.findFirst({
                where: and(eq(resellers.id, reseller.id), eq(resellers.userId, userId)),
                with: { wallet: true },
            });
            if (!lockedReseller || !lockedReseller.wallet) {
                throw new Error("Portefeuille introuvable");
            }
            // Verrou réel de la ligne wallet (la relational query ne verrouille pas)
            const [lockedWallet] = await tx
                .select({ balance: resellerWallets.balance })
                .from(resellerWallets)
                .where(eq(resellerWallets.id, lockedReseller.wallet.id))
                .for("update");
            const currentBalance = parseFloat(lockedWallet?.balance ?? "0");
            if (currentBalance < totalAmount) {
                throw new Error("Solde insuffisant");
            }

            // 1. Local order row
            const [newOrder] = await tx.insert(orders).values({
                orderNumber,
                status: "PAYE",
                totalAmount: totalAmount.toFixed(2),
                montantPaye: totalAmount.toFixed(2),
                resteAPayer: "0",
                resellerId: reseller.id,
                source: "B2B_WEB",
                // G2Bulk is portal-delivered: codes arrive asynchronously into a
                // separate table (g2bulk_delivered_codes), never into order.items,
                // so this order can neither be printed nor auto-delivered by WhatsApp.
                // It does not participate in the delivery-method choice.
                deliveryMethod: "TICKET",
            }).returning();

            // 2. Debit wallet
            await tx
                .update(resellerWallets)
                .set({
                    balance: sql`${resellerWallets.balance} - ${totalAmount}`,
                    totalSpent: sql`${resellerWallets.totalSpent} + ${totalAmount}`,
                    updatedAt: new Date(),
                })
                .where(eq(resellerWallets.id, lockedReseller.wallet.id));

            await tx.insert(resellerTransactions).values({
                walletId: lockedReseller.wallet.id,
                type: "PURCHASE",
                amount: totalAmount.toString(),
                orderId: newOrder.id,
                description: `Achat G2Bulk - ${orderNumber}`,
                source: "G2BULK",
            });

            // 3. Per-cart-line: POST to LoadBrain g2bulk + insert g2bulk_orders row
            for (let i = 0; i < g2bulkCart.length; i++) {
                const c = g2bulkCart[i];
                const price = prices[i];
                const externalOrderId = `${orderNumber}-${i}`;

                const lbCreate = useRealSdk
                    ? await sdkAny!.g2bulk!.orders!.create!({
                        productId: c.g2bulkProductId,
                        quantity: c.quantity,
                        externalOrderId,
                    })
                    : await createG2BulkOrderMock({
                        productId: c.g2bulkProductId,
                        quantity: c.quantity,
                        externalOrderId,
                    });

                await tx.insert(g2bulkOrdersTable).values({
                    localOrderId: newOrder.id,
                    resellerId: reseller.id,
                    productId: String(c.g2bulkProductId),
                    quantity: c.quantity,
                    pricePaidDzd: (price.finalPriceDzd * c.quantity).toFixed(2),
                    lbOrderId: lbCreate.orderId,
                    status: "PENDING_LOADBRAIN",
                });
            }

            return { id: newOrder.id, orderNumber };
        });

        // Best-effort notification (non-blocking)
        ResellerNotifications.notifyOrderConfirmed({
            resellerId: reseller.id,
            companyName: reseller.companyName,
            contactPhone: reseller.contactPhone,
            orderNumber: res.orderNumber,
            totalAmount,
            itemCount: g2bulkCart.reduce((a, c) => a + c.quantity, 0),
            hasInstantDelivery: true,
        }).catch((err) => {
            console.warn("[g2bulk-checkout] notify failed (non-bloquant):", err);
        });

        // Low-balance alert (edge-triggered, opt-in via reseller threshold).
        notifyLowBalanceAfterDebit(
            { id: reseller.id, companyName: reseller.companyName, contactPhone: reseller.contactPhone },
            totalAmount,
        ).catch(() => {});

        revalidatePath("/reseller/orders");

        return { success: true as const, orderId: res.id, orderNumber: res.orderNumber };
    } catch (error) {
        console.error("G2Bulk checkout error:", error);
        const msg =
            error instanceof Error
                ? error.message
                : "Erreur traitement commande G2Bulk";
        return { success: false as const, error: msg };
    }
}
