import "server-only";
import { db } from "@/db";
import { shopSettings } from "@/db/schema";

/**
 * Generic markup-pricing engine shared by the BSV and G2Bulk mirror shops.
 *
 * The two shops priced identically (USD cost → DZD via shop_settings rate →
 * scope-based markup → reseller tier/custom discount) but lived in two ~95%
 * duplicated files. This base class owns all that logic; each shop subclass
 * only supplies how to load its own pricing-rules table (`fetchActiveRules`).
 *
 * Scope precedence (most specific wins): sku > brand > category > global.
 * markup_type 'pct' = basis points (1500 = 15%); 'fixed_dzd' = absolute DZD.
 */

export type ScopeType = "global" | "category" | "brand" | "sku";
export type MarkupType = "pct" | "fixed_dzd";

/** Internal pricing rule shape after normalization from a DB row. */
export interface PricingRule {
    id: number;
    scopeType: ScopeType;
    scopeValue: string;
    markupType: MarkupType;
    /** For 'pct' this is BASIS POINTS (1500 = 15%). For 'fixed_dzd' this is absolute DZD. */
    markupValue: number;
    notes: string | null;
    isActive: boolean;
}

export interface ListingPricingInput {
    /** USD cents. Never floats. */
    priceCentsUsd: number;
    /** Category slug. */
    category: string;
    /** Brand slug. */
    brand: string;
    /** Canonical SKU (upstream product id stringified). */
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
        scopeType: ScopeType;
        scopeValue: string;
        markupType: MarkupType;
        markupValue: number;
    };
    conversionRate: number;
}

/** Raw DB row shape — both pricing-rules tables share these columns. Internal. */
interface PricingRuleRow {
    id: number;
    scopeType: string;
    scopeValue: string;
    markupType: string;
    markupValue: string | number;
    notes: string | null;
    isActive: boolean;
}

// Cache TTLs — rules change rarely, rate changes ~once a day.
const RULES_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FALLBACK_RATE = 270; // used if shop_settings is unreachable

function round2(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

export abstract class MarkupPricingService {
    private rulesCache: { rules: PricingRule[]; expiresAt: number } | null = null;
    private rateCache: { rate: number; expiresAt: number } | null = null;

    /** Load this shop's ACTIVE pricing rules from its own table. */
    protected abstract fetchActiveRules(): Promise<PricingRule[]>;

    /** Normalize a raw rules-table row into the internal shape. */
    protected normalizeRule(row: PricingRuleRow): PricingRule {
        return {
            id: row.id,
            scopeType: row.scopeType as ScopeType,
            scopeValue: row.scopeValue,
            markupType: row.markupType as MarkupType,
            markupValue: Number(row.markupValue),
            notes: row.notes,
            isActive: row.isActive,
        };
    }

    /** Invalidate all cached state. Call after admin CRUD or rate change. */
    invalidateCache(): void {
        this.rulesCache = null;
        this.rateCache = null;
    }

    /** Load all ACTIVE pricing rules. Cached for 5 min. */
    async getRules(): Promise<PricingRule[]> {
        const now = Date.now();
        if (this.rulesCache && this.rulesCache.expiresAt > now) {
            return this.rulesCache.rules;
        }
        const rules = await this.fetchActiveRules();
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
            const settings = await db
                .select({ rate: shopSettings.usdExchangeRate })
                .from(shopSettings)
                .limit(1);
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
     * Precedence: sku > brand > category > global. Returns null when no rule
     * (not even global) is configured.
     */
    pickRule(rules: PricingRule[], input: ListingPricingInput): PricingRule | null {
        return (
            rules.find((r) => r.scopeType === "sku" && r.scopeValue === input.sku) ||
            rules.find((r) => r.scopeType === "brand" && r.scopeValue === input.brand) ||
            rules.find((r) => r.scopeType === "category" && r.scopeValue === input.category) ||
            rules.find((r) => r.scopeType === "global") ||
            null
        );
    }

    /** Pure math, no IO. */
    private applyRule(
        costDzd: number,
        rule: PricingRule,
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
        // Clamp total discount to [0, 100] to never produce negative prices.
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
        input: ListingPricingInput,
        ctx: ResellerPricingContext,
    ): Promise<ComputedPrice> {
        const [rate, rules] = await Promise.all([this.getUsdToDzdRate(), this.getRules()]);
        const rule = this.pickRule(rules, input);
        if (!rule) {
            throw new Error(
                "MarkupPricingService: no active pricing rule found (not even global). Seed the global fallback.",
            );
        }
        const costDzd = (input.priceCentsUsd / 100) * rate;
        return this.applyRule(costDzd, rule, ctx, rate);
    }

    /** Bulk version — loads rules+rate ONCE then prices each item. */
    async computeBulk(
        inputs: ListingPricingInput[],
        ctx: ResellerPricingContext,
    ): Promise<ComputedPrice[]> {
        if (inputs.length === 0) return [];
        const [rate, rules] = await Promise.all([this.getUsdToDzdRate(), this.getRules()]);
        return inputs.map((input) => {
            const rule = this.pickRule(rules, input);
            if (!rule) {
                throw new Error(
                    "MarkupPricingService: no active pricing rule found (not even global).",
                );
            }
            const costDzd = (input.priceCentsUsd / 100) * rate;
            return this.applyRule(costDzd, rule, ctx, rate);
        });
    }
}
