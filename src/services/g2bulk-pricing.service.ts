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

// Backward-compatible aliases — callers and tests import these G2Bulk-prefixed names.
export type G2BulkScopeType = ScopeType;
export type G2BulkMarkupType = MarkupType;
export type G2BulkPricingRule = PricingRule;
export type G2BulkListingPricingInput = ListingPricingInput;
export type { ResellerPricingContext, ComputedPrice };

/**
 * G2Bulk resale pricing. Thin wrapper over the unified engine bound to
 * source='g2bulk' — rules now live in the shared `pricing_rules` table
 * (source 'g2bulk' + the all-sources '*' fallback).
 */
export class G2BulkPricingService extends ResalePricingService {
    constructor() {
        super("g2bulk");
    }
}

/** Process-wide singleton — safe because all state is in-memory caches. */
export const g2bulkPricingService = new G2BulkPricingService();
