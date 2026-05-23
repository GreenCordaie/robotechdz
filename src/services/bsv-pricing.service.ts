import "server-only";
import { db } from "@/db";
import { bsvPricingRules, shopSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Public types — consumed by Lot 3 (BSV shop catalogue) and admin UI.
// ---------------------------------------------------------------------------

export type BsvScopeType = "global" | "category" | "brand" | "sku";
export type BsvMarkupType = "pct" | "fixed_dzd";

/** Internal pricing rule shape after normalization from DB row. */
export interface BsvPricingRule {
    id: number;
    scopeType: BsvScopeType;
    scopeValue: string;
    markupType: BsvMarkupType;
    /** For 'pct' this is BASIS POINTS (1500 = 15%). For 'fixed_dzd' this is absolute DZD. */
    markupValue: number;
    notes: string | null;
    isActive: boolean;
}

export interface BsvListingPricingInput {
    /** USD cents (e.g. 92 for $0.92). Never floats. */
    priceCentsUsd: number;
    /** Category slug (e.g. 'gaming'). */
    category: string;
    /** Brand slug (e.g. 'free-fire'). */
    brand: string;
    /** Canonical LoadBrain SKU (e.g. 'free-fire__110DIAMONDS__GLOBAL'). */
    sku: string;
}

export interface ResellerPricingContext {
    resellerId: number;
    /** Tier discount % (e.g. 15 for Or). */
    tierDiscountPct: number;
    /** Optional additional reseller-specific discount %. */
    customDiscountPct?: number;
}

export interface ComputedPrice {
    /** Cost in DZD (USD × rate). Rounded to 2 decimals. */
    costDzd: number;
    /** Public catalogue price (after markup, before tier discount). */
    basePriceDzd: number;
    /** Reseller-final price (after tier + custom discount). */
    finalPriceDzd: number;
    /** Gross margin = basePriceDzd - costDzd. */
    marginDzd: number;
    /** Margin % relative to cost. 0 when cost is 0. */
    marginPct: number;
    appliedRule: {
        id: number;
        scopeType: BsvScopeType;
        scopeValue: string;
        markupType: BsvMarkupType;
        markupValue: number;
    };
    conversionRate: number;
}

// ---------------------------------------------------------------------------
// Cache TTLs — rules change rarely, rate changes ~once a day.
// ---------------------------------------------------------------------------
const RULES_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const RATE_TTL_MS = 60 * 60 * 1000;       // 1 hour
const FALLBACK_RATE = 270;                // matches brief default if shopSettings unreachable

function normalizeRule(row: typeof bsvPricingRules.$inferSelect): BsvPricingRule {
    return {
        id: row.id,
        scopeType: row.scopeType as BsvScopeType,
        scopeValue: row.scopeValue,
        markupType: row.markupType as BsvMarkupType,
        markupValue: Number(row.markupValue),
        notes: row.notes,
        isActive: row.isActive,
    };
}

function round2(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

export class BsvPricingService {
    private rulesCache: { rules: BsvPricingRule[]; expiresAt: number } | null = null;
    private rateCache: { rate: number; expiresAt: number } | null = null;

    /** Invalidate all cached state. Call after admin CRUD or rate change. */
    invalidateCache(): void {
        this.rulesCache = null;
        this.rateCache = null;
    }

    /** Load all ACTIVE pricing rules. Cached for 5 min. */
    async getRules(): Promise<BsvPricingRule[]> {
        const now = Date.now();
        if (this.rulesCache && this.rulesCache.expiresAt > now) {
            return this.rulesCache.rules;
        }
        const rows = await db
            .select()
            .from(bsvPricingRules)
            .where(eq(bsvPricingRules.isActive, true));
        const rules = rows.map(normalizeRule);
        this.rulesCache = { rules, expiresAt: now + RULES_TTL_MS };
        return rules;
    }

    /** Load current USD→DZD rate from shop_settings.usd_exchange_rate. Cached for 1 h. */
    async getUsdToDzdRate(): Promise<number> {
        const now = Date.now();
        if (this.rateCache && this.rateCache.expiresAt > now) {
            return this.rateCache.rate;
        }
        try {
            const settings = await db.select({ rate: shopSettings.usdExchangeRate }).from(shopSettings).limit(1);
            const raw = settings[0]?.rate;
            const parsed = raw != null ? Number(raw) : NaN;
            const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_RATE;
            this.rateCache = { rate, expiresAt: now + RATE_TTL_MS };
            return rate;
        } catch {
            // Don't cache failures — let the next call retry.
            return FALLBACK_RATE;
        }
    }

    /**
     * Pick the most specific active rule for a listing.
     * Precedence: sku > brand > category > global.
     * Returns null when no rule (not even global) is configured — caller decides
     * whether to throw or fall back; in practice the seed guarantees a global rule.
     */
    pickRule(rules: BsvPricingRule[], input: BsvListingPricingInput): BsvPricingRule | null {
        return (
            rules.find((r) => r.scopeType === "sku" && r.scopeValue === input.sku) ||
            rules.find((r) => r.scopeType === "brand" && r.scopeValue === input.brand) ||
            rules.find((r) => r.scopeType === "category" && r.scopeValue === input.category) ||
            rules.find((r) => r.scopeType === "global") ||
            null
        );
    }

    /** Pure math, no IO — useful for tests & bulk. */
    private applyRule(
        costDzd: number,
        rule: BsvPricingRule,
        ctx: ResellerPricingContext,
        rate: number,
    ): ComputedPrice {
        let basePriceDzd: number;
        if (rule.markupType === "pct") {
            // markupValue is basis points (1500 = 15%).
            basePriceDzd = costDzd * (1 + rule.markupValue / 10000);
        } else {
            basePriceDzd = costDzd + rule.markupValue;
        }

        // Tier + optional custom discount stack additively.
        const tierPct = Number.isFinite(ctx.tierDiscountPct) ? ctx.tierDiscountPct : 0;
        const customPct = Number.isFinite(ctx.customDiscountPct as number)
            ? (ctx.customDiscountPct as number)
            : 0;
        // Safety: clamp total discount to [0, 100] to never produce negative prices.
        const totalDiscountPct = Math.max(0, Math.min(100, tierPct + customPct));

        const finalPriceDzd = basePriceDzd * (1 - totalDiscountPct / 100);
        const marginDzd = basePriceDzd - costDzd;
        const marginPct = costDzd > 0 ? (marginDzd / costDzd) * 100 : 0;

        return {
            costDzd: round2(costDzd),
            basePriceDzd: round2(basePriceDzd),
            finalPriceDzd: round2(finalPriceDzd),
            marginDzd: round2(marginDzd),
            marginPct: round2(marginPct),
            appliedRule: {
                id: rule.id,
                scopeType: rule.scopeType,
                scopeValue: rule.scopeValue,
                markupType: rule.markupType,
                markupValue: rule.markupValue,
            },
            conversionRate: rate,
        };
    }

    async computePrice(
        input: BsvListingPricingInput,
        ctx: ResellerPricingContext,
    ): Promise<ComputedPrice> {
        const [rate, rules] = await Promise.all([this.getUsdToDzdRate(), this.getRules()]);
        const rule = this.pickRule(rules, input);
        if (!rule) {
            throw new Error("BsvPricingService: no active pricing rule found (not even global). Seed the global fallback.");
        }
        const costDzd = (input.priceCentsUsd / 100) * rate;
        return this.applyRule(costDzd, rule, ctx, rate);
    }

    /**
     * Bulk version — loads rules+rate ONCE then prices each item.
     * Use this to rank an 80k-item catalogue without spamming the DB.
     */
    async computeBulk(
        inputs: BsvListingPricingInput[],
        ctx: ResellerPricingContext,
    ): Promise<ComputedPrice[]> {
        if (inputs.length === 0) return [];
        const [rate, rules] = await Promise.all([this.getUsdToDzdRate(), this.getRules()]);
        return inputs.map((input) => {
            const rule = this.pickRule(rules, input);
            if (!rule) {
                throw new Error("BsvPricingService.computeBulk: no active pricing rule found (not even global).");
            }
            const costDzd = (input.priceCentsUsd / 100) * rate;
            return this.applyRule(costDzd, rule, ctx, rate);
        });
    }
}

/** Process-wide singleton — safe because all state is in-memory caches. */
export const bsvPricingService = new BsvPricingService();
