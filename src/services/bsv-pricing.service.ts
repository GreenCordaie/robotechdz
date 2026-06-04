import "server-only";
import {
    ResalePricingService,
    type PricingRule,
    type ScopeType,
    type MarkupType,
    type ListingPricingInput,
    type ResellerPricingContext,
    type ComputedPrice,
} from "./markup-pricing.service";

// Backward-compatible aliases — callers and tests import these BSV-prefixed names.
export type BsvScopeType = ScopeType;
export type BsvMarkupType = MarkupType;
export type BsvPricingRule = PricingRule;
export type BsvListingPricingInput = ListingPricingInput;
export type { ResellerPricingContext, ComputedPrice };

/**
 * BSV resale pricing. Thin wrapper over the unified engine bound to
 * source='bsv' — rules now live in the shared `pricing_rules` table
 * (source 'bsv' + the all-sources '*' fallback).
 */
export class BsvPricingService extends ResalePricingService {
    constructor() {
        super("bsv");
    }
}

/** Process-wide singleton — safe because all state is in-memory caches. */
export const bsvPricingService = new BsvPricingService();
