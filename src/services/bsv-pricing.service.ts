import "server-only";
import { db } from "@/db";
import { bsvPricingRules } from "@/db/schema";
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

// Backward-compatible aliases — callers and tests import these BSV-prefixed names.
export type BsvScopeType = ScopeType;
export type BsvMarkupType = MarkupType;
export type BsvPricingRule = PricingRule;
export type BsvListingPricingInput = ListingPricingInput;
export type { ResellerPricingContext, ComputedPrice };

/** BSV mirror shop pricing — see {@link MarkupPricingService}. Rules live in `bsv_pricing_rules`. */
export class BsvPricingService extends MarkupPricingService {
    protected async fetchActiveRules(): Promise<PricingRule[]> {
        const rows = await db
            .select()
            .from(bsvPricingRules)
            .where(eq(bsvPricingRules.isActive, true));
        return rows.map((row) => this.normalizeRule(row));
    }
}

/** Process-wide singleton — safe because all state is in-memory caches. */
export const bsvPricingService = new BsvPricingService();
