import "server-only";
import { db } from "@/db";
import { g2bulkPricingRules, shopSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Public types — consumed by Lot 5 (G2Bulk shop catalogue) and admin UI.
// Signatures intentionally mirror bsv-pricing.service so the two can be
// swapped/composed by the orchestrator without callsite churn.
// ---------------------------------------------------------------------------

export type G2BulkScopeType = "global" | "category" | "brand" | "sku";
export type G2BulkMarkupType = "pct" | "fixed_dzd";

/** Internal pricing rule shape after normalization from DB row. */
export interface G2BulkPricingRule {
    id: number;
    scopeType: G2BulkScopeType;
    scopeValue: string;
    markupType: G2BulkMarkupType;
    /** For 'pct' this is BASIS POINTS (1500 = 15%). For 'fixed_dzd' this is absolute DZD. */
    markupValue: number;
    notes: string | null;
    isActive: boolean;
}

export interface G2BulkListingPricingInput {
    /** USD cents. Never floats. */
    priceCentsUsd: number;
    /** Category slug or G2Bulk categoryId stringified. */
    category: string;
    /** Brand slug (derived from G2Bulk product title or provider mapping). */
    brand: string;
    /** Canonical SKU — for G2Bulk, the upstream product id stringified. */
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
        scopeType: G2BulkScopeType;
        scopeValue: string;
        markupType: G2BulkMarkupType;
        markupValue: number;
    };
    conversionRate: number;
}

// ---------------------------------------------------------------------------
// Cache TTLs — rules change rarely, rate changes ~once a day.
// ---------------------------------------------------------------------------
const RULES_TTL_MS = 5 * 60 * 1000;       // 5 minutes
const RATE_TTL_MS = 60 * 60 * 1000;       // 1 hour
const FALLBACK_RATE = 270;                // matches BSV default if shopSettings unreachable

function normalizeRule(row: typeof g2bulkPricingRules.$inferSelect): G2BulkPricingRule {
    return {
        id: row.id,
        scopeType: row.scopeType as G2BulkScopeType,
        scopeValue: row.scopeValue,
        markupType: row.markupType as G2BulkMarkupType,
        markupValue: Number(row.markupValue),
        notes: row.notes,
        isActive: row.isActive,
    };
}

function round2(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

export class G2BulkPricingService {
    private rulesCache: { rules: G2BulkPricingRule[]; expiresAt: number } | null = null;
    private rateCache: { rate: number; expiresAt: number } | null = null;

    /** Invalidate all cached state. Call after admin CRUD or rate change. */
    invalidateCache(): void {
        this.rulesCache = null;
        this.rateCache = null;
    }

    /** Load all ACTIVE pricing rules. Cached for 5 min. */
    async getRules(): Promise<G2BulkPricingRule[]> {
        const now = Date.now();
        if (this.rulesCache && this.rulesCache.expiresAt > now) {
            return this.rulesCache.rules;
        }
        const rows = await db
            .select()
            .from(g2bulkPricingRules)
            .where(eq(g2bulkPricingRules.isActive, true));
        const rules = rows.map(normalizeRule);
        this.rulesCache = { rules, expiresAt: now + RULES_TTL_MS };
        return rules;
    }

    /** Load current USD→DZD rate from shop_settings.usd_exchange_rate. Cached for 1 h.
     *  REUSES the same shop_settings row as BSV — single source of truth.
     */
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
     */
    pickRule(rules: G2BulkPricingRule[], input: G2BulkListingPricingInput): G2BulkPricingRule | null {
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
        rule: G2BulkPricingRule,
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

        const tierPct = Number.isFinite(ctx.tierDiscountPct) ? ctx.tierDiscountPct : 0;
        const customPct = Number.isFinite(ctx.customDiscountPct as number)
            ? (ctx.customDiscountPct as number)
            : 0;
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
        input: G2BulkListingPricingInput,
        ctx: ResellerPricingContext,
    ): Promise<ComputedPrice> {
        const [rate, rules] = await Promise.all([this.getUsdToDzdRate(), this.getRules()]);
        const rule = this.pickRule(rules, input);
        if (!rule) {
            throw new Error("G2BulkPricingService: no active pricing rule found (not even global). Seed the global fallback.");
        }
        const costDzd = (input.priceCentsUsd / 100) * rate;
        return this.applyRule(costDzd, rule, ctx, rate);
    }

    /**
     * Bulk version — loads rules+rate ONCE then prices each item.
     */
    async computeBulk(
        inputs: G2BulkListingPricingInput[],
        ctx: ResellerPricingContext,
    ): Promise<ComputedPrice[]> {
        if (inputs.length === 0) return [];
        const [rate, rules] = await Promise.all([this.getUsdToDzdRate(), this.getRules()]);
        return inputs.map((input) => {
            const rule = this.pickRule(rules, input);
            if (!rule) {
                throw new Error("G2BulkPricingService.computeBulk: no active pricing rule found (not even global).");
            }
            const costDzd = (input.priceCentsUsd / 100) * rate;
            return this.applyRule(costDzd, rule, ctx, rate);
        });
    }
}

/** Process-wide singleton — safe because all state is in-memory caches. */
export const g2bulkPricingService = new G2BulkPricingService();
