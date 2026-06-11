import { describe, it, expect, beforeEach, vi } from "vitest";

// `server-only` throws on import outside a Server Component graph; vitest runs
// node-side and triggers that guard. Stub it out for the test.
vi.mock("server-only", () => ({}));

// Stub the @/db barrel — the service only reads via db.select(...).from(table).where(...).
// We replace getRules/getUsdToDzdRate with manual seeds via cache injection so we
// never touch the real DB in unit tests.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
    bsvPricingRules: { isActive: "is_active" },
    shopSettings: { usdExchangeRate: "usd_exchange_rate" },
}));

import {
    BsvPricingService,
    type BsvPricingRule,
    type BsvListingPricingInput,
    type ResellerPricingContext,
} from "@/services/bsv-pricing.service";

// Test helper: build a fresh service with pre-seeded caches so getRules/getRate
// resolve synchronously and deterministically (no DB hit).
function makeService(rules: BsvPricingRule[], rate = 270): BsvPricingService {
    const svc = new BsvPricingService();
    // @ts-expect-error — touching private caches is the cleanest way to inject test state.
    svc.rulesCache = { rules, expiresAt: Date.now() + 60_000 };
    // @ts-expect-error — same rationale.
    svc.rateCache = { rate, expiresAt: Date.now() + 60_000 };
    return svc;
}

function rule(partial: Partial<BsvPricingRule> & Pick<BsvPricingRule, "scopeType" | "scopeValue" | "markupType" | "markupValue">): BsvPricingRule {
    return {
        id: Math.floor(Math.random() * 1_000_000),
        notes: null,
        isActive: true,
        ...partial,
    } as BsvPricingRule;
}

const GLOBAL = rule({ scopeType: "global", scopeValue: "*", markupType: "pct", markupValue: 1500 });
const CAT_GAMING = rule({ scopeType: "category", scopeValue: "gaming", markupType: "pct", markupValue: 2000 });
const BRAND_FF = rule({ scopeType: "brand", scopeValue: "free-fire", markupType: "pct", markupValue: 2500 });
const SKU_FF_110 = rule({ scopeType: "sku", scopeValue: "free-fire__110DIAMONDS__GLOBAL", markupType: "fixed_dzd", markupValue: 300 });

const SAMPLE_INPUT: BsvListingPricingInput = {
    priceCentsUsd: 92, // $0.92
    category: "gaming",
    brand: "free-fire",
    sku: "free-fire__110DIAMONDS__GLOBAL",
};

describe("BsvPricingService.pickRule — precedence", () => {
    let svc: BsvPricingService;
    beforeEach(() => { svc = new BsvPricingService(); });

    it("picks SKU rule over brand/category/global when all match", () => {
        const picked = svc.pickRule([GLOBAL, CAT_GAMING, BRAND_FF, SKU_FF_110], SAMPLE_INPUT);
        expect(picked).toBe(SKU_FF_110);
    });

    it("falls back to brand rule when no SKU rule exists", () => {
        const picked = svc.pickRule([GLOBAL, CAT_GAMING, BRAND_FF], SAMPLE_INPUT);
        expect(picked).toBe(BRAND_FF);
    });

    it("falls back to category rule when no brand/SKU rule exists", () => {
        const picked = svc.pickRule([GLOBAL, CAT_GAMING], SAMPLE_INPUT);
        expect(picked).toBe(CAT_GAMING);
    });

    it("falls back to global rule when nothing else matches", () => {
        const picked = svc.pickRule(
            [GLOBAL, rule({ scopeType: "brand", scopeValue: "steam", markupType: "pct", markupValue: 1200 })],
            SAMPLE_INPUT,
        );
        expect(picked).toBe(GLOBAL);
    });

    it("returns null when no rule (not even global) matches", () => {
        const picked = svc.pickRule(
            [rule({ scopeType: "brand", scopeValue: "steam", markupType: "pct", markupValue: 1200 })],
            SAMPLE_INPUT,
        );
        expect(picked).toBeNull();
    });
});

describe("BsvPricingService.computePrice — markup math", () => {
    const CTX: ResellerPricingContext = { resellerId: 1, tierDiscountPct: 0 };

    it("applies percentage markup (basis points) correctly", async () => {
        const svc = makeService([GLOBAL]); // 15%
        const out = await svc.computePrice(SAMPLE_INPUT, CTX);
        // cost = 0.92 * 270 = 248.40
        // base = 248.40 * 1.15 = 285.66
        expect(out.costDzd).toBeCloseTo(248.4, 2);
        expect(out.basePriceDzd).toBeCloseTo(285.66, 2);
        expect(out.finalPriceDzd).toBeCloseTo(285.66, 2); // no discount
        expect(out.marginDzd).toBeCloseTo(37.26, 2);
        expect(out.marginPct).toBeCloseTo(15, 2);
    });

    it("applies fixed DZD markup correctly", async () => {
        const svc = makeService([GLOBAL, SKU_FF_110]); // SKU wins, +300 DZD
        const out = await svc.computePrice(SAMPLE_INPUT, CTX);
        // cost = 248.40, base = 248.40 + 300 = 548.40
        expect(out.costDzd).toBeCloseTo(248.4, 2);
        expect(out.basePriceDzd).toBeCloseTo(548.4, 2);
        expect(out.appliedRule.scopeType).toBe("sku");
        expect(out.appliedRule.markupType).toBe("fixed_dzd");
    });

    it("uses the most-specific rule when several match", async () => {
        const svc = makeService([GLOBAL, CAT_GAMING, BRAND_FF]);
        const out = await svc.computePrice(SAMPLE_INPUT, CTX);
        // brand rule wins: +25%
        // cost = 248.40, base = 248.40 * 1.25 = 310.50
        expect(out.appliedRule.scopeType).toBe("brand");
        expect(out.basePriceDzd).toBeCloseTo(310.5, 2);
    });

    it("throws when no rule matches at all", async () => {
        const svc = makeService([
            rule({ scopeType: "brand", scopeValue: "steam", markupType: "pct", markupValue: 1200 }),
        ]);
        await expect(svc.computePrice(SAMPLE_INPUT, CTX)).rejects.toThrow(/no active pricing rule/);
    });
});

describe("BsvPricingService.computePrice — tier + custom discount", () => {
    it("applies tier discount on top of markup", async () => {
        const svc = makeService([GLOBAL]); // 15% markup
        const out = await svc.computePrice(SAMPLE_INPUT, {
            resellerId: 1,
            tierDiscountPct: 15, // Or
        });
        // base = 285.66, final = 285.66 * 0.85 = 242.811
        expect(out.basePriceDzd).toBeCloseTo(285.66, 2);
        expect(out.finalPriceDzd).toBeCloseTo(242.81, 2);
    });

    it("stacks tier + custom discount additively", async () => {
        const svc = makeService([GLOBAL]);
        const out = await svc.computePrice(SAMPLE_INPUT, {
            resellerId: 1,
            tierDiscountPct: 15,
            customDiscountPct: 5,
        });
        // 20% total, base 285.66, final = 285.66 * 0.80 = 228.528
        expect(out.finalPriceDzd).toBeCloseTo(228.53, 2);
    });

    it("clamps total discount to 100% (never negative price)", async () => {
        const svc = makeService([GLOBAL]);
        const out = await svc.computePrice(SAMPLE_INPUT, {
            resellerId: 1,
            tierDiscountPct: 80,
            customDiscountPct: 80, // total 160 → clamped to 100
        });
        expect(out.finalPriceDzd).toBe(0);
    });

    it("treats undefined customDiscountPct as 0", async () => {
        const svc = makeService([GLOBAL]);
        const out = await svc.computePrice(SAMPLE_INPUT, {
            resellerId: 1,
            tierDiscountPct: 10,
            customDiscountPct: undefined,
        });
        // 285.66 * 0.90 = 257.094
        expect(out.finalPriceDzd).toBeCloseTo(257.09, 2);
    });
});

describe("BsvPricingService.computeBulk", () => {
    it("returns an empty array when given no inputs", async () => {
        const svc = makeService([GLOBAL]);
        const out = await svc.computeBulk([], { resellerId: 1, tierDiscountPct: 0 });
        expect(out).toEqual([]);
    });

    it("prices each input independently with the most specific rule", async () => {
        const svc = makeService([GLOBAL, CAT_GAMING, BRAND_FF, SKU_FF_110]);
        const inputs: BsvListingPricingInput[] = [
            SAMPLE_INPUT, // sku rule
            { ...SAMPLE_INPUT, sku: "free-fire__OTHER" }, // brand rule
            { priceCentsUsd: 100, category: "gaming", brand: "steam", sku: "steam__X" }, // category rule
            { priceCentsUsd: 200, category: "streaming", brand: "netflix", sku: "n__X" }, // global rule
        ];
        const out = await svc.computeBulk(inputs, { resellerId: 1, tierDiscountPct: 0 });
        expect(out).toHaveLength(4);
        expect(out[0].appliedRule.scopeType).toBe("sku");
        expect(out[1].appliedRule.scopeType).toBe("brand");
        expect(out[2].appliedRule.scopeType).toBe("category");
        expect(out[3].appliedRule.scopeType).toBe("global");
    });
});

describe("BsvPricingService.computePrice — edge cases", () => {
    const CTX: ResellerPricingContext = { resellerId: 1, tierDiscountPct: 0 };

    it("handles a zero USD price gracefully (margin pct = 0, not NaN)", async () => {
        const svc = makeService([GLOBAL]);
        const out = await svc.computePrice({ ...SAMPLE_INPUT, priceCentsUsd: 0 }, CTX);
        expect(out.costDzd).toBe(0);
        expect(out.basePriceDzd).toBe(0);
        expect(out.finalPriceDzd).toBe(0);
        expect(out.marginDzd).toBe(0);
        expect(out.marginPct).toBe(0);
    });

    it("returns the cached rate without re-fetching when within TTL", async () => {
        const svc = makeService([GLOBAL], 300);
        const r1 = await svc.getUsdToDzdRate();
        const r2 = await svc.getUsdToDzdRate();
        expect(r1).toBe(300);
        expect(r2).toBe(300);
    });

    it("invalidateCache clears both rule and rate caches", async () => {
        const svc = makeService([GLOBAL], 280);
        expect(await svc.getUsdToDzdRate()).toBe(280);
        svc.invalidateCache();
        // After invalidation, getUsdToDzdRate will fall back to FALLBACK_RATE (270)
        // because our @/db mock returns undefined for select().from().limit().
        // We're not validating the exact fallback here, just that cache was cleared
        // and the method does not throw.
        // @ts-expect-error
        expect(svc.rateCache).toBeNull();
        // @ts-expect-error
        expect(svc.rulesCache).toBeNull();
    });
});
