"use server";

import { db } from "@/db";
import {
    products,
    productVariants,
    digitalCodes,
    digitalCodeSlots,
    resellers,
} from "@/db/schema";
import { eq, and, ilike, sql, desc, count } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole, DigitalCodeStatus, DigitalCodeSlotStatus } from "@/lib/constants";
import { z } from "zod";
import { TierService } from "@/services/tier.service";

/**
 * Catalogue reseller : variants visibles aux revendeurs avec :
 *   - prix wholesale (resellerPriceOverrideDzd > salePriceDzd)
 *   - tier discount appliqué
 *   - stock disponible temps réel (count digitalCodes/digitalCodeSlots DISPONIBLE)
 *   - badge livraison : "auto" (LoadBrain), "stock" (codes en DB), "manual" (rien)
 *
 * Pagination + recherche + filtre catégorie. Pas de cache (stock temps réel).
 */
export const getResellerCatalogAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            page: z.number().int().min(1).default(1),
            limit: z.number().int().min(1).max(100).default(24),
            search: z.string().optional(),
            categoryId: z.number().int().optional(),
        }),
    },
    async (params, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
        });
        if (!reseller) {
            return { success: false as const, error: "Compte revendeur introuvable" };
        }

        const offset = (params.page - 1) * params.limit;

        // Conditions sur products + variants
        const productConditions = [eq(products.status, "ACTIVE")];
        if (params.search) {
            productConditions.push(ilike(products.name, `%${params.search}%`));
        }
        if (params.categoryId) {
            productConditions.push(eq(products.categoryId, params.categoryId));
        }

        // Récupère les products avec leurs variants visibles aux resellers
        const rows = await db
            .select({
                productId: products.id,
                productName: products.name,
                productImage: products.imageUrl,
                productDescription: products.description,
                isManualDelivery: products.isManualDelivery,
                requiresPlayerId: products.requiresPlayerId,
                categoryId: products.categoryId,
                variantId: productVariants.id,
                variantName: productVariants.name,
                salePriceDzd: productVariants.salePriceDzd,
                resellerPriceOverrideDzd: productVariants.resellerPriceOverrideDzd,
                isSharing: productVariants.isSharing,
                totalSlots: productVariants.totalSlots,
                loadbrainSlug: productVariants.loadbrainSlug,
            })
            .from(products)
            .innerJoin(productVariants, eq(productVariants.productId, products.id))
            .where(
                and(
                    ...productConditions,
                    eq(productVariants.resellerVisible, true)
                )
            )
            .orderBy(desc(products.id), productVariants.id)
            .limit(params.limit)
            .offset(offset);

        // Count pour pagination
        const [{ totalCount }] = await db
            .select({ totalCount: sql<number>`count(*)::int` })
            .from(products)
            .innerJoin(productVariants, eq(productVariants.productId, products.id))
            .where(
                and(
                    ...productConditions,
                    eq(productVariants.resellerVisible, true)
                )
            );

        // Calcule le stock disponible par variant (batch, 1 query)
        const variantIds = rows.map((r) => r.variantId);
        let stockByVariant = new Map<number, number>();

        if (variantIds.length > 0) {
            // Codes standards
            const standardStock = await db
                .select({
                    variantId: digitalCodes.variantId,
                    cnt: count(digitalCodes.id),
                })
                .from(digitalCodes)
                .where(
                    and(
                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE),
                        sql`${digitalCodes.variantId} IN (${sql.join(
                            variantIds.map((id) => sql`${id}`),
                            sql`, `
                        )})`
                    )
                )
                .groupBy(digitalCodes.variantId);

            for (const row of standardStock) {
                if (row.variantId !== null) {
                    stockByVariant.set(row.variantId, Number(row.cnt));
                }
            }

            // Slots (sharing variants) : count des slots DISPONIBLE dont parent est DISPONIBLE
            const slotStock = await db
                .select({
                    variantId: digitalCodes.variantId,
                    cnt: count(digitalCodeSlots.id),
                })
                .from(digitalCodeSlots)
                .innerJoin(digitalCodes, eq(digitalCodes.id, digitalCodeSlots.digitalCodeId))
                .where(
                    and(
                        eq(digitalCodeSlots.status, DigitalCodeSlotStatus.DISPONIBLE),
                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE),
                        sql`${digitalCodes.variantId} IN (${sql.join(
                            variantIds.map((id) => sql`${id}`),
                            sql`, `
                        )})`
                    )
                )
                .groupBy(digitalCodes.variantId);

            for (const row of slotStock) {
                if (row.variantId !== null) {
                    stockByVariant.set(row.variantId, Number(row.cnt));
                }
            }
        }

        // Tier discount (1 query mémoïsée 10min)
        const tier = await TierService.getCurrentTierForReseller(reseller.id);
        const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
        const customDiscountPct = reseller.customDiscount
            ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscountPct)
            : 0;
        const totalDiscountPct = tierDiscountPct + customDiscountPct;

        const items = rows.map((r) => {
            const basePrice = r.resellerPriceOverrideDzd
                ? parseFloat(r.resellerPriceOverrideDzd)
                : parseFloat(r.salePriceDzd);
            const finalPrice = basePrice * (1 - totalDiscountPct / 100);
            const stock = stockByVariant.get(r.variantId) ?? 0;
            // Badge livraison
            let deliveryType: "auto" | "stock" | "manual";
            if (r.loadbrainSlug) deliveryType = "auto";
            else if (stock > 0) deliveryType = "stock";
            else deliveryType = "manual";

            return {
                productId: r.productId,
                productName: r.productName,
                productImage: r.productImage,
                productDescription: r.productDescription,
                categoryId: r.categoryId,
                variantId: r.variantId,
                variantName: r.variantName,
                isSharing: !!r.isSharing,
                totalSlots: r.totalSlots,
                basePrice,
                finalPrice,
                discountPct: totalDiscountPct,
                stock,
                deliveryType,
                // loadbrainSlug intentionnellement omis — ne PAS leak au reseller
                // (utilisé en interne pour calculer deliveryType ci-dessus)
            };
        });

        return {
            success: true as const,
            data: {
                items,
                pagination: {
                    page: params.page,
                    limit: params.limit,
                    total: Number(totalCount),
                    totalPages: Math.ceil(Number(totalCount) / params.limit),
                },
                pricing: {
                    tierName: tier?.name ?? null,
                    tierColor: tier?.color ?? null,
                    tierDiscountPct,
                    customDiscountPct,
                    totalDiscountPct,
                },
            },
        };
    }
);

export interface ResellerCatalogItem {
    productId: number;
    productName: string;
    productImage: string | null;
    productDescription: string | null;
    categoryId: number | null;
    variantId: number;
    variantName: string;
    isSharing: boolean;
    totalSlots: number | null;
    basePrice: number;
    finalPrice: number;
    discountPct: number;
    stock: number;
    deliveryType: "auto" | "stock" | "manual";
}

export interface ResellerCatalogPricing {
    tierName: string | null;
    tierColor: string | null;
    tierDiscountPct: number;
    customDiscountPct: number;
    totalDiscountPct: number;
}

/* ----------------------------------------------------------------------
 * BSV Mirror Shop catalog action (Lot 3) — production wiring
 *
 * Wired against:
 *   - LoadBrain SDK v2 listings.search() — see @/lib/loadbrain-v2.ts
 *   - bsvPricingService — see @/services/bsv-pricing.service.ts
 *
 * (The historical __mocks__ stubs remain in the repo for local dev when
 * LoadBrain is unreachable. Swap back if needed.)
 * --------------------------------------------------------------------- */
import { lbV2 } from "@/lib/loadbrain-v2";
import { bsvPricingService } from "@/services/bsv-pricing.service";
import type {
    EnrichedBsvListing,
    BsvListingPricingInput,
    ResellerPricingContext,
} from "@/types/bsv-listings";

export const getBsvCatalogAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            q: z.string().optional(),
            brand: z.string().optional(),
            category: z.string().optional(),
            region: z.string().optional(),
            deliveryType: z.enum(["auto", "manual", "all"]).default("all"),
            sellerRankMin: z.enum(["all", "L4", "L7", "L9"]).default("all"),
            priceMinDzd: z.number().optional(),
            priceMaxDzd: z.number().optional(),
            sortBy: z
                .enum(["score", "price_asc", "price_desc", "newest"])
                .default("score"),
            page: z.number().int().min(1).default(1),
            limit: z.number().int().min(1).max(48).default(24),
        }),
    },
    async (params, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
        });
        if (!reseller) {
            return { success: false as const, error: "Compte revendeur introuvable" };
        }

        const tier = await TierService.getCurrentTierForReseller(reseller.id);
        const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
        const customDiscountPct = reseller.customDiscount
            ? Math.min(
                  parseFloat(reseller.customDiscount),
                  100 - tierDiscountPct
              )
            : 0;

        // Convert DZD price filters → USD using the SAME rate as the pricing
        // service, so the round-trip is consistent.
        const rate = await bsvPricingService.getUsdToDzdRate();
        const priceMinUsd =
            typeof params.priceMinDzd === "number"
                ? params.priceMinDzd / rate
                : undefined;
        const priceMaxUsd =
            typeof params.priceMaxDzd === "number"
                ? params.priceMaxDzd / rate
                : undefined;

        const sdkSort: "price" | "score" | "newest" =
            params.sortBy === "price_asc" || params.sortBy === "price_desc"
                ? "price"
                : params.sortBy === "newest"
                  ? "newest"
                  : "score";

        // Real LoadBrain SDK v2 call (Agent 1 merged). The SDK throws on
        // error and returns the unwrapped data directly — wrap to keep the
        // callsite's success/error contract for the React layer.
        if (!lbV2) {
            return {
                success: false as const,
                error: "LoadBrain non configuré (LOADBRAIN_API_KEY manquant)",
            };
        }
        let lbResp: Awaited<ReturnType<typeof lbV2.giftcards.listings.search>>;
        try {
            lbResp = await lbV2.giftcards.listings.search({
                q: params.q,
                brand: params.brand,
                category: params.category,
                region: params.region,
                deliveryType: params.deliveryType,
                priceMinUsd,
                priceMaxUsd,
                sortBy: sdkSort,
                page: params.page,
                limit: params.limit,
            });
        } catch (err) {
            return {
                success: false as const,
                error: `LoadBrain catalogue: ${(err as Error).message}`,
            };
        }

        const ctx: ResellerPricingContext = {
            resellerId: reseller.id,
            tierDiscountPct,
            customDiscountPct,
        };

        const pricingInputs: BsvListingPricingInput[] = lbResp.items.map(
            (l) => ({
                priceCentsUsd: l.priceCents,
                category: l.product.category,
                brand: l.product.brand,
                sku: l.product.sku,
            })
        );

        const servicePrices = await bsvPricingService.computeBulk(pricingInputs, ctx);

        // Adapter: the real service returns { costDzd, basePriceDzd, finalPriceDzd, ... },
        // the UI consumes { listPriceDzd, finalPriceDzd, discountPct, conversionRate }.
        // We bridge the two so the UI doesn't need to know about the service shape.
        const totalDiscountPct = tierDiscountPct + customDiscountPct;
        // Adapter tolerant of both shapes:
        //   Real Agent 2 service: { basePriceDzd, finalPriceDzd, conversionRate, ... }
        //   Legacy stub:          { listPriceDzd, finalPriceDzd, conversionRate, discountPct, markupPct, basePriceCentsUsd }
        // Tests still use the stub via vi.mock; prod uses the real service.
        const prices = servicePrices.map((p) => {
            const x = p as unknown as Record<string, number>;
            return {
                basePriceCentsUsd: x.basePriceCentsUsd ?? 0,
                markupPct: x.markupPct ?? 0,
                listPriceDzd: x.listPriceDzd ?? x.basePriceDzd ?? 0,
                finalPriceDzd: x.finalPriceDzd ?? 0,
                discountPct: x.discountPct ?? totalDiscountPct,
                conversionRate: x.conversionRate ?? 0,
            };
        });

        const RANKS = [
            "L1",
            "L2",
            "L3",
            "L4",
            "L5",
            "L6",
            "L7",
            "L8",
            "L9",
        ];

        let enriched: EnrichedBsvListing[] = lbResp.items.map((l, i) => ({
            ...l,
            pricing: prices[i],
        }));

        if (params.sellerRankMin !== "all") {
            const minIdx = RANKS.indexOf(params.sellerRankMin);
            enriched = enriched.filter((l) => {
                const lIdx = RANKS.indexOf(l.seller.rank ?? "L1");
                return lIdx >= minIdx;
            });
        }

        if (params.sortBy === "price_asc") {
            enriched.sort(
                (a, b) => a.pricing.finalPriceDzd - b.pricing.finalPriceDzd
            );
        } else if (params.sortBy === "price_desc") {
            enriched.sort(
                (a, b) => b.pricing.finalPriceDzd - a.pricing.finalPriceDzd
            );
        }

        return {
            success: true as const,
            data: {
                items: enriched,
                pagination: lbResp.pagination,
                pricing: {
                    tierName: tier?.name ?? null,
                    tierColor: tier?.color ?? null,
                    tierDiscountPct,
                    customDiscountPct,
                    conversionRate: rate,
                },
            },
        };
    }
);

export interface BsvCatalogPricingMeta {
    tierName: string | null;
    tierColor: string | null;
    tierDiscountPct: number;
    customDiscountPct: number;
    conversionRate: number;
}

/* ----------------------------------------------------------------------
 * Curated Marketplace (reseller-facing) — Phase 1
 *
 * Reads the operator's hand-tracked BSV products (giftcards.bsv_tracked_links
 * via the LoadBrain admin endpoint) and maps them to the EnrichedBsvListing
 * shape so the existing grid renders delivery type (auto/manual), seller, rank,
 * stock and a reseller DZD price. Replaces the live-search catalog source.
 * --------------------------------------------------------------------- */
interface TrackedLinkRow {
    id: string;
    bsvProductId: string;
    title: string | null;
    finalPriceCents: number | null;
    status: string;
    stockQty: number | null;
    sellerName: string | null;
    sellerRank: string | null;
    feedbackPos: number | null;
    feedbackNeg: number | null;
    deliveryType: string | null;
}

export const getMarketplaceTrackedAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({}).optional(),
    },
    async (_params, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
        });
        if (!reseller) {
            return { success: false as const, error: "Compte revendeur introuvable" };
        }

        const baseUrl = process.env.LOADBRAIN_URL;
        const token = process.env.LOADBRAIN_INTERNAL_TOKEN;
        if (!baseUrl || !token) {
            return { success: false as const, error: "LoadBrain non configuré" };
        }

        let rows: TrackedLinkRow[];
        try {
            const res = await fetch(
                `${baseUrl.replace(/\/$/, "")}/api/v1/giftcards/admin/bsv-tracker`,
                { headers: { "X-Internal-Token": token }, cache: "no-store" },
            );
            if (!res.ok) {
                return { success: false as const, error: `LoadBrain ${res.status}` };
            }
            const body = (await res.json()) as { data?: TrackedLinkRow[] };
            rows = body.data ?? [];
        } catch (err) {
            return { success: false as const, error: `LoadBrain: ${(err as Error).message}` };
        }

        // Only synced, sellable products (skip PENDING/REMOVED and unpriced).
        const sellable = rows.filter(
            (r) => r.finalPriceCents != null && r.status !== "REMOVED" && r.status !== "PENDING",
        );

        const { bsvPricingService } = await import("@/services/bsv-pricing.service");
        const tier = await TierService.getCurrentTierForReseller(reseller.id);
        const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
        const customDiscountPct = reseller.customDiscount
            ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscountPct)
            : 0;
        const ctx: ResellerPricingContext = {
            resellerId: reseller.id,
            tierDiscountPct,
            customDiscountPct,
        };

        const pricingInputs: BsvListingPricingInput[] = sellable.map((r) => ({
            priceCentsUsd: r.finalPriceCents ?? 0,
            category: "giftcard",
            brand: r.sellerName ?? "BSV",
            sku: r.bsvProductId,
        }));
        const servicePrices = await bsvPricingService.computeBulk(pricingInputs, ctx);
        const totalDiscountPct = tierDiscountPct + customDiscountPct;

        const items: EnrichedBsvListing[] = sellable.map((r, i) => {
            const x = servicePrices[i] as unknown as Record<string, number>;
            const pricing = {
                basePriceCentsUsd: x.basePriceCentsUsd ?? r.finalPriceCents ?? 0,
                markupPct: x.markupPct ?? 0,
                listPriceDzd: x.listPriceDzd ?? x.basePriceDzd ?? 0,
                finalPriceDzd: x.finalPriceDzd ?? 0,
                discountPct: x.discountPct ?? totalDiscountPct,
                conversionRate: x.conversionRate ?? 0,
            };
            const deliveryType: "auto" | "manual" =
                r.deliveryType === "auto" ? "auto" : "manual";
            // SUPPLIER CONFIDENTIALITY: never leak the BSV seller / supplier to
            // the reseller. The upstream vendor (Face2Face, BSV, G2Bulk…) and
            // its reputation stay admin-only — the reseller payload is fully
            // neutralised so it's untraceable even via the network/data.
            return {
                listingId: r.id,
                upstreamKey: r.id,
                encodedId: r.id,
                product: {
                    sku: r.id,
                    brand: "ROBOTECHDZ",
                    category: "giftcard",
                    faceValue: "",
                    faceUnit: "",
                    region: "GLOBAL",
                    displayName: r.title ?? "Produit",
                    imageUrl: null,
                },
                seller: {
                    slug: "",
                    rank: null,
                    positiveReviews: 0,
                    negativeReviews: 0,
                },
                priceCents: r.finalPriceCents ?? 0,
                currency: "USD",
                deliveryType,
                isApi: false,
                stockQty: r.stockQty ?? 0,
                score: 0,
                rawTitle: r.title ?? null,
                pricing,
            };
        });

        return {
            success: true as const,
            data: {
                items,
                pricing: {
                    tierName: tier?.name ?? null,
                    tierColor: tier?.color ?? null,
                    tierDiscountPct,
                    customDiscountPct,
                    conversionRate: items[0]?.pricing.conversionRate ?? 0,
                },
            },
        };
    },
);
