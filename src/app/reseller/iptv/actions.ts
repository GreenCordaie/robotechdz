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
    orderItems,
    resellerWallets,
    resellerTransactions,
    productVariants,
    products,
    iptvProvisions,
    resellerIptvOrders,
} from "@/db/schema";
import { eq, sql, and, isNotNull, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { lbV2 } from "@/lib/loadbrain-v2";
import { TierService } from "@/services/tier.service";
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

function ensureSdk(): NonNullable<typeof lbV2> {
    if (!lbV2) {
        throw new Error("LoadBrain n'est pas configuré (LOADBRAIN_API_KEY manquant)");
    }
    return lbV2;
}

/**
 * Map a kiosk variant's `loadbrain_slug` to the IPTV provider that fulfils it.
 * The slug prefix is the contract — defined when the admin set up the variant.
 */
function providerFromSlug(slug: string): IptvProvider | null {
    if (slug.startsWith("ibo-")) return "ibosol";
    if (slug.startsWith("atlaspro-") || slug.startsWith("atlas-")) return "atlaspro";
    if (slug.startsWith("ironmax-") || slug.startsWith("iron-")) return "ironmax";
    // panelking365 owns both the canonical `panelking-*` and the legacy `iptv-*` slugs.
    if (slug.startsWith("panelking") || slug.startsWith("iptv-")) return "panelking365";
    return null;
}

interface LocalIptvVariant {
    readonly variantId: number;
    readonly productName: string;
    readonly variantName: string;
    readonly loadbrainSlug: string;
    readonly provider: IptvProvider;
    /** Reseller-effective price in DZD (override if set, else sale price). */
    readonly priceDzd: number;
}

/**
 * Source of truth for reseller-visible IPTV variants is the kiosk `product_variants`
 * table. We expose only rows with `loadbrain_slug` set, `reseller_visible = true`,
 * and where the slug maps to a known provider. Price comes from the local DB —
 * NEVER from the upstream LoadBrain catalogue.
 */
async function listLocalIptvVariants(filter?: {
    provider?: IptvProvider;
    slug?: string;
}): Promise<ReadonlyArray<LocalIptvVariant>> {
    const where = [
        isNotNull(productVariants.loadbrainSlug),
        eq(productVariants.resellerVisible, true),
    ];
    if (filter?.slug) {
        where.push(eq(productVariants.loadbrainSlug, filter.slug));
    }
    const rows = await db
        .select({
            variantId: productVariants.id,
            productName: products.name,
            variantName: productVariants.name,
            loadbrainSlug: productVariants.loadbrainSlug,
            salePriceDzd: productVariants.salePriceDzd,
            resellerOverrideDzd: productVariants.resellerPriceOverrideDzd,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(...where));

    return rows
        .map((r) => {
            const slug = r.loadbrainSlug ?? "";
            const provider = providerFromSlug(slug);
            if (!provider) return null;
            if (filter?.provider && provider !== filter.provider) return null;
            const overrideNum = r.resellerOverrideDzd
                ? parseFloat(r.resellerOverrideDzd)
                : NaN;
            const baseNum = parseFloat(r.salePriceDzd ?? "0");
            const effective = Number.isFinite(overrideNum) && overrideNum > 0
                ? overrideNum
                : baseNum;
            return {
                variantId: r.variantId,
                productName: r.productName,
                variantName: r.variantName,
                loadbrainSlug: slug,
                provider,
                priceDzd: effective,
            } satisfies LocalIptvVariant;
        })
        .filter((x): x is LocalIptvVariant => x !== null);
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
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const variants = await listLocalIptvVariants({ provider });
            const items = variants.map((v) => ({
                // Use the slug as productId because it is what LoadBrain accepts
                // on POST /provision/tasks. The variantId is also exposed for
                // local linkage at checkout time.
                id: v.loadbrainSlug,
                variantId: v.variantId,
                name: `${v.productName} — ${v.variantName}`,
                provider: v.provider,
                priceDzd: v.priceDzd,
            }));
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
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const [variant] = await listLocalIptvVariants({ slug: productId, provider });
            if (!variant) {
                return {
                    success: false as const,
                    error: "Produit IPTV introuvable ou non visible pour les revendeurs",
                };
            }
            return {
                success: true as const,
                data: {
                    id: variant.loadbrainSlug,
                    variantId: variant.variantId,
                    name: `${variant.productName} — ${variant.variantName}`,
                    provider: variant.provider,
                    priceDzd: variant.priceDzd,
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

            // Authoritative product = local kiosk variant. productId is the
            // loadbrain_slug. We re-resolve to enforce reseller visibility
            // and re-compute the price server-side.
            const [variant] = await listLocalIptvVariants({ slug: productId, provider });
            if (!variant) {
                return {
                    success: false as const,
                    error: "Produit IPTV introuvable ou non visible pour les revendeurs",
                };
            }
            const totalAmount = variant.priceDzd;
            if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
                return {
                    success: false as const,
                    error: "Prix IPTV invalide pour ce produit",
                };
            }
            const productRaw = {
                id: variant.loadbrainSlug,
                name: `${variant.productName} — ${variant.variantName}`,
                provider: variant.provider,
                variantId: variant.variantId,
            } as Record<string, unknown>;

            const orderNumber = `IPTV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            // Stage 1 — local debit + insert order_items + pending mirror row.
            // We MUST insert an order_items row because the kiosk's IPTV
            // provisioner (provisionIptvOrder, in @/lib/iptv) looks for
            // items with a `variant.loadbrainSlug` to know what to provision.
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
                        customerPhone: customerPhone ?? null,
                    })
                    .returning();

                await tx.insert(orderItems).values({
                    orderId: newOrder.id,
                    variantId: variant.variantId,
                    name: `${variant.productName} — ${variant.variantName}`,
                    price: totalAmount.toFixed(2),
                    quantity: 1,
                });

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

            // Stage 2 — provision via the SAME path the kiosk uses. The v2
            // gateway provision/tasks endpoint expects per-module schemas
            // the gateway doesn't translate (orderId, customerId, providerId,
            // planId, webhookUrl, webhookSecret all "Required"). The legacy
            // `provisionIptvOrder` walks variant.loadbrainSlug, builds the
            // right payload per provider, and inserts an `iptv_provisions`
            // row that the webhook handler already knows how to complete.
            try {
                const { provisionIptvOrder } = await import("@/lib/iptv");
                const provRes = await provisionIptvOrder(staged.localOrderId);
                // Link the first provisioning task id back into our mirror.
                if (provRes.taskIds && provRes.taskIds[0]) {
                    await attachLbIdentifiers(db, {
                        id: staged.iptvOrderId,
                        resellerId: reseller.id,
                        lbTaskId: provRes.taskIds[0],
                        lbOrderId: null,
                    });
                }
            } catch (lbErr) {
                console.error(
                    "[iptv:createIptvOrderAction] provisionIptvOrder failed",
                    lbErr,
                );
                await db
                    .update(resellerIptvOrders)
                    .set({
                        lastError: `Provisioning failed: ${stringifyError(lbErr)}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerIptvOrders.id, staged.iptvOrderId));
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
