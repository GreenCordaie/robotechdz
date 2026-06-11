/**
 * Stable BSV SKU-level catalog types.
 *
 * Source of truth: LoadBrain gateway `GET /api/v2/giftcards/catalog`
 * (cluster-level snapshot — see modules/giftcards internal/catalog.ts).
 * Each item is ONE `product_clusters` row: a (brand, faceValue, region)
 * grouping that aggregates pricing across all live seller listings. The
 * `sku` is opaque (`lb-prd-…`) and ordered against directly — LoadBrain
 * auto-falls-back across live member listings, so SKU orders never hit a
 * "listing no longer active" error the way a frozen listingId would.
 *
 * The SDK's `GiftCard` type is intentionally loose (`{ sku, name, [k]: unknown }`)
 * so it can absorb upstream additions without a version bump. We narrow it
 * here to the fields the gateway actually returns today.
 */

/** Raw catalog item as returned by `lbV2.giftcards.catalog.list(...)`. */
export interface RawBsvCatalogItem {
    sku: string;
    displayName: string;
    brand: string;
    category: string;
    faceValue: string;
    faceUnit: string;
    region: string;
    redemptionType: string | null;
    currency: string;
    minPriceCents: number;
    medianPriceCents: number;
    maxPriceCents: number;
    /** Already markup-applied (per-site) USD cents — the operator-facing cost. */
    salePriceCents: number;
    sellersCount: number;
    inStock: boolean;
}

/**
 * A catalog denomination enriched with the reseller's DZD price. This is the
 * unit the marketplace UI consumes (one row per cluster SKU). The upstream
 * supplier is never exposed — `brand`/`brandSlug` carry only the neutral
 * product brand, never a seller/vendor identity.
 */
export interface EnrichedBsvSkuItem {
    /** Opaque LoadBrain SKU — carried through cart → checkout. */
    sku: string;
    displayName: string;
    /** Neutral product brand (e.g. "Steam"), never a supplier. */
    brand: string;
    /** Stable slug for grid grouping (matches SEED_BRANDS / g2bulk slugs). */
    brandSlug: string;
    category: string;
    faceValue: string;
    faceUnit: string;
    /** Canonical region code (ISO-2 or GLOBAL). */
    region: string;
    sellersCount: number;
    inStock: boolean;
    /** USD→DZD priced via bsv-pricing.service (reseller tier + custom discount). */
    priceDzd: number;
    listPriceDzd: number;
    /** Cost basis in USD cents (from the catalog, post-site-markup). */
    salePriceCentsUsd: number;
}

/** Aggregated brand tile for the category grid (brand → denomination count). */
export interface BsvBrandCount {
    slug: string;
    label: string;
    category: string;
    count: number;
}
