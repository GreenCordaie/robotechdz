"use server";

/**
 * Manual Delivery — reseller-side server actions.
 *
 * The catalogue is curated by the chef in /admin/manual-products. Every
 * row is hand-fulfilled (no panel, no SDK), so the buy path simply
 * debits the wallet, persists a tracking row in PENDING_DELIVERY, and
 * surfaces the order in the chef's manual-orders queue.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
    manualOrders,
    manualProducts,
    orders,
    resellerTransactions,
    resellerWallets,
    resellers,
} from "@/db/schema";
import { getCurrentResellerAction } from "../../actions";
import { notifyLowBalanceAfterDebit } from "@/services/reseller-notifications.service";

export interface ManualProductRow {
    readonly id: number;
    readonly title: string;
    readonly description: string | null;
    readonly category: string | null;
    readonly priceDzd: number;
    readonly imageUrl: string | null;
}

export async function listManualProductsAction(): Promise<{
    ok: true;
    items: ReadonlyArray<ManualProductRow>;
}> {
    const rows = await db.query.manualProducts.findMany({
        where: eq(manualProducts.isActive, true),
        orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.title)],
    });
    return {
        ok: true,
        items: rows.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            category: r.category,
            priceDzd: Math.round(parseFloat(r.priceDzd)),
            imageUrl: r.imageUrl,
        })),
    };
}

export interface BuyManualInput {
    readonly productId: number;
    readonly customerPhone?: string;
    readonly customerNote?: string;
}

export async function purchaseManualProductAction(input: BuyManualInput): Promise<
    | { ok: true; orderId: number; orderNumber: string }
    | { ok: false; error: string }
> {
    const resellerRes = await getCurrentResellerAction({});
    if (!resellerRes.success || !resellerRes.data) {
        return { ok: false, error: "Reseller introuvable" };
    }
    const resellerData = resellerRes.data as {
        id: number;
        companyName: string;
        contactPhone: string | null;
    };
    const resellerId = resellerData.id;

    // Re-fetch the product server-side — never trust the client price.
    const product = await db.query.manualProducts.findFirst({
        where: and(eq(manualProducts.id, input.productId), eq(manualProducts.isActive, true)),
    });
    if (!product) {
        return { ok: false, error: "Produit introuvable ou désactivé" };
    }
    const priceDzd = parseFloat(product.priceDzd);
    if (!Number.isFinite(priceDzd) || priceDzd <= 0) {
        return { ok: false, error: "Prix invalide" };
    }

    const orderNumber = `MAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const customerPhone = input.customerPhone?.trim().slice(0, 50) || null;
    const customerNote = input.customerNote?.trim().slice(0, 500) || null;

    try {
        const res = await db.transaction(async (tx) => {
            const locked = await tx.query.resellers.findFirst({
                where: eq(resellers.id, resellerId),
                with: { wallet: true },
            });
            if (!locked || !locked.wallet) {
                throw new Error("Portefeuille introuvable");
            }
            const [lockedWallet] = await tx
                .select({ balance: resellerWallets.balance })
                .from(resellerWallets)
                .where(eq(resellerWallets.id, locked.wallet.id))
                .for("update");
            const balance = parseFloat(lockedWallet?.balance ?? "0");
            if (balance < priceDzd) {
                throw new Error("Solde insuffisant");
            }

            const [newOrder] = await tx
                .insert(orders)
                .values({
                    orderNumber,
                    status: "PAYE",
                    totalAmount: priceDzd.toFixed(2),
                    montantPaye: priceDzd.toFixed(2),
                    resteAPayer: "0",
                    resellerId,
                    source: "B2B_WEB",
                    deliveryMethod: "TICKET",
                    customerPhone,
                })
                .returning();

            await tx
                .update(resellerWallets)
                .set({
                    balance: sql`${resellerWallets.balance} - ${priceDzd}`,
                    totalSpent: sql`${resellerWallets.totalSpent} + ${priceDzd}`,
                    updatedAt: new Date(),
                })
                .where(eq(resellerWallets.id, locked.wallet.id));

            await tx.insert(resellerTransactions).values({
                walletId: locked.wallet.id,
                type: "PURCHASE",
                amount: priceDzd.toString(),
                orderId: newOrder.id,
                description: `Manual — ${product.title}`,
                source: "MANUAL",
            });

            await tx.insert(manualOrders).values({
                localOrderId: newOrder.id,
                resellerId,
                manualProductId: product.id,
                productTitleSnapshot: product.title,
                pricePaidDzd: priceDzd.toFixed(2),
                customerPhone,
                customerNote,
                status: "PENDING_DELIVERY",
            });

            return { id: newOrder.id, orderNumber };
        });

        // Low-balance alert (edge-triggered, opt-in via reseller threshold).
        // Fire-and-forget — must never block the buy flow.
        notifyLowBalanceAfterDebit(
            {
                id: resellerData.id,
                companyName: resellerData.companyName,
                contactPhone: resellerData.contactPhone,
            },
            priceDzd,
        ).catch(() => {});

        return { ok: true, orderId: res.id, orderNumber: res.orderNumber };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : "Erreur paiement",
        };
    }
}
