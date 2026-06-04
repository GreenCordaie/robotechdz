import "server-only";
import { db } from "@/db";
import { shopSettings, pricingRules } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Unified resale-pricing engine shared by every reseller source (BSV, G2Bulk,
 * IPTV…). Cost (USD or DZD) → DZD via shop_settings rate → scope-based markup →
 * reseller tier/custom discount.
 *
 * Rules live in one table (`pricing_rules`) discriminated by `source`. A service
 * instance is bound to one source and reads that source's rules PLUS the
 * all-sources `'*'` rules as fallback.
 *
 * Scope precedence (most specific wins), source-specific before all-sources:
 *   <source> sku > brand > category > global   THEN   '*' sku > … > global.
 *
 * markup_type:
 *   'pct'         → markupValue is BASIS POINTS (1500 = 15%): cost × (1 + bps/1e4)
 *   'fixed_dzd'   → markupValue is a margin ADDED to cost: cost + markupValue
 *   'fixed_price' → markupValue IS the absolute resale price in DZD (cost ignored)
 */

export type ScopeType = "global" | "category" | "brand" | "sku";
export type MarkupType = "pct" | "fixed_dzd" | "fixed_price";

/** Internal pricing rule shape after normalization from a DB row. */
export interface PricingRule {
    id: number;
    source: string;
    scopeType: ScopeType;
    scopeValue: string;
    markupType: MarkupType;
    /** 'pct' → basis points; 'fixed_dzd' → margin DZD; 'fixed_price' → absolute DZD. */
    markupValue: number;
    notes: string | null;
    isActive: boolean;
}

export interface ListingPricingInput {
    /** Cost in cents of `costCurrency` (default USD). Never floats. */
    priceCentsUsd: number;
    /** Currency of the cost. USD is converted to DZD; DZD is used as-is. */
    costCurrency?: "USD" | "DZD";
    /** Category slug. */
    category: string;
    /** Brand slug. */
    brand: string;
    /** Canonical SKU (upstream product id / cluster slug / loadbrain slug). */
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
    /** Cost in DZD (USD × rate, or DZD as-is). Rounded to 2 decimals. */
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
        source: string;
        scopeType: ScopeType;
        scopeValue: string;
        markupType: MarkupType;
        markupValue: number;
    };
    conversionRate: number;
}

/** Raw DB row shape from `pricing_rules`. Internal. */
interface PricingRuleRow {
    id: number;
    source: string;
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
    /** The source this instance prices (e.g. "bsv", "g2bulk", "iptv"). */
    protected abstract readonly source: string;

    private rulesCache: { rules: PricingRule[]; expiresAt: number } | null = null;
    private rateCache: { rate: number; expiresAt: number } | null = null;

    /** Normalize a raw rules-table row into the internal shape. */
    protected normalizeRule(row: PricingRuleRow): PricingRule {
        return {
            id: row.id,
            source: row.source,
            scopeType: row.scopeType as ScopeType,
            scopeValue: row.scopeValue,
            markupType: row.markupType as MarkupType,
            markupValue: Number(row.markupValue),
            notes: row.notes,
            isActive: row.isActive,
        };
    }

    /**
     * Load this source's ACTIVE rules + the all-sources '*' rules from the
     * unified `pricing_rules` table.
     */
    protected async fetchActiveRules(): Promise<PricingRule[]> {
        const rows = await db
            .select()
            .from(pricingRules)
            .where(and(eq(pricingRules.isActive, true), inArray(pricingRules.source, [this.source, "*"])));
        return rows.map((row) => this.normalizeRule(row as unknown as PricingRuleRow));
    }

    /** Invalidate all cached state. Call after admin CRUD or rate change. */
    invalidateCache(): void {
        this.rulesCache = null;
        this.rateCache = null;
    }

    /** Load all ACTIVE rules (source + '*'). Cached for 5 min. */
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
     * Pick the most specific active rule. Source-specific rules win over the
     * all-sources '*' fallback; within each, precedence is sku > brand >
     * category > global. Returns null when no rule (not even '*' global) exists.
     */
    pickRule(rules: PricingRule[], input: ListingPricingInput): PricingRule | null {
        const forSource = (s: string): PricingRule | null =>
            rules.find((r) => r.source === s && r.scopeType === "sku" && r.scopeValue === input.sku) ||
            rules.find((r) => r.source === s && r.scopeType === "brand" && r.scopeValue === input.brand) ||
            rules.find((r) => r.source === s && r.scopeType === "category" && r.scopeValue === input.category) ||
            rules.find((r) => r.source === s && r.scopeType === "global") ||
            null;
        return forSource(this.source) || forSource("*") || null;
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
        } else if (rule.markupType === "fixed_price") {
            // markupValue IS the absolute resale price, independent of cost.
            basePriceDzd = rule.markupValue;
        } else {
            // fixed_dzd: margin added to cost.
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
                source: rule.source,
                scopeType: rule.scopeType,
                scopeValue: rule.scopeValue,
                markupType: rule.markupType,
                markupValue: rule.markupValue,
            },
            conversionRate: rate,
        };
    }

    /** Cost in DZD from the input's cents + currency (USD converted, DZD as-is). */
    private toCostDzd(input: ListingPricingInput, rate: number): number {
        const units = input.priceCentsUsd / 100;
        return input.costCurrency === "DZD" ? units : units * rate;
    }

    async computePrice(
        input: ListingPricingInput,
        ctx: ResellerPricingContext,
    ): Promise<ComputedPrice> {
        const [rate, rules] = await Promise.all([this.getUsdToDzdRate(), this.getRules()]);
        const rule = this.pickRule(rules, input);
        if (!rule) {
            throw new Error(
                `MarkupPricingService[${this.source}]: no active pricing rule found (not even '*' global). Seed the global fallback.`,
            );
        }
        return this.applyRule(this.toCostDzd(input, rate), rule, ctx, rate);
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
                    `MarkupPricingService[${this.source}]: no active pricing rule found (not even '*' global).`,
                );
            }
            return this.applyRule(this.toCostDzd(input, rate), rule, ctx, rate);
        });
    }
}

/**
 * Concrete resale-pricing service bound to a source at construction.
 * Used directly for new sources (e.g. IPTV) and as the base for the
 * per-source singletons (BSV, G2Bulk).
 */
export class ResalePricingService extends MarkupPricingService {
    protected readonly source: string;
    constructor(source: string) {
        super();
        this.source = source;
    }
}
