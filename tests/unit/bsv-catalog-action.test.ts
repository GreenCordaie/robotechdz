import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests `getBsvCatalogAction` (Lot 3) by stubbing `withAuth` to a pass-through
 * and stubbing the DB + TierService dependencies. Verifies that the action
 * correctly enriches LoadBrain listings with DZD pricing, applies the
 * sellerRankMin filter, and supports re-sorting by final DZD price.
 */

vi.mock("server-only", () => ({}));

process.env.ENCRYPTION_KEY ||= "test_encryption_key_32_bytes_xxxxxxxxxx";

vi.mock("@/lib/security", () => ({
    withAuth: (_cfg: unknown, action: (input: unknown, user: unknown) => unknown) =>
        (input: unknown) =>
            action(input, { id: 1, role: "RESELLER", nom: "test" }),
}));

vi.mock("@/db", () => ({
    db: {
        query: {
            resellers: {
                findFirst: async () => ({
                    id: 5,
                    userId: 1,
                    customDiscount: null,
                }),
            },
        },
    },
}));

vi.mock("@/db/schema", () => ({
    resellers: { _tableName: "resellers" },
    products: {},
    productVariants: {},
    digitalCodes: {},
    digitalCodeSlots: {},
}));

vi.mock("drizzle-orm", () => ({
    eq: () => ({}),
    and: () => ({}),
    ilike: () => ({}),
    sql: Object.assign(
        (s: TemplateStringsArray) => ({ s }),
        { join: () => ({}) }
    ),
    desc: () => ({}),
    count: () => ({}),
}));

vi.mock("@/services/tier.service", () => ({
    TierService: {
        getCurrentTierForReseller: async () => ({
            name: "Or",
            color: "#FFD700",
            discountPct: "10",
        }),
    },
}));

describe("getBsvCatalogAction", () => {
    let getBsvCatalogAction: (input: unknown) => Promise<unknown>;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import("@/app/reseller/shop/actions");
        getBsvCatalogAction = mod.getBsvCatalogAction as unknown as (
            input: unknown
        ) => Promise<unknown>;
    });

    it("returns enriched listings with DZD pricing and pagination", async () => {
        const res = (await getBsvCatalogAction({
            page: 1,
            limit: 24,
        })) as {
            success: true;
            data: {
                items: Array<{
                    listingId: string;
                    pricing: {
                        finalPriceDzd: number;
                        listPriceDzd: number;
                        discountPct: number;
                    };
                }>;
                pagination: { page: number; total: number };
                pricing: { tierName: string | null; conversionRate: number };
            };
        };

        expect(res.success).toBe(true);
        expect(res.data.items.length).toBeGreaterThan(0);
        expect(res.data.pricing.tierName).toBe("Or");
        expect(res.data.pricing.conversionRate).toBe(270);

        for (const item of res.data.items) {
            expect(item.pricing.finalPriceDzd).toBeGreaterThan(0);
            expect(item.pricing.discountPct).toBe(10);
            // Or tier => 10% discount → final < list
            expect(item.pricing.finalPriceDzd).toBeLessThanOrEqual(
                item.pricing.listPriceDzd
            );
        }
    });

    it("sellerRankMin=L9 filters out lower-rank listings", async () => {
        const res = (await getBsvCatalogAction({
            sellerRankMin: "L9",
            page: 1,
            limit: 48,
        })) as {
            success: true;
            data: {
                items: Array<{ seller: { rank: string | null } }>;
            };
        };
        for (const item of res.data.items) {
            expect(item.seller.rank).toBe("L9");
        }
    });

    it("sortBy=price_desc re-sorts by final DZD price descending", async () => {
        const res = (await getBsvCatalogAction({
            sortBy: "price_desc",
            page: 1,
            limit: 48,
        })) as {
            success: true;
            data: {
                items: Array<{ pricing: { finalPriceDzd: number } }>;
            };
        };
        const prices = res.data.items.map((i) => i.pricing.finalPriceDzd);
        const sorted = [...prices].sort((a, b) => b - a);
        expect(prices).toEqual(sorted);
    });

    it("sortBy=price_asc re-sorts ascending", async () => {
        const res = (await getBsvCatalogAction({
            sortBy: "price_asc",
            page: 1,
            limit: 48,
        })) as {
            success: true;
            data: { items: Array<{ pricing: { finalPriceDzd: number } }> };
        };
        const prices = res.data.items.map((i) => i.pricing.finalPriceDzd);
        expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    it("returns success=false when reseller not found", async () => {
        vi.resetModules();
        vi.doMock("@/db", () => ({
            db: {
                query: {
                    resellers: { findFirst: async () => null },
                },
            },
        }));
        const mod = await import("@/app/reseller/shop/actions");
        const action = mod.getBsvCatalogAction as unknown as (
            i: unknown
        ) => Promise<{ success: boolean; error?: string }>;
        const res = await action({ page: 1, limit: 24 });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/revendeur/);
    });
});
