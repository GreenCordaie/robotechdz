"use server";

// BSV catalog is re-enabled (2026-06-11): the brand grid now merges the
// stable BSV SKU catalog (cluster-level, via lbV2.giftcards.catalog.list)
// with the G2Bulk catalog. Both resolve to the SAME canonical brand slug
// (`toBrandSlug(brand)`), so a brand sold by both suppliers shows up as ONE
// unified tile — the upstream supplier stays fully hidden.
import { countBsvByBrand } from "./bsv-sku-catalog";
import { getCachedG2BulkCatalog } from "./g2bulk-catalog-cache";
import {
    SEED_BRANDS,
    artworkFor,
    deriveG2BulkBrand,
    prettifyLabel,
    toBrandSlug,
    type BrandCategory,
} from "./brand-utils";

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
    // Fetch both supplier catalogs in parallel. Either source failing degrades
    // gracefully to an empty map (the other still populates the grid).
    const [g2b, bsv] = await Promise.all([
        countG2BulkByBrand().catch(() => new Map<string, number>()),
        countBsvByBrand().catch(
            () =>
                new Map<
                    string,
                    { count: number; label: string; category: string }
                >(),
        ),
    ]);

    // Unified per-slug count = g2bulk products + BSV clusters for that brand.
    const totalFor = (slug: string): number =>
        (g2b.get(slug) ?? 0) + (bsv.get(slug)?.count ?? 0);

    const seedSlugs = new Set(SEED_BRANDS.map((b) => b.slug));

    // Build cards for seed brands, in seed order (curated by volume), but
    // ONLY include brands that have ≥ 1 live item across either supplier.
    const merged: BrandCategory[] = SEED_BRANDS.map((b) => ({
        slug: b.slug,
        label: b.label,
        count: totalFor(b.slug),
        imageUrl: artworkFor(b.slug),
        type: b.type,
    })).filter((c) => c.count > 0);

    // Surface non-seed brands from EITHER supplier so the operator notices
    // drift and can curate SEED_BRANDS. Default unknown brands to "giftcard"
    // (most additions are regional wallet credit). Dedupe across suppliers.
    const extraSlugs = new Set<string>();
    g2b.forEach((_n, slug) => extraSlugs.add(slug));
    bsv.forEach((_v, slug) => extraSlugs.add(slug));
    extraSlugs.forEach((slug) => {
        if (seedSlugs.has(slug) || !slug || slug === "other") return;
        merged.push({
            slug,
            label: bsv.get(slug)?.label ?? prettifyLabel(slug),
            count: totalFor(slug),
            imageUrl: artworkFor(slug),
            type: "giftcard",
        });
    });

    return { success: true, data: merged };
}
