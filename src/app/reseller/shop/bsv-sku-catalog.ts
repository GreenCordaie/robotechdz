"use server";

import { db } from "@/db";
import { resellers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { TierService } from "@/services/tier.service";
import { lbV2 } from "@/lib/loadbrain-v2";
import { bsvPricingService } from "@/services/bsv-pricing.service";
import { resolveRegion } from "./region-utils";
import { toBrandSlug, prettifyLabel } from "./brand-utils";
import type {
    RawBsvCatalogItem,
    EnrichedBsvSkuItem,
} from "@/types/bsv-sku-catalog";

/**
 * Stable BSV catalog action — organized by CATEGORY → BRAND → denomination.
 *
 * Wired to `lbV2.giftcards.catalog.list({ category })` (gateway
 * GET /api/v2/giftcards/catalog). Each returned item is a cluster (one
 * (brand, faceValue, region) grouping) with aggregated live pricing and an
 * opaque `sku` that the checkout orders against directly. This replaces the
 * volatile tracked-link source (which froze a specific seller listingId).
 *
 * SUPPLIER CONFIDENTIALITY: the payload exposes only the neutral product
 * brand. No seller slug / rank / vendor identity ever reaches the reseller.
 */

const SkuCatalogSchema = z.object({
    /** Optional cluster category filter — the only filter the gateway supports today. */
    category: z.string().min(1).max(64).optional(),
});

export const getBsvSkuCatalogAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: SkuCatalogSchema.optional(),
    },
    async (params, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
        });
        if (!reseller) {
            return { success: false as const, error: "Compte revendeur introuvable" };
        }
        if (!lbV2) {
            return {
                success: false as const,
                error: "LoadBrain non configuré (LOADBRAIN_API_KEY manquant)",
            };
        }

        const category = params?.category;

        // 1) Pull the stable cluster catalog (no pagination wrapper — array).
        let raw: ReadonlyArray<RawBsvCatalogItem>;
        try {
            const resp = await lbV2.giftcards.catalog.list(
                category ? { category } : undefined,
            );
            // SDK types `GiftCard` loosely; the gateway returns the richer
            // cluster shape. Narrow defensively (drop anything without a sku).
            // The gateway returns the cluster catalog as `{ items, mode }`, but
            // the SDK types it as a bare array. Accept either shape.
            const list = Array.isArray(resp)
                ? resp
                : ((resp as { items?: unknown[] } | null)?.items ?? []);
            raw = (list as ReadonlyArray<Partial<RawBsvCatalogItem>>)
                .filter((x): x is RawBsvCatalogItem => typeof x?.sku === "string");
        } catch (err) {
            return {
                success: false as const,
                error: `LoadBrain catalogue: ${(err as Error).message}`,
            };
        }

        // 2) Reseller pricing context (tier + custom discount, clamped).
        const tier = await TierService.getCurrentTierForReseller(reseller.id);
        const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
        const customDiscountPct = reseller.customDiscount
            ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscountPct)
            : 0;

        // 3) Price each cluster from its (already site-marked-up) salePriceCents.
        const pricingInputs = raw.map((it) => ({
            priceCentsUsd: it.salePriceCents,
            category: it.category,
            brand: it.brand,
            sku: it.sku,
        }));
        const prices = await bsvPricingService.computeBulk(pricingInputs, {
            resellerId: reseller.id,
            tierDiscountPct,
            customDiscountPct,
        });
        const totalDiscountPct = tierDiscountPct + customDiscountPct;

        // 4) Enrich + neutralize. Region is resolved canonically so the
        //    Denomination grid groups identically to the rest of the shop.
        const items: EnrichedBsvSkuItem[] = raw.map((it, i) => {
            const p = prices[i] as unknown as Record<string, number>;
            const listPriceDzd = p.listPriceDzd ?? p.basePriceDzd ?? 0;
            const finalPriceDzd = p.finalPriceDzd ?? listPriceDzd;
            return {
                sku: it.sku,
                displayName: it.displayName,
                brand: it.brand,
                brandSlug: toBrandSlug(it.brand || "other"),
                category: it.category,
                faceValue: it.faceValue,
                faceUnit: it.faceUnit,
                region:
                    resolveRegion(it.region, it.displayName) ?? "GLOBAL",
                sellersCount: it.sellersCount ?? 0,
                inStock: it.inStock !== false,
                priceDzd: finalPriceDzd,
                listPriceDzd,
                salePriceCentsUsd: it.salePriceCents,
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
                    totalDiscountPct,
                },
            },
        };
    },
);

/**
 * Brand-count aggregation over the BSV SKU catalog. Returns a slug→count map
 * keyed on the SAME canonical slug as g2bulk (`toBrandSlug(brand)`) so the
 * landing grid can merge BSV + g2bulk brand tiles. Pure server util — used by
 * aggregate-brands.ts. Returns an empty map on any failure (never throws).
 */
export async function countBsvByBrand(): Promise<
    Map<string, { count: number; label: string; category: string }>
> {
    const counts = new Map<string, { count: number; label: string; category: string }>();
    if (!lbV2) return counts;
    let raw: ReadonlyArray<Partial<RawBsvCatalogItem>>;
    try {
        const resp = await lbV2.giftcards.catalog.list();
        raw = (Array.isArray(resp)
            ? resp
            : ((resp as { items?: unknown[] } | null)?.items ?? [])) as ReadonlyArray<
            Partial<RawBsvCatalogItem>
        >;
    } catch {
        return counts;
    }
    for (const it of raw) {
        if (typeof it?.sku !== "string" || !it.brand) continue;
        const slug = toBrandSlug(it.brand);
        if (!slug || slug === "other") continue;
        const prev = counts.get(slug);
        counts.set(slug, {
            count: (prev?.count ?? 0) + 1,
            label: prev?.label ?? prettifyLabel(slug),
            category: prev?.category ?? (it.category ?? "giftcard"),
        });
    }
    return counts;
}
