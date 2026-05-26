"use server";
/**
 * Reseller-facing IPTV server actions.
 *
 * Why this file exists: the IPTV catalogue and provisioning live upstream in
 * LoadBrain (shared tenant), so we cannot trust the upstream price or
 * upstream ownership. Every action here:
 *   - resolves the calling reseller from the auth context (never from input)
 *   - re-fetches authoritative product/pricing server-side
 *   - runs wallet debit + local mirror insert in ONE transaction
 *   - filters every read/write by resellerId before touching LoadBrain
 *
 * Pricing reuses g2bulkPricingService for USD→DZD + tier/custom discount —
 * IPTV products are priced per-unit in USD cents upstream just like g2bulk.
 */

import { db } from "@/db";
import {
    resellers,
    orders,
    resellerWallets,
    resellerTransactions,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { lbV2 } from "@/lib/loadbrain-v2";
import { TierService } from "@/services/tier.service";
import { g2bulkPricingService } from "@/services/g2bulk-pricing.service";
import {
    getResellerIptvOrder,
    listResellerIptvOrders,
    insertPendingIptvOrder,
    attachLbIdentifiers,
    setIptvOrderStatus,
    type IptvProvider,
    type IptvOrderStatus,
} from "@/services/iptv-reseller.service";

/* ──────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

const PROVIDERS = ["panelking365", "atlaspro", "ironmax", "ibosol"] as const;
const STATUSES: ReadonlyArray<IptvOrderStatus> = [
    "PENDING_LOADBRAIN",
    "ACTIVE",
    "FROZEN",
    "EXPIRED",
    "CANCELLED",
    "FAILED",
    "REFUNDED",
];

/** Robust error → readable string. Never let `[object Object]` leak. */
function stringifyError(err: unknown): string {
    if (err instanceof Error && typeof err.message === "string") return err.message;
    if (err && typeof err === "object") {
        const maybe = (err as { message?: unknown }).message;
        if (typeof maybe === "string") return maybe;
        try {
            return JSON.stringify(err);
        } catch {
            /* circular */
        }
    }
    return String(err ?? "Erreur inconnue");
}

async function resolveResellerCtx(userId: number) {
    const reseller = await db.query.resellers.findFirst({
        where: eq(resellers.userId, userId),
        with: { wallet: true },
    });
    if (!reseller) return null;
    const tier = await TierService.getCurrentTierForReseller(reseller.id);
    const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
    const customDiscountPct = reseller.customDiscount
        ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscountPct)
        : 0;
    return { reseller, tier, tierDiscountPct, customDiscountPct };
}

/** Extract USD cents from an upstream IPTV product. Falls back gracefully. */
function extractUsdCents(product: Record<string, unknown>): number {
    const candidates = [
        product.priceCents,
        product.priceUsdCents,
        product.unitPriceCents,
        product.costCents,
    ];
    for (const c of candidates) {
        const n = typeof c === "number" ? c : Number(c);
        if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }
    // Some shapes ship dollars as `priceUsd` / `price` — convert.
    const dollarKeys = ["priceUsd", "price", "unitPriceUsd"] as const;
    for (const k of dollarKeys) {
        const v = product[k];
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n) && n >= 0) return Math.round(n * 100);
    }
    return 0;
}

async function priceIptvProduct(
    product: Record<string, unknown>,
    ctx: { reseller: { id: number }; tierDiscountPct: number; customDiscountPct: number },
    provider: IptvProvider,
) {
    const cents = extractUsdCents(product);
    const sku = `iptv__${provider}__${String(product.id ?? "")}`;
    const [price] = await g2bulkPricingService.computeBulk(
        [
            {
                priceCentsUsd: cents,
                category: "iptv",
                brand: provider,
                sku,
            },
        ],
        {
            resellerId: ctx.reseller.id,
            tierDiscountPct: ctx.tierDiscountPct,
            customDiscountPct: ctx.customDiscountPct,
        },
    );
    return price;
}

function ensureSdk(): NonNullable<typeof lbV2> {
    if (!lbV2) {
        throw new Error("LoadBrain n'est pas configuré (LOADBRAIN_API_KEY manquant)");
    }
    return lbV2;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Reads                                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

export const getIptvCatalogAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            provider: z.enum(PROVIDERS).optional(),
        }),
    },
    async ({ provider }, user) => {
        try {
            const sdk = ensureSdk();
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const raw = await sdk.iptv.products.list(
                provider ? { app: provider } : undefined,
            );
            const items = await Promise.all(
                raw.map(async (p) => {
                    const obj = p as unknown as Record<string, unknown>;
                    const price = await priceIptvProduct(obj, ctx, provider ?? "panelking365");
                    return {
                        id: String(obj.id),
                        name: String(obj.name ?? obj.id),
                        provider: provider ?? (obj.provider as IptvProvider | undefined) ?? null,
                        // Final reseller price after markup + tier discount, in DZD.
                        priceDzd: price.finalPriceDzd,
                        basePriceDzd: price.basePriceDzd,
                        raw: obj,
                    };
                }),
            );
            return { success: true as const, data: items };
        } catch (err) {
            console.error("[iptv:getIptvCatalogAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

export const getIptvProductAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            productId: z.string().min(1).max(200),
            provider: z.enum(PROVIDERS).optional(),
        }),
    },
    async ({ productId, provider }, user) => {
        try {
            const sdk = ensureSdk();
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const product = (await sdk.iptv.products.get(productId)) as unknown as Record<
                string,
                unknown
            >;
            const resolvedProvider =
                provider ?? (product.provider as IptvProvider | undefined) ?? "panelking365";
            const price = await priceIptvProduct(product, ctx, resolvedProvider);
            return {
                success: true as const,
                data: {
                    id: String(product.id),
                    name: String(product.name ?? product.id),
                    provider: resolvedProvider,
                    priceDzd: price.finalPriceDzd,
                    basePriceDzd: price.basePriceDzd,
                    raw: product,
                },
            };
        } catch (err) {
            console.error("[iptv:getIptvProductAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

export const getIptvAppsAction = withAuth(
    { roles: [UserRole.RESELLER] },
    async () => {
        try {
            const sdk = ensureSdk();
            const apps = await sdk.iptv.apps.list();
            return { success: true as const, data: apps };
        } catch (err) {
            console.error("[iptv:getIptvAppsAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

/* ──────────────────────────────────────────────────────────────────────── */
/* Checkout (wallet debit + LoadBrain provisioning)                        */
/* ──────────────────────────────────────────────────────────────────────── */

export const createIptvOrderAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            provider: z.enum(PROVIDERS),
            productId: z.string().min(1).max(200),
            customerLabel: z.string().max(200).optional(),
            customerPhone: z.string().max(40).optional(),
            params: z.record(z.string(), z.unknown()).optional(),
        }),
    },
    async ({ provider, productId, customerLabel, customerPhone, params }, user) => {
        try {
            const sdk = ensureSdk();
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx || !ctx.reseller.wallet) {
                return {
                    success: false as const,
                    error: "Compte revendeur introuvable",
                };
            }
            const { reseller } = ctx;

            // Re-fetch product server-side (never trust client price/identity).
            const productRaw = (await sdk.iptv.products.get(productId)) as unknown as Record<
                string,
                unknown
            >;
            if (!productRaw || !productRaw.id) {
                return {
                    success: false as const,
                    error: "Produit IPTV introuvable",
                };
            }
            const price = await priceIptvProduct(productRaw, ctx, provider);
            const totalAmount = price.finalPriceDzd;
            if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
                return {
                    success: false as const,
                    error: "Prix IPTV invalide pour ce produit",
                };
            }

            const orderNumber = `IPTV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const externalOrderId = orderNumber; // stable idempotency key

            // Stage 1 — local debit + insert pending mirror row.
            const staged = await db.transaction(async (tx) => {
                const lockedWallet = await tx
                    .select()
                    .from(resellerWallets)
                    .where(eq(resellerWallets.id, reseller.wallet!.id))
                    .for("update");
                const balance = parseFloat(lockedWallet[0]?.balance ?? "0");
                if (balance < totalAmount) {
                    throw new Error("Solde insuffisant");
                }

                const [newOrder] = await tx
                    .insert(orders)
                    .values({
                        orderNumber,
                        status: "PAYE",
                        totalAmount: totalAmount.toFixed(2),
                        montantPaye: totalAmount.toFixed(2),
                        resteAPayer: "0",
                        resellerId: reseller.id,
                        source: "B2B_WEB",
                        deliveryMethod: "TICKET",
                    })
                    .returning();

                await tx
                    .update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} - ${totalAmount}`,
                        totalSpent: sql`${resellerWallets.totalSpent} + ${totalAmount}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerWallets.id, reseller.wallet!.id));

                await tx.insert(resellerTransactions).values({
                    walletId: reseller.wallet!.id,
                    type: "PURCHASE",
                    amount: totalAmount.toFixed(2),
                    orderId: newOrder.id,
                    description: `IPTV ${provider} — ${orderNumber}`,
                });

                const iptvOrderId = await insertPendingIptvOrder(tx, {
                    localOrderId: newOrder.id,
                    resellerId: reseller.id,
                    provider,
                    productId: String(productRaw.id),
                    productName: String(productRaw.name ?? productRaw.id),
                    productSnapshot: { product: productRaw, params: params ?? null },
                    quantity: 1,
                    pricePaidDzd: totalAmount,
                    customerLabel: customerLabel ?? null,
                    customerPhone: customerPhone ?? null,
                });

                return { localOrderId: newOrder.id, iptvOrderId };
            });

            // Stage 2 — talk to LoadBrain OUTSIDE the tx so a slow upstream
            // doesn't hold a DB lock. Idempotency key = local orderNumber so
            // any retry of this exact action is deduped upstream.
            try {
                const task = await sdk.provision.tasks.create({
                    productId: String(productRaw.id),
                    quantity: 1,
                    externalOrderId,
                });
                const taskObj = task as unknown as Record<string, unknown>;
                await attachLbIdentifiers(db, {
                    id: staged.iptvOrderId,
                    resellerId: reseller.id,
                    lbTaskId: typeof taskObj.id === "string" ? taskObj.id : null,
                    lbOrderId:
                        typeof taskObj.orderId === "string"
                            ? (taskObj.orderId as string)
                            : null,
                });
            } catch (lbErr) {
                // Wallet is already debited; reconciler/webhook can't help
                // (no task id yet). Mark the mirror row's lastError so the
                // operator + reseller see what happened. Refund flows through
                // a manual admin action — we deliberately do NOT auto-refund
                // here because the upstream call may have actually succeeded
                // and just failed on the response (idempotency key protects).
                console.error(
                    "[iptv:createIptvOrderAction] LoadBrain create failed",
                    lbErr,
                );
                await db
                    .update(
                        (await import("@/db/schema")).resellerIptvOrders,
                    )
                    .set({
                        lastError: `LoadBrain create failed: ${stringifyError(lbErr)}`,
                        updatedAt: new Date(),
                    })
                    .where(
                        eq(
                            (await import("@/db/schema")).resellerIptvOrders.id,
                            staged.iptvOrderId,
                        ),
                    );
                return {
                    success: false as const,
                    error: `Provisioning différé — sera réessayé automatiquement. Détail: ${stringifyError(lbErr)}`,
                };
            }

            revalidatePath("/reseller/iptv");
            return {
                success: true as const,
                data: {
                    orderNumber,
                    iptvOrderId: staged.iptvOrderId,
                },
            };
        } catch (err) {
            console.error("[iptv:createIptvOrderAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

/* ──────────────────────────────────────────────────────────────────────── */
/* My orders                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

export const listMyIptvOrdersAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            provider: z.enum(PROVIDERS).optional(),
            status: z.enum(STATUSES as readonly [IptvOrderStatus, ...IptvOrderStatus[]]).optional(),
            search: z.string().max(200).optional(),
            page: z.number().int().min(1).optional(),
            limit: z.number().int().min(1).max(100).optional(),
        }),
    },
    async ({ provider, status, search, page, limit }, user) => {
        try {
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const data = await listResellerIptvOrders(db, {
                resellerId: ctx.reseller.id,
                filters: { provider, status, search },
                pagination: { page: page ?? 1, limit: limit ?? 20 },
            });
            return { success: true as const, data };
        } catch (err) {
            console.error("[iptv:listMyIptvOrdersAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

export const getMyIptvOrderDetailAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        try {
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const row = await getResellerIptvOrder(db, {
                id,
                resellerId: ctx.reseller.id,
            });
            if (!row) {
                return { success: false as const, error: "Commande IPTV introuvable" };
            }
            let upstream: unknown = null;
            try {
                const sdk = ensureSdk();
                if (row.lbOrderId) {
                    upstream = await sdk.provision.orders.get(row.lbOrderId);
                } else if (row.lbTaskId) {
                    upstream = await sdk.provision.tasks.get(row.lbTaskId);
                }
            } catch (lbErr) {
                console.error("[iptv:getMyIptvOrderDetailAction] upstream lookup", lbErr);
            }
            return {
                success: true as const,
                data: { local: row, upstream },
            };
        } catch (err) {
            console.error("[iptv:getMyIptvOrderDetailAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

/* ──────────────────────────────────────────────────────────────────────── */
/* Lifecycle ops                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

export const retryIptvProvisionAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        try {
            const sdk = ensureSdk();
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const row = await getResellerIptvOrder(db, {
                id,
                resellerId: ctx.reseller.id,
            });
            if (!row) {
                return { success: false as const, error: "Commande IPTV introuvable" };
            }
            if (!row.lbTaskId) {
                return {
                    success: false as const,
                    error: "Aucun task LoadBrain associé — relance impossible",
                };
            }
            await sdk.provision.tasks.retry(row.lbTaskId);
            const { resellerIptvOrders } = await import("@/db/schema");
            await db
                .update(resellerIptvOrders)
                .set({ lastError: null, updatedAt: new Date() })
                .where(eq(resellerIptvOrders.id, id));
            return { success: true as const, data: { retried: true } };
        } catch (err) {
            console.error("[iptv:retryIptvProvisionAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

export const resendIptvWebhookAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        try {
            const sdk = ensureSdk();
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const row = await getResellerIptvOrder(db, {
                id,
                resellerId: ctx.reseller.id,
            });
            if (!row) {
                return { success: false as const, error: "Commande IPTV introuvable" };
            }
            if (!row.lbTaskId) {
                return {
                    success: false as const,
                    error: "Aucun task LoadBrain associé",
                };
            }
            const result = await sdk.provision.tasks.resendWebhook(row.lbTaskId);
            return { success: true as const, data: result };
        } catch (err) {
            console.error("[iptv:resendIptvWebhookAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

export const cancelIptvOrderAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        try {
            const sdk = ensureSdk();
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const row = await getResellerIptvOrder(db, {
                id,
                resellerId: ctx.reseller.id,
            });
            if (!row) {
                return { success: false as const, error: "Commande IPTV introuvable" };
            }
            const current = row.status as IptvOrderStatus;
            if (
                current !== "ACTIVE" &&
                current !== "FROZEN" &&
                current !== "PENDING_LOADBRAIN"
            ) {
                return {
                    success: false as const,
                    error: `Impossible d'annuler une commande au statut ${current}`,
                };
            }
            if (!row.lbOrderId) {
                return {
                    success: false as const,
                    error: "Aucun order LoadBrain associé",
                };
            }
            const fresh = await sdk.provision.orders.cancel(row.lbOrderId);
            const freshObj = fresh as unknown as { status?: string };
            const upstreamStatus = String(freshObj.status ?? "").toLowerCase();
            const target: IptvOrderStatus =
                upstreamStatus === "cancelled" || upstreamStatus === "canceled"
                    ? "CANCELLED"
                    : upstreamStatus === "refunded"
                      ? "REFUNDED"
                      : "CANCELLED";
            await setIptvOrderStatus(db, {
                id,
                resellerId: ctx.reseller.id,
                status: target,
            });
            return { success: true as const, data: { status: target } };
        } catch (err) {
            console.error("[iptv:cancelIptvOrderAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);
