"use server";

// BSV catalog source is intentionally disabled here (operator decision
// 2026-05-25): aggregator counts and landing cards only reflect G2Bulk
// until the operator curates a manual BSV product list. The
// `countBsvByBrand` function below is preserved (commented out at the
// callsite) for easy re-enabling.
// import { getBsvCatalogAction } from "./actions";
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

// BSV count function disabled — see top-of-file note. Restore the import
// and uncomment this block when BSV curated list is ready.
// async function countBsvByBrand(): Promise<Map<string, number>> {
//     const counts = new Map<string, number>();
//     for (let page = 1; page <= MAX_PROBE_PAGES; page++) {
//         const res = await getBsvCatalogAction({
//             page, limit: PROBE_LIMIT,
//             deliveryType: "all", sellerRankMin: "all", sortBy: "score",
//         });
//         if (!res?.success) break;
//         res.data.items.forEach((it) => {
//             const slug = toBrandSlug(it.product.brand || "other");
//             counts.set(slug, (counts.get(slug) ?? 0) + 1);
//         });
//         if (page >= res.data.pagination.totalPages) break;
//     }
//     return counts;
// }

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
            const slug = toBrandSlug(deriveG2BulkBrand(p));
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
    // BSV disabled — only G2Bulk feeds the landing counts. When BSV is
    // re-enabled, restore the parallel fetch and merge BSV counts into
    // `combined` below.
    const g2b = await countG2BulkByBrand().catch(
        () => new Map<string, number>(),
    );

    const seedSlugs = new Set(SEED_BRANDS.map((b) => b.slug));

    // Build cards for seed brands, in seed order (curated by volume), but
    // ONLY include brands that have ≥ 1 G2Bulk product visible right now.
    // This prevents empty placeholder cards from cluttering the landing.
    const merged: BrandCategory[] = SEED_BRANDS.map((b) => ({
        slug: b.slug,
        label: b.label,
        count: g2b.get(b.slug) ?? 0,
        imageUrl: artworkFor(b.slug),
        type: b.type,
    })).filter((c) => c.count > 0);

    // Surface brands G2Bulk added that aren't in our seed list yet, so the
    // operator notices the drift and updates SEED_BRANDS in code. Default
    // unknown brands to "giftcard" since most G2Bulk additions are regional
    // wallet credits — flip via SEED_BRANDS once classified.
    g2b.forEach((n, slug) => {
        if (!seedSlugs.has(slug) && slug && slug !== "other") {
            merged.push({
                slug,
                label: prettifyLabel(slug),
                count: n,
                imageUrl: artworkFor(slug),
                type: "giftcard",
            });
        }
    });

    return { success: true, data: merged };
}
