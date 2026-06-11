/**
 * MOCK — sample BSV listings stand-in for the real
 * `lbV2.giftcards.listings.search()` SDK method created by Agent 1 on
 * branch `feat/bsv-listings-api`.
 *
 * Shape follows brief 01-loadbrain-backend.md exactly. When Agent 1 merges,
 * swap calls in `src/app/reseller/shop/actions.ts` from
 *   import { searchBsvListingsMock } from "@/lib/__mocks__/loadbrain-listings.mock";
 *   const lbResp = await searchBsvListingsMock(params);
 * to
 *   import { lbV2 } from "@/lib/loadbrain-v2";
 *   const lbResp = await lbV2!.giftcards.listings.search(params);
 *
 * Generates ~30 listings with varied brands, ranks, prices, regions, and
 * delivery types so the UI can be exercised end-to-end.
 */
import type {
    BsvListing,
    BsvListingsSearchResponse,
    BsvSellerRank,
    BsvDeliveryType,
} from "@/types/bsv-listings";

interface SearchParams {
    q?: string;
    brand?: string;
    category?: string;
    region?: string;
    deliveryType?: "auto" | "manual" | "all";
    priceMinUsd?: number;
    priceMaxUsd?: number;
    sortBy?: "price" | "score" | "newest";
    page?: number;
    limit?: number;
}

const RANKS: BsvSellerRank[] = ["L4", "L5", "L6", "L7", "L8", "L9"];

const BRANDS = [
    { slug: "free-fire", display: "Free Fire", category: "gaming", units: "Diamonds" },
    { slug: "pubg-mobile", display: "PUBG Mobile", category: "gaming", units: "UC" },
    { slug: "netflix", display: "Netflix", category: "streaming", units: "USD" },
    { slug: "spotify", display: "Spotify", category: "streaming", units: "Months" },
    { slug: "amazon", display: "Amazon", category: "retail", units: "USD" },
    { slug: "steam", display: "Steam", category: "gaming", units: "USD" },
    { slug: "google-play", display: "Google Play", category: "mobile", units: "USD" },
    { slug: "itunes", display: "iTunes", category: "mobile", units: "USD" },
];

const FACE_VALUES_BY_BRAND: Record<string, string[]> = {
    "free-fire": ["110", "230", "520", "1080"],
    "pubg-mobile": ["60", "325", "660", "1800"],
    netflix: ["15", "25", "50"],
    spotify: ["1", "3", "6", "12"],
    amazon: ["10", "25", "50", "100"],
    steam: ["5", "10", "20", "50"],
    "google-play": ["10", "25", "50"],
    itunes: ["10", "25", "50"],
};

const REGIONS = ["GLOBAL", "MENA", "US", "EU", "TR"];

const SELLER_SLUGS = [
    "1vouchers1store0",
    "topgamingseller",
    "fastvouchershop",
    "globaldigital",
    "menacardspro",
    "instantcodes24",
    "elitevoucherstore",
    "digitalkingdom",
];

function priceFromFace(faceValue: string, brand: string): number {
    const fv = parseFloat(faceValue);
    // arbitrary but deterministic mapping from face → BSV price in cents
    if (brand === "free-fire" || brand === "pubg-mobile") {
        return Math.round(fv * 0.85); // diamonds/UC are sub-dollar
    }
    return Math.round(fv * 95); // gift cards trade close to face
}

function buildOneListing(index: number): BsvListing {
    const brand = BRANDS[index % BRANDS.length];
    const faces = FACE_VALUES_BY_BRAND[brand.slug];
    const faceValue = faces[index % faces.length];
    const region = REGIONS[index % REGIONS.length];
    const sellerSlug = SELLER_SLUGS[index % SELLER_SLUGS.length];
    const rank = RANKS[index % RANKS.length];
    const deliveryType: BsvDeliveryType = index % 5 === 0 ? "manual" : "auto";
    const priceCents = priceFromFace(faceValue, brand.slug);

    return {
        listingId: `lst_${String(index).padStart(6, "0")}`,
        upstreamKey: `upk_${String(index).padStart(8, "0")}`,
        encodedId: `enc_${String(index).padStart(6, "0")}`,
        product: {
            sku: `${brand.slug}__${faceValue}${brand.units.toUpperCase()}__${region}`,
            brand: brand.slug,
            category: brand.category,
            faceValue,
            faceUnit: brand.units.toUpperCase(),
            region,
            displayName: `${brand.display} ${faceValue} ${brand.units}`,
            imageUrl: null,
        },
        seller: {
            slug: sellerSlug,
            rank,
            positiveReviews: 120 + (index * 47) % 1800,
            negativeReviews: (index * 3) % 30,
        },
        priceCents,
        currency: "USD",
        deliveryType,
        isApi: false,
        stockQty: 10 + (index * 13) % 500,
        score: 50 + (index * 7) % 50,
        rawTitle: `${brand.display.toLowerCase()} ${faceValue} ${brand.units.toLowerCase()} code`,
    };
}

const ALL_LISTINGS: BsvListing[] = Array.from({ length: 32 }, (_, i) =>
    buildOneListing(i)
);

export function getAllMockListings(): BsvListing[] {
    return ALL_LISTINGS;
}

export async function searchBsvListingsMock(
    params: SearchParams
): Promise<BsvListingsSearchResponse> {
    let items = ALL_LISTINGS.slice();

    if (params.q) {
        const q = params.q.toLowerCase();
        items = items.filter(
            (l) =>
                l.product.displayName.toLowerCase().includes(q) ||
                (l.rawTitle ?? "").toLowerCase().includes(q)
        );
    }
    if (params.brand) {
        items = items.filter((l) => l.product.brand === params.brand);
    }
    if (params.category) {
        items = items.filter((l) => l.product.category === params.category);
    }
    if (params.region) {
        items = items.filter((l) => l.product.region === params.region);
    }
    if (params.deliveryType && params.deliveryType !== "all") {
        items = items.filter((l) => l.deliveryType === params.deliveryType);
    }
    if (typeof params.priceMinUsd === "number") {
        const minCents = params.priceMinUsd * 100;
        items = items.filter((l) => l.priceCents >= minCents);
    }
    if (typeof params.priceMaxUsd === "number") {
        const maxCents = params.priceMaxUsd * 100;
        items = items.filter((l) => l.priceCents <= maxCents);
    }

    if (params.sortBy === "price") {
        items.sort((a, b) => a.priceCents - b.priceCents);
    } else {
        // default: score desc then price asc
        items.sort((a, b) => b.score - a.score || a.priceCents - b.priceCents);
    }

    const page = params.page ?? 1;
    const limit = params.limit ?? 24;
    const total = items.length;
    const start = (page - 1) * limit;
    const pageItems = items.slice(start, start + limit);

    return {
        success: true,
        data: {
            items: pageItems,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        },
    };
}

/**
 * Mock for `lbV2.giftcards.orders.create({ listingId, quantity, externalOrderId })`.
 * Returns a fake LB order id so the checkout path can record it.
 */
export async function createBsvOrderMock(input: {
    listingId: string;
    quantity: number;
    externalOrderId: string;
}): Promise<{
    success: true;
    data: { lbOrderId: string; status: "PENDING" };
}> {
    return {
        success: true,
        data: {
            lbOrderId: `lb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
            status: "PENDING",
        },
    };
}
