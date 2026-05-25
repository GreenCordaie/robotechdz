"use server";

import { db } from "@/db";
import { resellers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { TierService } from "@/services/tier.service";
import { lbV2 } from "@/lib/loadbrain-v2";
import {
    g2bulkPricingService,
    type G2BulkListingPricingInput,
    type ResellerPricingContext,
    type ComputedPrice,
} from "@/services/g2bulk-pricing.service";
import {
    searchG2BulkProductsMock,
    type G2BulkProductMock,
} from "@/lib/__mocks__/g2bulk-sdk.mock";

/* ----------------------------------------------------------------------
 * G2Bulk catalog action (Lot 5)
 *
 * Uses the real LoadBrain SDK v2 g2bulk methods when LOADBRAIN_API_KEY is
 * set. Falls back to the local mock catalog when the SDK is not available
 * (dev/CI without a LoadBrain instance).
 *
 * SWAP NOTE: the orchestrator's SDK-v2 g2bulk wiring agent confirms
 * lbV2.g2bulk.products.search() is available — when that is verified in
 * prod, the mock fallback can be removed. The import path that matters:
 *   `@/lib/__mocks__/g2bulk-sdk.mock` → mock (current fallback)
 *   `@/lib/loadbrain-v2`              → real SDK (preferred path)
 * --------------------------------------------------------------------- */

export interface EnrichedG2BulkProduct {
    productId: number;
    providerId: string;
    categoryId: number | null;
    /** G2Bulk's human label for the category (e.g. "Garena Free Fire Vouchers"). */
    categoryTitle: string | null;
    title: string;
    description: string | null;
    imageUrl: string | null;
    unitPriceCents: number;
    currency: string;
    stock: number;
    pricing: ComputedPrice;
}

export interface G2BulkCatalogPricingMeta {
    tierName: string | null;
    tierColor: string | null;
    tierDiscountPct: number;
    customDiscountPct: number;
    conversionRate: number;
}

/**
 * Derive a brand/category slug from a G2Bulk product. G2Bulk doesn't
 * expose a canonical brand field; we infer one from the title prefix so
 * the pricing service's brand-scope rules can match (e.g. "amazon",
 * "steam", "free-fire").
 */
function inferBrand(title: string): string {
    const t = title.toLowerCase();
    if (t.includes("amazon")) return "amazon";
    if (t.includes("steam")) return "steam";
    if (t.includes("itunes") || t.includes("apple")) return "itunes";
    if (t.includes("free fire")) return "free-fire";
    if (t.includes("pubg")) return "pubg-mobile";
    if (t.includes("playstation") || t.includes("psn")) return "psn";
    if (t.includes("xbox")) return "xbox";
    if (t.includes("google play")) return "google-play";
    if (t.includes("netflix")) return "netflix";
    if (t.includes("spotify")) return "spotify";
    return "other";
}

function inferCategory(categoryId: number | null, brand: string): string {
    // Numeric categoryId mappings (heuristic — admin can override via rules).
    if (categoryId === 10) return "retail";
    if (categoryId === 20) return "gaming";
    if (categoryId === 30) return "mobile";
    if (categoryId === 40) return "gaming";
    if (categoryId === 50) return "gaming";
    // Fallback from brand
    if (["steam", "free-fire", "pubg-mobile", "psn", "xbox"].includes(brand))
        return "gaming";
    if (["netflix", "spotify"].includes(brand)) return "streaming";
    if (["itunes", "google-play"].includes(brand)) return "mobile";
    return "retail";
}

type ProviderProduct = {
    id: number;
    providerId: string;
    categoryId: number | null;
    title: string;
    description: string | null;
    imageUrl: string | null;
    unitPriceCents: number;
    currency: string;
    stock: number;
    /** Upstream raw payload (Kinguin/G2Bulk-shaped). Contains `category_title`
     * which is the operator-friendly brand label (e.g. "Garena Free Fire
     * Vouchers"). Used by deriveG2BulkBrand to classify products whose title
     * only contains currency-style names like "1 USD Diamond(100+10)". */
    raw?: { category_title?: string } | null;
};

async function fetchG2BulkProducts(params: {
    q?: string;
    categoryId?: number;
    priceMaxCents?: number;
    sortBy?: "price_asc" | "price_desc" | "title" | "newest";
    page: number;
    limit: number;
}): Promise<{
    items: ReadonlyArray<ProviderProduct>;
    pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
    if (lbV2) {
        // Real SDK path. The SDK throws on failure; we let it bubble to the
        // action's try/catch.
        // SWAP WHEN sdk-v2 g2bulk methods land: this is already the prod path.
        const sdkAny = lbV2 as unknown as {
            g2bulk?: {
                products?: {
                    search?: (p: unknown) => Promise<{
                        items: ReadonlyArray<ProviderProduct>;
                        pagination: {
                            page: number;
                            limit: number;
                            total: number;
                            totalPages: number;
                        };
                    }>;
                };
            };
        };
        if (sdkAny.g2bulk?.products?.search) {
            return sdkAny.g2bulk.products.search(params) as Promise<{
                items: ReadonlyArray<ProviderProduct>;
                pagination: {
                    page: number;
                    limit: number;
                    total: number;
                    totalPages: number;
                };
            }>;
        }
    }
    // Mock fallback for dev/CI without LoadBrain configured.
    const mockResp = await searchG2BulkProductsMock(params);
    return {
        items: mockResp.items as ReadonlyArray<ProviderProduct>,
        pagination: mockResp.pagination,
    };
}

export const getG2BulkCatalogAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            q: z.string().optional(),
            categoryId: z.number().int().optional(),
            priceMaxDzd: z.number().optional(),
            sortBy: z.enum(["price_asc", "price_desc", "title", "newest"]).default("newest"),
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
            ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscountPct)
            : 0;

        const rate = await g2bulkPricingService.getUsdToDzdRate();
        const priceMaxCents =
            typeof params.priceMaxDzd === "number"
                ? Math.round((params.priceMaxDzd / rate) * 100)
                : undefined;

        let resp: Awaited<ReturnType<typeof fetchG2BulkProducts>>;
        try {
            resp = await fetchG2BulkProducts({
                q: params.q,
                categoryId: params.categoryId,
                priceMaxCents,
                sortBy: params.sortBy,
                page: params.page,
                limit: params.limit,
            });
        } catch (err) {
            return {
                success: false as const,
                error: `LoadBrain G2Bulk catalogue: ${(err as Error).message}`,
            };
        }

        const ctx: ResellerPricingContext = {
            resellerId: reseller.id,
            tierDiscountPct,
            customDiscountPct,
        };

        const pricingInputs: G2BulkListingPricingInput[] = resp.items.map((p) => {
            const brand = inferBrand(p.title);
            const category = inferCategory(p.categoryId, brand);
            return {
                priceCentsUsd: p.unitPriceCents,
                category,
                brand,
                sku: `g2b__${p.providerId}`,
            };
        });

        const prices = await g2bulkPricingService.computeBulk(pricingInputs, ctx);

        const enriched: EnrichedG2BulkProduct[] = resp.items.map((p, i) => ({
            productId: p.id,
            providerId: p.providerId,
            categoryId: p.categoryId,
            categoryTitle: p.raw?.category_title ?? null,
            title: p.title,
            description: p.description,
            imageUrl: p.imageUrl,
            unitPriceCents: p.unitPriceCents,
            currency: p.currency,
            stock: p.stock,
            pricing: prices[i],
        }));

        return {
            success: true as const,
            data: {
                items: enriched,
                pagination: resp.pagination,
                pricing: {
                    tierName: tier?.name ?? null,
                    tierColor: tier?.color ?? null,
                    tierDiscountPct,
                    customDiscountPct,
                    conversionRate: rate,
                } as G2BulkCatalogPricingMeta,
            },
        };
    }
);

export type G2BulkCatalogProduct = EnrichedG2BulkProduct;
