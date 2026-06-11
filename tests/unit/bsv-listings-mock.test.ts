import { describe, it, expect } from "vitest";
import {
    searchBsvListingsMock,
    getAllMockListings,
    createBsvOrderMock,
} from "@/lib/__mocks__/loadbrain-listings.mock";

describe("loadbrain-listings.mock (mock for Agent 1's SDK)", () => {
    it("returns ~30 listings total", () => {
        const all = getAllMockListings();
        expect(all.length).toBeGreaterThanOrEqual(20);
        expect(all.length).toBeLessThanOrEqual(40);
    });

    it("each listing has all required fields", () => {
        const all = getAllMockListings();
        for (const l of all) {
            expect(l.listingId).toBeTruthy();
            expect(l.product.sku).toBeTruthy();
            expect(l.product.brand).toBeTruthy();
            expect(l.product.category).toBeTruthy();
            expect(l.seller.slug).toBeTruthy();
            expect(typeof l.priceCents).toBe("number");
            expect(l.priceCents).toBeGreaterThan(0);
            expect(["auto", "manual"]).toContain(l.deliveryType);
        }
    });

    it("filters by brand", async () => {
        const res = await searchBsvListingsMock({ brand: "free-fire" });
        expect(res.success).toBe(true);
        expect(res.data.items.length).toBeGreaterThan(0);
        expect(res.data.items.every((l) => l.product.brand === "free-fire")).toBe(
            true
        );
    });

    it("filters by category", async () => {
        const res = await searchBsvListingsMock({ category: "streaming" });
        expect(
            res.data.items.every((l) => l.product.category === "streaming")
        ).toBe(true);
    });

    it("filters by deliveryType", async () => {
        const auto = await searchBsvListingsMock({ deliveryType: "auto" });
        expect(auto.data.items.every((l) => l.deliveryType === "auto")).toBe(true);

        const manual = await searchBsvListingsMock({ deliveryType: "manual" });
        expect(manual.data.items.every((l) => l.deliveryType === "manual")).toBe(
            true
        );
    });

    it("respects priceMin/Max in USD", async () => {
        const res = await searchBsvListingsMock({
            priceMinUsd: 5,
            priceMaxUsd: 50,
        });
        for (const l of res.data.items) {
            expect(l.priceCents).toBeGreaterThanOrEqual(500);
            expect(l.priceCents).toBeLessThanOrEqual(5000);
        }
    });

    it("substring search on q", async () => {
        const res = await searchBsvListingsMock({ q: "netflix" });
        expect(res.data.items.length).toBeGreaterThan(0);
        for (const l of res.data.items) {
            const hay = (
                l.product.displayName +
                " " +
                l.rawTitle
            ).toLowerCase();
            expect(hay).toContain("netflix");
        }
    });

    it("sorts by price asc when sortBy=price", async () => {
        const res = await searchBsvListingsMock({ sortBy: "price", limit: 48 });
        const prices = res.data.items.map((l) => l.priceCents);
        const sorted = [...prices].sort((a, b) => a - b);
        expect(prices).toEqual(sorted);
    });

    it("paginates", async () => {
        const p1 = await searchBsvListingsMock({ page: 1, limit: 5 });
        const p2 = await searchBsvListingsMock({ page: 2, limit: 5 });
        expect(p1.data.items.length).toBe(5);
        expect(p1.data.pagination.page).toBe(1);
        expect(p2.data.pagination.page).toBe(2);
        const ids1 = new Set(p1.data.items.map((l) => l.listingId));
        for (const item of p2.data.items) {
            expect(ids1.has(item.listingId)).toBe(false);
        }
    });
});

describe("createBsvOrderMock", () => {
    it("returns a fake lbOrderId", async () => {
        const res = await createBsvOrderMock({
            listingId: "lst_000001",
            quantity: 2,
            externalOrderId: "TEST-1",
        });
        expect(res.success).toBe(true);
        expect(res.data.lbOrderId).toMatch(/^lb_/);
        expect(res.data.status).toBe("PENDING");
    });
});
