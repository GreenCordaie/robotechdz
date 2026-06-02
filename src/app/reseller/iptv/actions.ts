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
import { eq, sql, and, isNotNull, desc, inArray } from "drizzle-orm";
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
import { checkActionGuard } from "./rate-limit";
import {
    pickStr,
    extractScreen,
    isUpstreamCompleted,
    parsePlanDurationDays,
} from "@/lib/iptv-screen";

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
                    source: "IPTV",
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

/* ──────────────────────────────────────────────────────────────────────── */
/* Live lines (admin-panel style table)                                    */
/* ──────────────────────────────────────────────────────────────────────── */

/* Screen extraction + plan-duration helpers live in ./screen-extract (pure,
 * unit-tested) — imported above. */

/** Run an array of async producers with bounded concurrency. */
async function runWithConcurrency<T>(
    items: ReadonlyArray<() => Promise<T>>,
    limit: number,
): Promise<ReadonlyArray<PromiseSettledResult<T>>> {
    const results: PromiseSettledResult<T>[] = new Array(items.length);
    let cursor = 0;
    const workers: Promise<void>[] = [];
    const worker = async () => {
        while (true) {
            const idx = cursor++;
            if (idx >= items.length) return;
            try {
                results[idx] = { status: "fulfilled", value: await items[idx]() };
            } catch (err) {
                results[idx] = { status: "rejected", reason: err };
            }
        }
    };
    for (let i = 0; i < Math.min(limit, items.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

/**
 * Returns the reseller's IPTV lines merged with the LIVE LoadBrain task
 * payload (username, m3u url, epg url, fresh expiresAt). NEVER returns the
 * password — that goes through {@link getMyIptvLineCredentialsAction}.
 *
 * Filter: reseller_id (auth) + provider, status in (ACTIVE, FROZEN, EXPIRED,
 * PENDING_LOADBRAIN). Capped to the 200 most-recent rows so a noisy reseller
 * doesn't fan out into thousands of upstream calls.
 */
export const getMyIptvLinesLiveAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            provider: z.enum(PROVIDERS),
        }),
    },
    async ({ provider }, user) => {
        try {
            const sdk = ensureSdk();
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return {
                    success: false as const,
                    error: "Compte revendeur introuvable",
                };
            }
            const allowed: ReadonlyArray<IptvOrderStatus> = [
                "PENDING_LOADBRAIN",
                "ACTIVE",
                "FROZEN",
                "EXPIRED",
            ];
            const rows = await db
                .select()
                .from(resellerIptvOrders)
                .where(
                    and(
                        eq(resellerIptvOrders.resellerId, ctx.reseller.id),
                        eq(resellerIptvOrders.provider, provider),
                        inArray(resellerIptvOrders.status, allowed),
                    ),
                )
                .orderBy(desc(resellerIptvOrders.createdAt))
                .limit(200);

            const tasks = rows.map((row) => async () => {
                // Reseller checkout attaches lb_task_id (all providers incl.
                // panelking365/atlaspro); renew/order flows may carry lb_order_id
                // instead. Probe whichever this row holds so the live credentials
                // feed is never blank. Credentials come from the same
                // `credentials.screens[0]` shape regardless of provider.
                try {
                    if (row.lbTaskId) {
                        return await sdk.provision.tasks.get(row.lbTaskId);
                    }
                    if (row.lbOrderId) {
                        return await sdk.provision.orders.get(row.lbOrderId);
                    }
                    return null;
                } catch (err) {
                    console.warn(
                        `[iptv:getMyIptvLinesLiveAction] live fetch failed for line ${row.id} (task=${row.lbTaskId ?? "-"} order=${row.lbOrderId ?? "-"})`,
                        err,
                    );
                    return null;
                }
            });
            const settled = await runWithConcurrency(tasks, 8);

            // DISPLAY-ONLY mapping. Persisting the PENDING_LOADBRAIN → ACTIVE
            // transition (+ username/expiry) is owned by the in-process
            // reconciler (`iptv-reseller-reconciler.service.ts` via
            // instrumentation.ts, 60s) — see STATUS chef 20:10 zone split. Here
            // we only DERIVE the live values so the table is correct immediately
            // instead of waiting for the next 60s reconciler tick (the webhook
            // `processCompletedTask` never touches the reseller mirror).
            const items = rows.map((row, i) => {
                const r = settled[i];
                const upstream = r.status === "fulfilled" ? r.value : null;
                const screen = extractScreen(upstream);
                const upstreamCompleted = isUpstreamCompleted(
                    pickStr(upstream, ["status"]),
                );

                // Bug 1 (display) — show ACTIVE as soon as the upstream task
                // reports completion, rather than the stale PENDING_LOADBRAIN
                // the mirror still holds until the next 60s reconciler tick.
                //
                // Provider-agnostic flip: King365 / Atlas / IronMax / IBOSol
                // each return slightly different credentials shapes — King365
                // notably ships some plans without `screens[0].username` (only
                // a code / m3uUrl). Requiring `username` left King365 lines
                // stuck on "En attente" after delivery. Flip to ACTIVE on
                // upstream completion + ANY signal that credentials shipped
                // (username, m3u, code, or persisted expiresAt). Falls back
                // to the mirror status when upstream is still in flight.
                const hasDeliverySignal =
                    !!screen.username ||
                    !!screen.m3uUrl ||
                    !!screen.code ||
                    !!screen.expiresAt ||
                    !!row.upstreamLineId ||
                    !!row.providerAccountId;
                const effectiveStatus: IptvOrderStatus =
                    row.status === "PENDING_LOADBRAIN" &&
                    upstreamCompleted &&
                    hasDeliverySignal
                        ? "ACTIVE"
                        : (row.status as IptvOrderStatus);

                // Bug 3 (display) — username from the live screen (full value),
                // falling back to the mirror's stored account id.
                const username = screen.username ?? row.providerAccountId ?? null;

                const liveExpires = screen.expiresAt ? new Date(screen.expiresAt) : null;
                const liveExpiresDate =
                    liveExpires && !Number.isNaN(liveExpires.getTime())
                        ? liveExpires
                        : null;

                // Bug 4 (display) — trial lines come back with an empty upstream
                // expiry, and the 60s reconciler also leaves it null
                // (tryParse("") === null). Compute a display estimate from
                // created_at + plan duration. Display-only — never persisted.
                let displayExpires: Date | string | null = liveExpiresDate ?? row.expiresAt;
                if (!displayExpires && upstreamCompleted) {
                    const durationDays = parsePlanDurationDays(
                        row.productId,
                        row.productName,
                    );
                    if (durationDays) {
                        const base =
                            row.createdAt instanceof Date
                                ? row.createdAt
                                : new Date(row.createdAt);
                        if (!Number.isNaN(base.getTime())) {
                            displayExpires = new Date(
                                base.getTime() + durationDays * 24 * 60 * 60 * 1000,
                            );
                        }
                    }
                }

                return {
                    id: row.id,
                    displayId: row.upstreamLineId ?? String(row.id),
                    provider: row.provider,
                    status: effectiveStatus,
                    productName: row.productName,
                    username,
                    // SECURITY: never ship the password in the bulk endpoint
                    hasPassword: !!screen.password,
                    m3uUrl: screen.m3uUrl,
                    epgUrl: screen.epgUrl,
                    expiresAt: displayExpires
                        ? displayExpires instanceof Date
                            ? displayExpires.toISOString()
                            : displayExpires
                        : null,
                    customerLabel: row.customerLabel,
                    customerPhone: row.customerPhone,
                    notes: row.notes,
                    pricePaidDzd: row.pricePaidDzd,
                    createdAt:
                        row.createdAt instanceof Date
                            ? row.createdAt.toISOString()
                            : row.createdAt,
                    lbTaskId: row.lbTaskId,
                };
            });

            return {
                success: true as const,
                data: { items, total: items.length },
            };
        } catch (err) {
            console.error("[iptv:getMyIptvLinesLiveAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

/**
 * On-demand password reveal for ONE reseller-owned IPTV line. Kept separate
 * from the bulk action so the heavy list endpoint never carries secrets — the
 * client only fetches the password when the operator clicks the eye icon.
 */
export const getMyIptvLineCredentialsAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        try {
            const sdk = ensureSdk();
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx) {
                return {
                    success: false as const,
                    error: "Compte revendeur introuvable",
                };
            }
            const row = await getResellerIptvOrder(db, {
                id,
                resellerId: ctx.reseller.id,
            });
            if (!row) {
                return {
                    success: false as const,
                    error: "Ligne IPTV introuvable",
                };
            }
            // Probe the live payload (task OR order) — order-based providers
            // (atlaspro/panelking) may carry only lb_order_id.
            if (!row.lbTaskId && !row.lbOrderId) {
                return {
                    success: false as const,
                    error: "Aucun identifiant LoadBrain associé",
                };
            }
            const upstream = row.lbTaskId
                ? await sdk.provision.tasks.get(row.lbTaskId)
                : await sdk.provision.orders.get(row.lbOrderId!);
            const screen = extractScreen(upstream);
            return {
                success: true as const,
                data: {
                    username:
                        screen.username ?? row.providerAccountId ?? null,
                    password: screen.password,
                    m3uUrl: screen.m3uUrl,
                    epgUrl: screen.epgUrl,
                },
            };
        } catch (err) {
            console.error("[iptv:getMyIptvLineCredentialsAction]", err);
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

/* ──────────────────────────────────────────────────────────────────────── */
/* Direct LoadBrain v2 gateway helpers                                     */
/* ──────────────────────────────────────────────────────────────────────── */

/** Raw fetch against the LoadBrain v2 HTTP gateway. */
async function lbFetch(path: string, init?: RequestInit): Promise<unknown> {
    const base = process.env.LOADBRAIN_URL;
    const key = process.env.LOADBRAIN_API_KEY;
    if (!base || !key) throw new Error("LoadBrain n'est pas configuré");
    const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
            "X-API-Key": key,
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: { success?: boolean; data?: unknown; error?: unknown } | null = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    if (!res.ok || !json?.success) {
        const e = json?.error;
        const detail =
            typeof e === "string"
                ? e
                : e && typeof e === "object" && "message" in e
                  ? String((e as { message: unknown }).message)
                  : e
                    ? JSON.stringify(e)
                    : text
                      ? text.slice(0, 300)
                      : "(réponse vide)";
        throw new Error(`LoadBrain (HTTP ${res.status}): ${detail}`);
    }
    return json.data;
}

/** Load a mirror row strictly owned by the calling reseller. */
async function loadOwnedLine(resellerId: number, mirrorId: number) {
    const row = await db.query.resellerIptvOrders.findFirst({
        where: and(
            eq(resellerIptvOrders.id, mirrorId),
            eq(resellerIptvOrders.resellerId, resellerId),
        ),
    });
    if (!row) throw new Error("Ligne introuvable ou non autorisée");
    return row;
}

/* Capability cache (5 min TTL, module-level). */
const CAPABILITY_TTL_MS = 5 * 60 * 1000;
const CAPABILITY_CACHE = new Map<string, { actions: string[]; at: number }>();

export const getIptvCapabilitiesAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ provider: z.enum(PROVIDERS) }),
    },
    async ({ provider }) => {
        try {
            const cached = CAPABILITY_CACHE.get(provider);
            const now = Date.now();
            if (cached && now - cached.at < CAPABILITY_TTL_MS) {
                return { success: true as const, data: { actions: cached.actions } };
            }
            const data = await lbFetch(`/api/v2/iptv/capabilities/${provider}`);
            const actionsRaw = (data as { actions?: unknown })?.actions;
            const actions: string[] = Array.isArray(actionsRaw)
                ? actionsRaw.filter((x): x is string => typeof x === "string")
                : [];
            CAPABILITY_CACHE.set(provider, { actions, at: now });
            return { success: true as const, data: { actions } };
        } catch (err) {
            console.error("[iptv:getIptvCapabilitiesAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

export const getIptvLineEventsAction = withAuth(
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
            const row = await loadOwnedLine(ctx.reseller.id, id);
            const lbId = row.lbOrderId ?? row.lbTaskId;
            if (!lbId) {
                return { success: true as const, data: { events: [] } };
            }
            const data = await lbFetch(`/api/v2/iptv/orders/${encodeURIComponent(lbId)}/events`);
            const eventsRaw = Array.isArray(data)
                ? data
                : (data as { events?: unknown })?.events;
            const events = Array.isArray(eventsRaw) ? eventsRaw : [];
            return { success: true as const, data: { events } };
        } catch (err) {
            console.error("[iptv:getIptvLineEventsAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

/* ──────────────────────────────────────────────────────────────────────── */
/* Per-line mutations (gateway-backed)                                     */
/* ──────────────────────────────────────────────────────────────────────── */

interface OwnedLineCtx {
    readonly resellerId: number;
    readonly mirrorId: number;
    readonly provider: IptvProvider;
    readonly upstreamLineId: string;
    readonly row: Awaited<ReturnType<typeof loadOwnedLine>>;
}

/**
 * Common preamble: resolve reseller, load owned line, enforce rate-limit, and
 * extract `(provider, upstreamLineId)`. Returns a discriminated result so each
 * action can short-circuit with a typed error envelope.
 */
async function prepareLineAction(
    userId: number,
    mirrorId: number,
    actionName: string,
): Promise<
    | { ok: true; ctx: OwnedLineCtx }
    | { ok: false; error: string }
> {
    const ctx = await resolveResellerCtx(userId);
    if (!ctx) return { ok: false, error: "Compte revendeur introuvable" };
    const row = await loadOwnedLine(ctx.reseller.id, mirrorId);
    const guard = checkActionGuard(
        `${ctx.reseller.id}:${mirrorId}:${actionName}`,
    );
    if (!guard.ok) return { ok: false, error: guard.error };
    if (!row.upstreamLineId) {
        return { ok: false, error: "Ligne pas encore activée" };
    }
    return {
        ok: true,
        ctx: {
            resellerId: ctx.reseller.id,
            mirrorId,
            provider: row.provider as IptvProvider,
            upstreamLineId: row.upstreamLineId,
            row,
        },
    };
}

async function setLocalStatus(
    mirrorId: number,
    resellerId: number,
    status: IptvOrderStatus,
    extra?: Record<string, unknown>,
): Promise<void> {
    await db
        .update(resellerIptvOrders)
        .set({
            status,
            lastStatusAt: new Date(),
            updatedAt: new Date(),
            ...(extra ?? {}),
        })
        .where(
            and(
                eq(resellerIptvOrders.id, mirrorId),
                eq(resellerIptvOrders.resellerId, resellerId),
            ),
        );
}

function lineActionFactory(
    actionName: string,
    gatewaySegment: string,
    onSuccess?: (ctx: OwnedLineCtx) => Promise<void>,
) {
    return withAuth(
        {
            roles: [UserRole.RESELLER],
            schema: z.object({ id: z.number().int().positive() }),
        },
        async ({ id }, user) => {
            try {
                const pre = await prepareLineAction(user.id, id, actionName);
                if (!pre.ok) {
                    return { success: false as const, error: pre.error };
                }
                const { provider, upstreamLineId } = pre.ctx;
                const result = await lbFetch(
                    `/api/v2/iptv/lines/${provider}/${encodeURIComponent(upstreamLineId)}/${gatewaySegment}`,
                    { method: "POST" },
                );
                if (onSuccess) await onSuccess(pre.ctx);
                revalidatePath("/reseller/iptv");
                return { success: true as const, data: result };
            } catch (err) {
                console.error(`[iptv:${actionName}Action]`, err);
                return { success: false as const, error: stringifyError(err) };
            }
        },
    );
}

export const enableIptvLineAction = lineActionFactory(
    "enableIptvLine",
    "enable",
    async (ctx) => setLocalStatus(ctx.mirrorId, ctx.resellerId, "ACTIVE"),
);

export const disableIptvLineAction = lineActionFactory(
    "disableIptvLine",
    "disable",
    async (ctx) => setLocalStatus(ctx.mirrorId, ctx.resellerId, "FROZEN"),
);

export const deleteIptvLineAction = lineActionFactory(
    "deleteIptvLine",
    "delete",
    async (ctx) =>
        setLocalStatus(ctx.mirrorId, ctx.resellerId, "CANCELLED", {
            cancelledAt: new Date(),
        }),
);

export const kickIptvUserAction = lineActionFactory("kickIptvUser", "kick");

export const resetIptvCredentialsAction = lineActionFactory(
    "resetIptvCredentials",
    "reset-credentials",
);

export const lockIptvIspAction = lineActionFactory("lockIptvIsp", "lock-isp");

export const unlockIptvIspAction = lineActionFactory(
    "unlockIptvIsp",
    "unlock-isp",
);

export const resetIptvCountryAction = lineActionFactory(
    "resetIptvCountry",
    "reset-country",
);

/** Resolve a plan id from the mirror row's product snapshot. */
function resolvePlanIdFromRow(
    row: Awaited<ReturnType<typeof loadOwnedLine>>,
): string | null {
    const snap = row.productSnapshot as
        | { product?: { variantId?: unknown } }
        | null;
    const v = snap?.product?.variantId;
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return row.productId ?? null;
}

export const extendIptvLineAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            id: z.number().int().positive(),
            planId: z.string().min(1).max(200).optional(),
        }),
    },
    async ({ id, planId }, user) => {
        try {
            const pre = await prepareLineAction(user.id, id, "extendIptvLine");
            if (!pre.ok) {
                return { success: false as const, error: pre.error };
            }
            const { provider, upstreamLineId, row } = pre.ctx;
            const finalPlanId = planId ?? resolvePlanIdFromRow(row);
            if (!finalPlanId) {
                return {
                    success: false as const,
                    error: "Aucun plan disponible pour cette ligne",
                };
            }
            const result = await lbFetch(
                `/api/v2/iptv/lines/${provider}/${encodeURIComponent(upstreamLineId)}/extend`,
                {
                    method: "POST",
                    body: JSON.stringify({ planId: finalPlanId }),
                },
            );
            revalidatePath("/reseller/iptv");
            return { success: true as const, data: result };
        } catch (err) {
            console.error("[iptv:extendIptvLineAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

export const cancelIptvProvisioningAction = withAuth(
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
            const row = await loadOwnedLine(ctx.reseller.id, id);
            const guard = checkActionGuard(
                `${ctx.reseller.id}:${id}:cancelIptvProvisioning`,
            );
            if (!guard.ok) {
                return { success: false as const, error: guard.error };
            }
            const lbId = row.lbOrderId ?? row.lbTaskId;
            if (!lbId) {
                return {
                    success: false as const,
                    error: "Aucun task LoadBrain associé",
                };
            }
            const result = await lbFetch(
                `/api/v2/iptv/orders/${encodeURIComponent(lbId)}/cancel`,
                { method: "POST" },
            );
            await setLocalStatus(id, ctx.reseller.id, "CANCELLED", {
                cancelledAt: new Date(),
            });
            revalidatePath("/reseller/iptv");
            return { success: true as const, data: result };
        } catch (err) {
            console.error("[iptv:cancelIptvProvisioningAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

export const renewIptvLineAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        try {
            const ctx = await resolveResellerCtx(user.id);
            if (!ctx || !ctx.reseller.wallet) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const { reseller } = ctx;
            const row = await loadOwnedLine(reseller.id, id);
            const guard = checkActionGuard(
                `${reseller.id}:${id}:renewIptvLine`,
            );
            if (!guard.ok) {
                return { success: false as const, error: guard.error };
            }
            const slug = row.productId;
            const provider = row.provider as IptvProvider;
            const [variant] = await listLocalIptvVariants({
                slug,
                provider,
            });
            if (!variant) {
                return {
                    success: false as const,
                    error: "Produit IPTV introuvable ou non visible — renouvellement impossible",
                };
            }
            const totalAmount = variant.priceDzd;
            if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
                return {
                    success: false as const,
                    error: "Prix IPTV invalide pour ce produit",
                };
            }
            const orderNumber = `IPTV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const productRaw = {
                id: variant.loadbrainSlug,
                name: `${variant.productName} — ${variant.variantName}`,
                provider: variant.provider,
                variantId: variant.variantId,
            } as Record<string, unknown>;

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
                        customerPhone: row.customerPhone ?? null,
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
                    description: `IPTV ${provider} renew — ${orderNumber}`,
                    source: "IPTV",
                });
                const iptvOrderId = await insertPendingIptvOrder(tx, {
                    localOrderId: newOrder.id,
                    resellerId: reseller.id,
                    provider,
                    productId: slug,
                    productName: variant.productName,
                    productSnapshot: { product: productRaw, params: null },
                    quantity: 1,
                    pricePaidDzd: totalAmount,
                    customerLabel: row.customerLabel ?? null,
                    customerPhone: row.customerPhone ?? null,
                });
                return { localOrderId: newOrder.id, iptvOrderId };
            });

            // Trigger upstream renew. We prefer lbOrderId; fall back to lbTaskId.
            const lbId = row.lbOrderId ?? row.lbTaskId;
            if (!lbId) {
                return {
                    success: false as const,
                    error: "Aucun identifiant LoadBrain disponible pour le renouvellement",
                };
            }
            try {
                const renewRes = (await lbFetch(
                    `/api/v2/iptv/orders/${encodeURIComponent(lbId)}/renew`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            localOrderId: staged.localOrderId,
                            mirrorId: staged.iptvOrderId,
                        }),
                    },
                )) as { taskId?: unknown; orderId?: unknown } | null;
                const newTaskId =
                    renewRes && typeof renewRes.taskId === "string"
                        ? renewRes.taskId
                        : null;
                const newOrderId =
                    renewRes && typeof renewRes.orderId === "string"
                        ? renewRes.orderId
                        : null;
                if (newTaskId || newOrderId) {
                    await attachLbIdentifiers(db, {
                        id: staged.iptvOrderId,
                        resellerId: reseller.id,
                        lbTaskId: newTaskId,
                        lbOrderId: newOrderId,
                    });
                }
            } catch (lbErr) {
                console.error("[iptv:renewIptvLineAction] upstream renew failed", lbErr);
                await db
                    .update(resellerIptvOrders)
                    .set({
                        lastError: `Renew failed: ${stringifyError(lbErr)}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerIptvOrders.id, staged.iptvOrderId));
                return {
                    success: false as const,
                    error: `Renouvellement différé. Détail: ${stringifyError(lbErr)}`,
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
            console.error("[iptv:renewIptvLineAction]", err);
            return { success: false as const, error: stringifyError(err) };
        }
    },
);

/* ──────────────────────────────────────────────────────────────────────── */
/* Legacy cancel (SDK-backed) — kept for back-compat                       */
/* ──────────────────────────────────────────────────────────────────────── */

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
