"use server";

import { getBsvCatalogAction } from "./actions";
import { getG2BulkCatalogAction } from "./g2bulk-shop-actions";
import {
    SEED_BRANDS,
    artworkFor,
    deriveG2BulkBrand,
    prettifyLabel,
    toBrandSlug,
    type BrandCategory,
} from "./brand-utils";

const PROBE_LIMIT = 48;
// Raised from 6 → 30 so the aggregator covers G2Bulk's full ~980-product catalog
// (30 × 48 = 1440 slots ≥ 980) and a meaningful slice of BSV's ~10 500 active
// listings (30 × 48 = 1440 ≈ 14% of BSV). For full BSV coverage on the landing,
// raise further or move counts to a server-side cache.
const MAX_PROBE_PAGES = 30;

/**
 * Walk a few catalog pages and accumulate per-brand counts. Bounded so we
 * never exhaust the upstream SDK on every landing render.
 */
async function countBsvByBrand(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (let page = 1; page <= MAX_PROBE_PAGES; page++) {
        const res = await getBsvCatalogAction({
            page,
            limit: PROBE_LIMIT,
            deliveryType: "all",
            sellerRankMin: "all",
            sortBy: "score",
        });
        if (!res?.success) break;
        res.data.items.forEach((it) => {
            const slug = toBrandSlug(it.product.brand || "other");
            counts.set(slug, (counts.get(slug) ?? 0) + 1);
        });
        if (page >= res.data.pagination.totalPages) break;
    }
    return counts;
}

async function countG2BulkByBrand(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (let page = 1; page <= MAX_PROBE_PAGES; page++) {
        const res = await getG2BulkCatalogAction({
            page,
            limit: PROBE_LIMIT,
            sortBy: "newest",
        });
        if (!res?.success) break;
        res.data.items.forEach((p) => {
            const slug = toBrandSlug(deriveG2BulkBrand(p.title));
            counts.set(slug, (counts.get(slug) ?? 0) + 1);
        });
        if (page >= res.data.pagination.totalPages) break;
    }
    return counts;
}

export async function getBrandCategoriesAction(): Promise<{
    success: true;
    data: ReadonlyArray<BrandCategory>;
}> {
    const [bsv, g2b] = await Promise.all([
        countBsvByBrand().catch(() => new Map<string, number>()),
        countG2BulkByBrand().catch(() => new Map<string, number>()),
    ]);

    const combined = new Map<string, number>();
    bsv.forEach((n, slug) => combined.set(slug, (combined.get(slug) ?? 0) + n));
    g2b.forEach((n, slug) => combined.set(slug, (combined.get(slug) ?? 0) + n));

    const seedSlugs = new Set(SEED_BRANDS.map((b) => b.slug));
    const merged: BrandCategory[] = SEED_BRANDS.map((b) => ({
        slug: b.slug,
        label: b.label,
        count: combined.get(b.slug) ?? 0,
        imageUrl: artworkFor(b.slug),
    }));

    // Surface unexpected brands so operators don't lose visibility when seeds
    // drift behind reality.
    combined.forEach((n, slug) => {
        if (!seedSlugs.has(slug) && slug && slug !== "other") {
            merged.push({
                slug,
                label: prettifyLabel(slug),
                count: n,
                imageUrl: artworkFor(slug),
            });
        }
    });

    return { success: true, data: merged };
}
