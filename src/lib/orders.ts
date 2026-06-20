import { db } from "@/db";
import {
    orders,
    digitalCodes,
    digitalCodeSlots,
    orderItems,
    suppliers,
    supplierTransactions,
    productVariantSuppliers,
    resellerWallets,
    resellerTransactions
} from "@/db/schema";
import { eq, and, sql, inArray, exists } from "drizzle-orm";
import { checkStockAndAlert } from "@/lib/stock-alerts";
import { logSecurityAction } from "@/lib/security";
import { logger } from "@/lib/logger";
import { OrderStatus, DigitalCodeStatus, DigitalCodeSlotStatus, SupplierTransactionType } from "@/lib/constants";
// P2-2 LoadBrain modules are dynamically imported inside allocateOrderStock
// (see the gate below). Lazy import keeps this module's load side-effect-free:
// `@/lib/loadbrain-netflix-flag` pulls in SystemQueries whose `cache()` static
// initializer must not run merely because another code path imports `orders.ts`.

type Transaction = any; // Drizzle transaction type depends on client, using any for broad compatibility

export async function allocateOrderStock(
    tx: Transaction,
    orderId: number,
    options: {
        userId?: number,
        itemSuppliers?: Record<string, number>,
        itemPriceOverrides?: Record<string, { price: string, currency: string }>
    }
) {
    const items = await tx.query.orderItems.findMany({
        where: (table: any, { eq }: any) => eq(table.orderId, orderId),
        with: {
            variant: {
                with: {
                    product: true
                }
            }
        }
    });

    let hasManualDelivery = false;

    // P2-2: when LB_NETFLIX_AUTHORITATIVE is ON, shared-streaming slot allocation
    // is delegated to LoadBrain (system-of-record). Read the gate ONCE per call
    // (not per item) so the decision is stable across the items loop. Default OFF
    // → the historical local-pick path below runs verbatim (byte-identical).
    // Dynamic import (see header): only load the flag module when this function
    // actually runs, never at `orders.ts` import time.
    const { isLbNetflixAuthoritative } = await import("@/lib/loadbrain-netflix-flag");
    const lbAuthoritative = await isLbNetflixAuthoritative();

    // Resolve the order's real customer (phone/name/email) ONCE, only needed when
    // the LB gate is on. Threaded into the LoadBrain orchestrator so the magic-link
    // recipient is the actual buyer instead of the orchestrator's fake placeholder.
    // `orders.customerPhone` (denormalized) wins; otherwise fall back to the linked
    // client's `telephone`/`nomComplet`. clients has no email column → email stays
    // undefined. If the order can't be resolved, `customer` is null and the
    // orchestrator uses its placeholder phone.
    let orderCustomer: { phone?: string | null; name?: string | null; email?: string | null } | null = null;
    if (lbAuthoritative) {
        const order = await tx.query.orders.findFirst({
            where: (o: any, { eq }: any) => eq(o.id, orderId),
            with: { client: true },
        });
        if (order) {
            orderCustomer = {
                phone: order.customerPhone ?? order.client?.telephone ?? null,
                name: order.client?.nomComplet ?? null,
                email: null,
            };
        }
    }

    // Fetch dynamic exchange rate
    const settings = await tx.query.shopSettings.findFirst();
    const EXCHANGE_RATE = settings?.usdExchangeRate ? parseFloat(settings.usdExchangeRate) : 245;

    for (const item of items) {
        let currentItemSlots: any[] = [];

        // Skip IPTV items — provisioned asynchronously via LoadBrain webhook
        if (item.variant?.loadbrainSlug) {
            hasManualDelivery = true;
            continue;
        }

        // 1. Digital Stock Allocation
        if (item.variant?.product?.isManualDelivery === false) {
            if (item.variant.isSharing) {
                // P2-2 GATE — LoadBrain as sale-time allocation authority.
                // When the flag is OFF this block is skipped entirely and the
                // EXISTING local-pick path below runs byte-identical to before.
                if (lbAuthoritative) {
                    const { allocateSharingItemViaLoadBrain, LbAllocError } = await import("@/lib/loadbrain-netflix-allocation");
                    try {
                        const { slots } = await allocateSharingItemViaLoadBrain(
                            tx,
                            {
                                id: item.id,
                                variantId: item.variantId,
                                quantity: item.quantity,
                                customer: orderCustomer ?? undefined,
                            },
                            {},
                        );
                        // The orchestrator already marked the local mirror slots
                        // VENDU + lbSlotId (and they carry their imported
                        // activationUrl/token) inside this tx. Mark parent
                        // digital_codes VENDU when fully consumed — same
                        // bookkeeping the local path does below.
                        const parentSlotRows = await tx
                            .select({ digitalCodeId: digitalCodeSlots.digitalCodeId })
                            .from(digitalCodeSlots)
                            .where(inArray(digitalCodeSlots.id, slots.map((s) => s.localSlotId)));
                        const lbParentCodeIds = Array.from(
                            new Set(parentSlotRows.map((r: any) => r.digitalCodeId)),
                        );
                        for (const pid of lbParentCodeIds) {
                            const remainingSlots = await tx.query.digitalCodeSlots.findMany({
                                where: (dcs: any, { and, eq }: any) => and(eq(dcs.digitalCodeId, pid), eq(dcs.status, "DISPONIBLE")),
                            });
                            if (remainingSlots.length === 0) {
                                await tx.update(digitalCodes).set({ status: DigitalCodeStatus.VENDU }).where(eq(digitalCodes.id, pid as number));
                            }
                        }
                        continue; // item fully allocated via LoadBrain
                    } catch (err: any) {
                        if (err instanceof LbAllocError && err.code === "NO_LB_ACCOUNT") {
                            // Variant not migrated to LoadBrain → not centralized,
                            // so a local pick can't desync. Fall through to the
                            // EXISTING local code below (do NOT continue).
                            console.warn(`[stock-alloc][LB] item ${item.id} not on LoadBrain (NO_LB_ACCOUNT) → local pick`);
                        } else {
                            // OUT_OF_STOCK | LB_UNAVAILABLE | MIRROR_RESOLVE_FAILED:
                            // DO NOT local-pick (would double-sell a centralized
                            // slot). Degrade like the existing partial-stock path.
                            console.error(`[stock-alloc][LB] item ${item.id} ${err?.code ?? "ERROR"} → manual delivery`, err?.message);
                            hasManualDelivery = true;
                            continue;
                        }
                    }
                }

                const availableSlots = await tx.select({
                    id: digitalCodeSlots.id,
                    digitalCodeId: digitalCodeSlots.digitalCodeId,
                    slotNumber: digitalCodeSlots.slotNumber,
                    status: digitalCodeSlots.status,
                    digitalCode: {
                        id: digitalCodes.id,
                        code: digitalCodes.code,
                        status: digitalCodes.status,
                        variantId: digitalCodes.variantId
                    }
                })
                    .from(digitalCodeSlots)
                    .innerJoin(digitalCodes, eq(digitalCodes.id, digitalCodeSlots.digitalCodeId))
                    .where(and(
                        eq(digitalCodeSlots.status, DigitalCodeSlotStatus.DISPONIBLE),
                        eq(digitalCodes.variantId, item.variantId),
                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE)
                    ))
                    .orderBy(digitalCodeSlots.digitalCodeId, digitalCodeSlots.slotNumber)
                    .limit(item.quantity)
                    .for('update');

                if (availableSlots.length < item.quantity) {
                    console.log(`[STOCK] Stock partiel pour ${item.name} (${availableSlots.length}/${item.quantity}). Bascule en livraison manuelle.`);
                    hasManualDelivery = true;
                    // On ne fait rien : l'article sera traité manuellement par l'admin plus tard
                    continue;
                }

                currentItemSlots = availableSlots;
                const slotIds = availableSlots.map((s: any) => s.id);
                await tx.update(digitalCodeSlots)
                    .set({ status: DigitalCodeSlotStatus.VENDU, orderItemId: item.id })
                    .where(inArray(digitalCodeSlots.id, slotIds));

                // Mint the streaming activation deeplink token for each
                // assigned slot. Without this, the WhatsApp delivery message
                // would carry only email/password/PIN — no magic link — and
                // the customer would have to use the "reply CODE" fallback
                // every time Netflix asks for a household code. Mirrors what
                // attribuerSlotAutomatiqueAction does in /admin/comptes-partages.
                // Best-effort per slot: a single failure can't block the
                // whole order allocation.
                try {
                    const { createTokenForSlot } = await import("@/services/slot-activation-token.service");
                    const baseUrl =
                        process.env.NEXT_PUBLIC_APP_URL ||
                        process.env.PUBLIC_URL ||
                        "https://boutique.nexusbox.tech";
                    for (const slotId of slotIds) {
                        try {
                            const { token } = await createTokenForSlot(tx, slotId);
                            const activationUrl = `${baseUrl.replace(/\/$/, "")}/activer/${token}`;
                            await tx
                                .update(digitalCodeSlots)
                                .set({ activationUrl })
                                .where(eq(digitalCodeSlots.id, slotId));
                        } catch (err: any) {
                            console.error(
                                `[stock-alloc] activation token mint failed for slot ${slotId}:`,
                                err?.message,
                            );
                        }
                    }
                } catch (err: any) {
                    console.error("[stock-alloc] activation token service unavailable:", err?.message);
                }

                // Mark parent codes as VENDU if all slots are gone
                const parentCodeIds = Array.from(new Set(availableSlots.map((s: any) => s.digitalCodeId)));
                for (const pid of parentCodeIds) {
                    const remainingSlots = await tx.query.digitalCodeSlots.findMany({
                        where: (dcs: any, { and, eq }: any) => and(eq(dcs.digitalCodeId, pid), eq(dcs.status, "DISPONIBLE"))
                    });
                    if (remainingSlots.length === 0) {
                        await tx.update(digitalCodes).set({ status: DigitalCodeStatus.VENDU }).where(eq(digitalCodes.id, pid as number));
                    }
                }
            } else {
                const availableCodes = await tx.select()
                    .from(digitalCodes)
                    .where(and(
                        eq(digitalCodes.variantId, item.variantId),
                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE)
                    ))
                    .limit(item.quantity)
                    .for('update');

                if (availableCodes.length < item.quantity) {
                    console.log(`[STOCK] Stock partiel pour ${item.name} (${availableCodes.length}/${item.quantity}). Réservation des codes disponibles et bascule en manuel pour le complément.`);
                    hasManualDelivery = true;
                    // On ne continue PAS, on va quand même marquer les codes trouvés comme VENDU pour les réserver
                }

                if (availableCodes.length > 0) {
                    const codeIds = availableCodes.map((c: any) => (c as any).id);
                    await tx.update(digitalCodes)
                        .set({ status: DigitalCodeStatus.VENDU, orderItemId: item.id })
                        .where(inArray(digitalCodes.id, codeIds));

                    // Audit: Stock reservation
                    await logSecurityAction({
                        userId: options.userId || null,
                        action: availableCodes.length < item.quantity ? "PARTIAL_STOCK_RESERVATION" : "AUTO_STOCK_ALLOCATION",
                        entityType: "ORDER_ITEM",
                        entityId: item.id.toString(),
                        newData: { variantId: item.variantId, quantityRequested: item.quantity, quantityAllocated: availableCodes.length, codeIds }
                    });
                }
            }
        } else {
            hasManualDelivery = true;
        }

        // 2. Supplier Reconciliation (Debit)
        let supplierId = (options?.itemSuppliers as any)?.[item.id];
        let purchasePrice: string | null = null;
        let currency: string = "USD";

        // Check if cashier provided a manual override for this item's cost
        const priceOverride = (options?.itemPriceOverrides as any)?.[item.id.toString()];

        if (!supplierId) {
            const variantSuppliers = await tx.query.productVariantSuppliers.findFirst({
                where: (pvs: any, { eq }: any) => eq(pvs.variantId, item.variantId)
            });
            if (variantSuppliers) {
                supplierId = variantSuppliers.supplierId;
                purchasePrice = priceOverride?.price ?? variantSuppliers.purchasePrice;
                currency = priceOverride?.currency ?? variantSuppliers.currency;
            }
        } else {
            const link = await tx.query.productVariantSuppliers.findFirst({
                where: (pvs: any, { and, eq }: any) => and(eq(pvs.variantId, item.variantId), eq(pvs.supplierId, supplierId))
            });
            purchasePrice = priceOverride?.price ?? (link?.purchasePrice || null);
            currency = priceOverride?.currency ?? (link?.currency || "USD");
        }

        if (supplierId && (purchasePrice || priceOverride)) {
            const priceNum = parseFloat(purchasePrice || priceOverride?.price || "0");
            const supplier = await tx.query.suppliers.findFirst({
                where: (s: any, { eq }: any) => eq(s.id, supplierId)
            });

            if (supplier) {
                let amountToDebit = item.variant?.isSharing ? 0 : priceNum * item.quantity;

                if (item.variant?.isSharing) {
                    const uniqueParentIds = Array.from(new Set(currentItemSlots.map(s => s.digitalCodeId)));
                    for (const pid of uniqueParentIds) {
                        const parent = await tx.query.digitalCodes.findFirst({ where: eq(digitalCodes.id, pid as number) });
                        if (parent && !parent.isDebitCompleted) {
                            // If it's a sharing variant, priceNum is the account price (if not overridden)
                            // or the overridden account price.
                            amountToDebit += priceNum;
                            await tx.update(digitalCodes).set({ isDebitCompleted: true }).where(eq(digitalCodes.id, pid as number));
                        }
                    }
                }

                if (amountToDebit > 0) {
                    let cost = amountToDebit;
                    const debitCurrency = priceOverride?.currency ?? currency;
                    if (supplier.currency !== debitCurrency) {
                        if (supplier.currency === 'DZD' && debitCurrency === 'USD') cost *= EXCHANGE_RATE;
                        else if (supplier.currency === 'USD' && debitCurrency === 'DZD') cost /= EXCHANGE_RATE;
                    }

                    await tx.update(suppliers).set({ balance: sql`${suppliers.balance} - ${cost}` }).where(eq(suppliers.id, supplierId));
                    await tx.insert(supplierTransactions).values({
                        supplierId,
                        orderId,
                        type: SupplierTransactionType.ACHAT_STOCK,
                        amount: cost.toFixed(2),
                        currency: supplier.currency!,
                        reason: `Vente Automatique : ${item.name} (#${orderId}) (Prix Manuel: ${priceOverride ? 'OUI' : 'NON'})`
                    });

                    await logSecurityAction({
                        userId: options.userId || null,
                        action: "AUTO_SUPPLIER_DEBIT",
                        entityType: "SUPPLIER",
                        entityId: supplierId.toString(),
                        newData: { amount: cost, currency: supplier.currency, orderId, isManual: !!priceOverride }
                    });
                }

                // --- 📊 Persist historical cost for margin analytics ---
                let finalPurchasePrice = priceOverride?.price ?? purchasePrice;
                let finalPurchaseCurrency = priceOverride?.currency ?? currency;

                // If it's a sharing variant AND NO MANUAL OVERRIDE, calculate prorated cost per slot
                if (item.variant?.isSharing && currentItemSlots.length > 0 && !priceOverride) {
                    let totalProratedCost = 0;
                    for (const slot of currentItemSlots) {
                        const dcPrice = slot.digitalCode?.purchasePrice ? parseFloat(slot.digitalCode.purchasePrice) : priceNum;
                        const totalSlots = item.variant.totalSlots || 5;
                        totalProratedCost += (dcPrice / totalSlots);
                    }
                    finalPurchasePrice = (totalProratedCost / item.quantity).toFixed(2);
                    finalPurchaseCurrency = currentItemSlots[0].digitalCode?.purchaseCurrency || currency;
                }

                await tx.update(orderItems)
                    .set({
                        supplierId,
                        purchasePrice: finalPurchasePrice,
                        purchaseCurrency: finalPurchaseCurrency
                    })
                    .where(eq(orderItems.id, item.id));
            }
        }

        // 3. Trigger Stock Alerts
        await checkStockAndAlert(item.variantId);
    }

    // 4. Final Finalization: If no manual items, mark as TERMINE
    if (!hasManualDelivery) {
        await tx.update(orders)
            .set({ status: OrderStatus.TERMINE, isDelivered: true })
            .where(eq(orders.id, orderId));
    }

    return { hasManualDelivery };
}

/**
 * Utility to reverse supplier debits for a specific order or order item.
 * Typically called during refund or cancellation processes.
 *
 * Idempotence : avant l'EPIC 0 cette fonction pouvait double-rembourser un fournisseur
 * si elle était appelée deux fois pour la même order (ex: refund article puis refund total).
 * On vérifie maintenant qu'aucune RECHARGE de remboursement n'existe déjà pour la
 * combinaison (supplierId, orderId, type=RECHARGE) avec un reason marqueur "REVERSAL:".
 *
 * NOTE long-terme : ajouter une colonne `reversed_at` sur supplier_transactions et un
 * lien `reversed_by_id` est planifié en EPIC 1 (sortir du marqueur dans la string).
 */
const REVERSAL_MARKER = "REVERSAL:";

export async function reverseSupplierDebits(
    tx: Transaction,
    { orderId, orderItemId }: { orderId?: number, orderItemId?: number },
    reason: string = "Remboursement"
) {
    // supplier_transactions has NO orderItemId column, so a reversal can only be
    // scoped by orderId. Called with only orderItemId, the old code fell back to
    // matching EVERY ACHAT_STOCK row in the table — crediting every supplier.
    // Refuse instead (per-item supplier reversal is unsupported by the schema).
    if (!orderId) {
        if (orderItemId) {
            await logSecurityAction({
                userId: null,
                action: "SUPPLIER_REVERSAL_SKIPPED_UNSCOPED",
                entityType: "SUPPLIER",
                entityId: "0",
                newData: { orderItemId, reason },
            });
        }
        return;
    }

    // Determine which ACHAT_STOCK transactions belong to this order
    const relatedTransactions = await tx.query.supplierTransactions.findMany({
        where: (table: any, { and, eq }: any) => and(
            eq(table.type, SupplierTransactionType.ACHAT_STOCK),
            eq(table.orderId, orderId),
        ),
    });

    if (relatedTransactions.length === 0) return;

    // Idempotence : récupérer les RECHARGE déjà inscrites comme reversal pour cette order
    const existingReversals = orderId
        ? await tx.query.supplierTransactions.findMany({
            where: (table: any, { and, eq, like }: any) => and(
                eq(table.type, SupplierTransactionType.RECHARGE),
                eq(table.orderId, orderId),
                like(table.reason, `${REVERSAL_MARKER}%`)
            )
        })
        : [];

    // Indexe par supplierId pour O(1) check
    const reversedSupplierIds = new Set<number>(
        existingReversals.map((r: any) => r.supplierId)
    );

    // Séquentiel (pas Promise.all) : une transaction Drizzle = une seule
    // connexion, donc des requêtes concurrentes peuvent se télescoper. Le
    // séquencement rend aussi la dédup intra-boucle (reversedSupplierIds) fiable.
    for (const st of relatedTransactions) {
        // Skip si déjà reversé pour ce fournisseur
        if (reversedSupplierIds.has(st.supplierId)) {
            await logSecurityAction({
                userId: null,
                action: "SUPPLIER_REVERSAL_SKIPPED_DUPLICATE",
                entityType: "SUPPLIER",
                entityId: st.supplierId.toString(),
                newData: { orderId: st.orderId, reason, achatStockId: st.id }
            });
            continue; // skip THIS supplier only — not the whole reversal (was: return)
        }

        // 1. Credit supplier balance
        await tx.update(suppliers)
            .set({ balance: sql`${suppliers.balance} + ${sql.param(st.amount)}` })
            .where(eq(suppliers.id, st.supplierId));

        // 2. Insert RECHARGE (Refund) transaction — marquée avec REVERSAL: pour idempotence
        await tx.insert(supplierTransactions).values({
            supplierId: st.supplierId,
            orderId: st.orderId,
            type: SupplierTransactionType.RECHARGE,
            paymentStatus: "PAID",
            paidAt: new Date(),
            amount: st.amount,
            currency: st.currency,
            reason: `${REVERSAL_MARKER} ${reason} (#${st.orderId})`
        });

        // 3. Log security action
        await logSecurityAction({
            userId: null, // Systematic
            action: "SUPPLIER_BALANCE_REVERSAL",
            entityType: "SUPPLIER",
            entityId: st.supplierId.toString(),
            newData: { amount: st.amount, currency: st.currency, orderId: st.orderId, reason }
        });

        // Mémorise pour bloquer un autre ACHAT_STOCK du même fournisseur dans la même boucle
        reversedSupplierIds.add(st.supplierId);
    }
}

/**
 * Credits a reseller's wallet for a refund and traces it in reseller_transactions.
 *
 * `resellers` has NO balance column — the balance lives on `reseller_wallets`.
 * (The old approveReturn wrote `UPDATE resellers SET balance` against a column
 * that doesn't exist, which threw and rolled back the whole approval.)
 *
 * Locks the wallet row FOR UPDATE. No-op (returns false) if the reseller has no
 * wallet row — this is a deliberate contract: the sole caller (approveReturn in
 * caisse/actions.ts) treats `false` as a hard failure and throws to roll back
 * the whole return approval, forcing an admin to seed the wallet first rather
 * than silently auto-creating one (see refund-reseller-wallet.test.ts).
 * Reusable by every refund path (admin returns, IPTV/G2Bulk/BSV).
 */
export async function refundResellerWallet(
    tx: Transaction,
    { resellerId, montant, orderId, description }: {
        resellerId: number;
        montant: number;
        orderId: number;
        description?: string;
    }
): Promise<boolean> {
    const [wallet] = await tx
        .select({ id: resellerWallets.id })
        .from(resellerWallets)
        .where(eq(resellerWallets.resellerId, resellerId))
        .for("update");

    if (!wallet) return false;

    await tx.update(resellerWallets)
        .set({ balance: sql`${resellerWallets.balance} + ${montant}`, updatedAt: new Date() })
        .where(eq(resellerWallets.id, wallet.id));

    await tx.insert(resellerTransactions).values({
        walletId: wallet.id,
        type: "REFUND",
        amount: String(montant),
        orderId,
        description: description ?? `Remboursement Commande #${orderId}`,
        source: "LEGACY",
    });

    return true;
}
