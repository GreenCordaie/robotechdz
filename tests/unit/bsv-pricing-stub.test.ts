import { describe, it, expect } from "vitest";
import { bsvPricingService } from "@/services/__mocks__/bsv-pricing.service.stub";

describe("bsv-pricing.service.stub (mock for Agent 2)", () => {
    it("applies +15% markup then converts to DZD at 270/USD", async () => {
        const rate = await bsvPricingService.getUsdToDzdRate();
        expect(rate).toBe(270);

        const out = await bsvPricingService.computePrice(
            {
                priceCentsUsd: 100, // 1 USD
                category: "gaming",
                brand: "free-fire",
                sku: "test__SKU__GLOBAL",
            },
            {
                resellerId: 1,
                tierDiscountPct: 0,
                customDiscountPct: 0,
            }
        );

        // 1 USD * 1.15 markup * 270 = 310.5 → rounded to 311 (Math.round)
        expect(out.listPriceDzd).toBe(311);
        expect(out.finalPriceDzd).toBe(311);
        expect(out.markupPct).toBe(15);
        expect(out.discountPct).toBe(0);
        expect(out.conversionRate).toBe(270);
    });

    it("applies tier + custom discount on top of markup", async () => {
        const out = await bsvPricingService.computePrice(
            {
                priceCentsUsd: 1000, // 10 USD
                category: "streaming",
                brand: "netflix",
                sku: "x",
            },
            {
                resellerId: 42,
                tierDiscountPct: 10,
                customDiscountPct: 5,
            }
        );

        // list = 10 * 1.15 * 270 = 3105
        expect(out.listPriceDzd).toBe(3105);
        // final = list * (1 - 0.15) = 2639.25 → 2639
        expect(out.finalPriceDzd).toBe(2639);
        expect(out.discountPct).toBe(15);
    });

    it("clamps discount at 100%", async () => {
        const out = await bsvPricingService.computePrice(
            {
                priceCentsUsd: 100,
                category: "x",
                brand: "x",
                sku: "x",
            },
            { resellerId: 1, tierDiscountPct: 90, customDiscountPct: 50 }
        );
        expect(out.discountPct).toBe(100);
        expect(out.finalPriceDzd).toBe(0);
    });

    it("computeBulk handles 0, 1, and N inputs", async () => {
        const ctx = {
            resellerId: 1,
            tierDiscountPct: 0,
            customDiscountPct: 0,
        };
        await expect(bsvPricingService.computeBulk([], ctx)).resolves.toEqual(
            []
        );

        const one = await bsvPricingService.computeBulk(
            [
                {
                    priceCentsUsd: 200,
                    category: "x",
                    brand: "y",
                    sku: "z",
                },
            ],
            ctx
        );
        expect(one).toHaveLength(1);

        const many = await bsvPricingService.computeBulk(
            Array.from({ length: 5 }, () => ({
                priceCentsUsd: 100,
                category: "x",
                brand: "y",
                sku: "z",
            })),
            ctx
        );
        expect(many).toHaveLength(5);
        expect(many.every((p) => p.finalPriceDzd === many[0].finalPriceDzd)).toBe(
            true
        );
    });
});
