/**
 * MOCK — sample G2Bulk products + orders stand-in for the real
 * `lbV2.g2bulk.products.search()` / `lbV2.g2bulk.orders.create()` SDK methods.
 *
 * The real SDK methods already exist in @loadbrain/sdk-v2 (verified in
 * ../LoadBrain/packages/sdk-v2/src/client.ts), so this file is kept only for
 * LOCAL DEV when LoadBrain is unreachable (LOADBRAIN_API_KEY missing).
 *
 * SWAP WHEN sdk-v2 g2bulk methods are available locally:
 * change imports in `src/app/reseller/shop/g2bulk-shop-actions.ts` from
 *   import { searchG2BulkProductsMock, createG2BulkOrderMock, getG2BulkProductMock }
 *     from "@/lib/__mocks__/g2bulk-sdk.mock";
 * to
 *   import { lbV2 } from "@/lib/loadbrain-v2";
 *   // and call lbV2!.g2bulk.products.search(...), etc.
 *
 * Shape mirrors G2BulkProduct / G2BulkOrderInput / G2BulkOrderResponse types
 * in @loadbrain/sdk-v2 src/types.ts (lines 259-346).
 */

export interface G2BulkProductMock {
    id: number;
    providerId: string;
    categoryId: number | null;
    title: string;
    description: string | null;
    imageUrl: string | null;
    unitPriceCents: number;
    currency: string;
    stock: number;
    isActive: boolean;
}

export interface G2BulkProductListResponseMock {
    items: ReadonlyArray<G2BulkProductMock>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

interface SearchParams {
    q?: string;
    categoryId?: number;
    priceMaxCents?: number;
    sortBy?: "price_asc" | "price_desc" | "title" | "newest";
    page?: number;
    limit?: number;
}

// 10 hardcoded sample products covering the main brands from the catalog
// (Amazon JP/SA/UAE/USA/UK, Steam, iTunes, Free Fire, PSN). Prices are in
// USD cents and roughly track real G2Bulk wholesale levels.
const SAMPLE_PRODUCTS: G2BulkProductMock[] = [
    {
        id: 1001,
        providerId: "g2b_amz_jp_1000",
        categoryId: 10,
        title: "Amazon JP 1000 JPY Gift Card",
        description: "Carte cadeau Amazon Japon (livraison instantanée)",
        imageUrl: null,
        unitPriceCents: 680, // $6.80
        currency: "USD",
        stock: 250,
        isActive: true,
    },
    {
        id: 1002,
        providerId: "g2b_amz_sa_50",
        categoryId: 10,
        title: "Amazon SA 50 SAR Gift Card",
        description: "Carte cadeau Amazon Arabie Saoudite",
        imageUrl: null,
        unitPriceCents: 1320,
        currency: "USD",
        stock: 180,
        isActive: true,
    },
    {
        id: 1003,
        providerId: "g2b_amz_uae_50",
        categoryId: 10,
        title: "Amazon UAE 50 AED Gift Card",
        description: "Carte cadeau Amazon Émirats",
        imageUrl: null,
        unitPriceCents: 1350,
        currency: "USD",
        stock: 200,
        isActive: true,
    },
    {
        id: 1004,
        providerId: "g2b_amz_us_25",
        categoryId: 10,
        title: "Amazon US 25 USD Gift Card",
        description: "Amazon.com gift card",
        imageUrl: null,
        unitPriceCents: 2450,
        currency: "USD",
        stock: 500,
        isActive: true,
    },
    {
        id: 1005,
        providerId: "g2b_amz_uk_25",
        categoryId: 10,
        title: "Amazon UK 25 GBP Gift Card",
        description: "Amazon.co.uk gift card",
        imageUrl: null,
        unitPriceCents: 3200,
        currency: "USD",
        stock: 320,
        isActive: true,
    },
    {
        id: 2001,
        providerId: "g2b_steam_20",
        categoryId: 20,
        title: "Steam 20 USD Wallet Code",
        description: "Recharge Steam Wallet 20$",
        imageUrl: null,
        unitPriceCents: 1980,
        currency: "USD",
        stock: 1000,
        isActive: true,
    },
    {
        id: 3001,
        providerId: "g2b_itunes_us_25",
        categoryId: 30,
        title: "iTunes US 25 USD Gift Card",
        description: "Apple iTunes US",
        imageUrl: null,
        unitPriceCents: 2400,
        currency: "USD",
        stock: 600,
        isActive: true,
    },
    {
        id: 4001,
        providerId: "g2b_ff_310",
        categoryId: 40,
        title: "Free Fire 310 Diamonds",
        description: "Recharge Free Fire — 310 diamants",
        imageUrl: null,
        unitPriceCents: 285,
        currency: "USD",
        stock: 9999,
        isActive: true,
    },
    {
        id: 4002,
        providerId: "g2b_ff_1080",
        categoryId: 40,
        title: "Free Fire 1080 Diamonds",
        description: "Recharge Free Fire — 1080 diamants",
        imageUrl: null,
        unitPriceCents: 970,
        currency: "USD",
        stock: 9999,
        isActive: true,
    },
    {
        id: 5001,
        providerId: "g2b_psn_us_25",
        categoryId: 50,
        title: "PlayStation Network 25 USD (US)",
        description: "Recharge PSN US",
        imageUrl: null,
        unitPriceCents: 2450,
        currency: "USD",
        stock: 200,
        isActive: true,
    },
];

export function getAllMockG2BulkProducts(): G2BulkProductMock[] {
    return SAMPLE_PRODUCTS.slice();
}

export async function searchG2BulkProductsMock(
    params: SearchParams = {}
): Promise<G2BulkProductListResponseMock> {
    let items = SAMPLE_PRODUCTS.slice();

    if (params.q) {
        const q = params.q.toLowerCase();
        items = items.filter(
            (p) =>
                p.title.toLowerCase().includes(q) ||
                (p.description ?? "").toLowerCase().includes(q)
        );
    }
    if (typeof params.categoryId === "number") {
        items = items.filter((p) => p.categoryId === params.categoryId);
    }
    if (typeof params.priceMaxCents === "number") {
        items = items.filter((p) => p.unitPriceCents <= params.priceMaxCents!);
    }

    if (params.sortBy === "price_asc") {
        items.sort((a, b) => a.unitPriceCents - b.unitPriceCents);
    } else if (params.sortBy === "price_desc") {
        items.sort((a, b) => b.unitPriceCents - a.unitPriceCents);
    } else if (params.sortBy === "title") {
        items.sort((a, b) => a.title.localeCompare(b.title));
    }
    // 'newest' & default → keep insertion order

    const page = params.page ?? 1;
    const limit = params.limit ?? 24;
    const total = items.length;
    const start = (page - 1) * limit;
    const pageItems = items.slice(start, start + limit);

    return {
        items: pageItems,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

export async function getG2BulkProductMock(
    id: number
): Promise<{ product: G2BulkProductMock } | null> {
    const product = SAMPLE_PRODUCTS.find((p) => p.id === id);
    if (!product) return null;
    return { product };
}

export async function createG2BulkOrderMock(input: {
    productId: number;
    quantity: number;
    externalOrderId: string;
}): Promise<{
    orderId: string;
    status: "queued" | "processing" | "completed" | "failed" | "cancelled";
    isExisting: boolean;
    externalOrderId: string;
}> {
    return {
        orderId: `g2b_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        status: "queued",
        isExisting: false,
        externalOrderId: input.externalOrderId,
    };
}
