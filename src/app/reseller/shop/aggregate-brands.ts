"use server";

// BSV catalog source is intentionally disabled here (operator decision
// 2026-05-25): aggregator counts and landing cards only reflect G2Bulk
// until the operator curates a manual BSV product list. The
// `countBsvByBrand` function below is preserved (commented out at the
// callsite) for easy re-enabling.
// import { getBsvCatalogAction } from "./actions";
import { getCachedG2BulkCatalog } from "./g2bulk-catalog-cache";
import {
    SEED_BRANDS,
    artworkFor,
    deriveG2BulkBrand,
    prettifyLabel,
    toBrandSlug,
    type BrandCategory,
} from "./brand-utils";

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
    // One shared (cached) catalog read — no per-page upstream calls, no pricing.
    const products = await getCachedG2BulkCatalog();
    for (const p of products) {
        const slug = toBrandSlug(
            deriveG2BulkBrand({ title: p.title, categoryTitle: p.categoryTitle }),
        );
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
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
