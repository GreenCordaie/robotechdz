/**
 * Shared types for BSV mirror shop (Lot 3).
 *
 * Mirrors the shape returned by LoadBrain SDK v2 `giftcards.listings.search()`
 * (see brief 01-loadbrain-backend.md). When Agent 1 merges, these types should
 * be re-exported from `@loadbrain/sdk-v2` instead.
 */

export type BsvDeliveryType = "auto" | "manual";
export type BsvSellerRank =
    | "L1"
    | "L2"
    | "L3"
    | "L4"
    | "L5"
    | "L6"
    | "L7"
    | "L8"
    | "L9";

export interface BsvListingProduct {
    sku: string;
    brand: string;
    category: string;
    faceValue: string;
    faceUnit: string;
    region: string;
    displayName: string;
    imageUrl: string | null;
}

export interface BsvListingSeller {
    slug: string;
    rank: BsvSellerRank | null;
    positiveReviews: number;
    negativeReviews: number;
}

export interface BsvListing {
    listingId: string;
    upstreamKey: string;
    encodedId: string;
    product: BsvListingProduct;
    seller: BsvListingSeller;
    priceCents: number;
    currency: "USD";
    deliveryType: BsvDeliveryType;
    isApi: boolean;
    stockQty: number;
    score: number;
    rawTitle: string;
}

export interface BsvListingsPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface BsvListingsSearchResponse {
    success: boolean;
    data: {
        items: BsvListing[];
        pagination: BsvListingsPagination;
    };
    error?: string;
}

/**
 * A listing enriched with the DZD pricing computed by bsv-pricing.service.
 * This is what the UI components consume.
 */
export interface EnrichedBsvListing extends BsvListing {
    pricing: ComputedPrice;
}

/**
 * Mirror of `bsv-pricing.service.ts` interfaces (Agent 2's territory).
 * Kept here as the SOURCE OF TRUTH for the contract until Agent 2 merges.
 * Once merged, swap imports to `@/services/bsv-pricing.service`.
 */
export interface BsvListingPricingInput {
    priceCentsUsd: number;
    category: string;
    brand: string;
    sku: string;
}

export interface ResellerPricingContext {
    resellerId: number;
    tierDiscountPct: number;
    customDiscountPct: number;
}

export interface ComputedPrice {
    /** Base USD price from BSV (cents). */
    basePriceCentsUsd: number;
    /** Mark-up applied (e.g. +15%) as percentage. */
    markupPct: number;
    /** Price in DZD before reseller discounts (smallest unit = DZD integer). */
    listPriceDzd: number;
    /** Final price in DZD after reseller tier + custom discount. */
    finalPriceDzd: number;
    /** Discount applied on top of list price as percentage. */
    discountPct: number;
    /** USD→DZD conversion rate used. */
    conversionRate: number;
}
