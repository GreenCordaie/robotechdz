import "server-only";
import { db } from "@/db";
import { g2bulkPricingRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
    MarkupPricingService,
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

/** G2Bulk mirror shop pricing — see {@link MarkupPricingService}. Rules live in `g2bulk_pricing_rules`. */
export class G2BulkPricingService extends MarkupPricingService {
    protected async fetchActiveRules(): Promise<PricingRule[]> {
        const rows = await db
            .select()
            .from(g2bulkPricingRules)
            .where(eq(g2bulkPricingRules.isActive, true));
        return rows.map((row) => this.normalizeRule(row));
    }
}

/** Process-wide singleton — safe because all state is in-memory caches. */
export const g2bulkPricingService = new G2BulkPricingService();
