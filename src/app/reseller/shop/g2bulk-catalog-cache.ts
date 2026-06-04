import { lbV2 } from "@/lib/loadbrain-v2";
import { searchG2BulkProductsMock } from "@/lib/__mocks__/g2bulk-sdk.mock";

/**
 * In-process cache of the FULL G2Bulk catalog.
 *
 * WHY: the reseller landing and every brand page used to re-download the
 * entire ~980-product catalog from the upstream provider on each load — the
 * landing did up to 30 SEQUENTIAL upstream calls, the brand pages ~25. With no
 * cache that's seconds of spinner on every navigation.
 *
 * The RAW catalog (products, USD prices, stock, category) is identical for
 * every reseller, so we fetch it ONCE (all pages in parallel), cache it for a
 * short TTL, and let callers slice/price it cheaply per request. Stock is
 * therefore at most TTL_MS stale — an accepted trade-off for the speed win.
 *
 * Single app container → a module-level cache is shared across all requests.
 * Concurrent cold callers share one in-flight load (stampede guard).
 */

export interface RawG2BulkProduct {
    id: number;
    providerId: string;
    categoryId: number | null;
    categoryTitle: string | null;
    title: string;
    description: string | null;
    imageUrl: string | null;
    unitPriceCents: number;
    currency: string;
    stock: number;
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
    raw?: { category_title?: string } | null;
};

const PAGE_LIMIT = 48;
const MAX_PAGES = 30;
const TTL_MS = 5 * 60 * 1000;

let cache: { at: number; products: RawG2BulkProduct[] } | null = null;
let inflight: Promise<RawG2BulkProduct[]> | null = null;

async function fetchPage(page: number): Promise<{
    items: ReadonlyArray<ProviderProduct>;
    pagination: { totalPages: number };
}> {
    const params = { sortBy: "newest" as const, page, limit: PAGE_LIMIT };
    if (lbV2) {
        const sdkAny = lbV2 as unknown as {
            g2bulk?: {
                products?: {
                    search?: (p: unknown) => Promise<{
                        items: ReadonlyArray<ProviderProduct>;
                        pagination: { totalPages: number };
                    }>;
                };
            };
        };
        if (sdkAny.g2bulk?.products?.search) {
            return sdkAny.g2bulk.products.search(params);
        }
    }
    const mock = await searchG2BulkProductsMock(params);
    return {
        items: mock.items as ReadonlyArray<ProviderProduct>,
        pagination: mock.pagination,
    };
}

function normalize(p: ProviderProduct): RawG2BulkProduct {
    return {
        id: p.id,
        providerId: p.providerId,
        categoryId: p.categoryId,
        categoryTitle: p.raw?.category_title ?? null,
        title: p.title,
        description: p.description,
        imageUrl: p.imageUrl,
        unitPriceCents: p.unitPriceCents,
        currency: p.currency,
        stock: p.stock,
    };
}

async function loadAll(): Promise<RawG2BulkProduct[]> {
    // Page 1 first to learn totalPages, then the rest IN PARALLEL.
    const first = await fetchPage(1);
    const all: ProviderProduct[] = [...first.items];
    const lastPage = Math.min(first.pagination.totalPages, MAX_PAGES);
    if (lastPage > 1) {
        const rest = await Promise.all(
            Array.from({ length: lastPage - 1 }, (_, i) =>
                fetchPage(i + 2).catch(() => null),
            ),
        );
        for (const r of rest) {
            if (r) all.push(...r.items);
        }
    }
    return all.map(normalize);
}

/**
 * Full G2Bulk catalog, cached in-process for TTL_MS. Concurrent callers share
 * a single in-flight upstream load.
 */
export async function getCachedG2BulkCatalog(): Promise<RawG2BulkProduct[]> {
    const now = Date.now();
    if (cache && now - cache.at < TTL_MS) return cache.products;
    if (inflight) return inflight;
    inflight = loadAll()
        .then((products) => {
            cache = { at: Date.now(), products };
            inflight = null;
            return products;
        })
        .catch((err) => {
            inflight = null;
            throw err;
        });
    return inflight;
}
