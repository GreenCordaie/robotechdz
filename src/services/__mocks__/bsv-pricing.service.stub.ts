/**
 * STUB — temporary stand-in for the real `bsv-pricing.service.ts`
 * created on branch `feat/bsv-pricing-admin` (Agent 2's territory).
 *
 * Implements the exact same interface so swapping the import in
 * `src/app/reseller/shop/actions.ts` is a one-line change once Agent 2 merges:
 *
 *   - import { bsvPricingService } from "@/services/__mocks__/bsv-pricing.service.stub";
 *   + import { bsvPricingService } from "@/services/bsv-pricing.service";
 *
 * Hardcoded values:
 *   - markup: +15%
 *   - USD→DZD rate: 270
 *
 * DO NOT extend this stub with extra logic — keep it minimal so the swap
 * surface stays small.
 */
import type {
    BsvListingPricingInput,
    ResellerPricingContext,
    ComputedPrice,
} from "@/types/bsv-listings";

const MOCK_MARKUP_PCT = 15;
const MOCK_USD_TO_DZD_RATE = 270;

function computeOne(
    input: BsvListingPricingInput,
    ctx: ResellerPricingContext,
    rate: number
): ComputedPrice {
    const markupPct = MOCK_MARKUP_PCT;
    const usdAfterMarkup = (input.priceCentsUsd / 100) * (1 + markupPct / 100);
    const listPriceDzd = Math.round(usdAfterMarkup * rate);

    const discountPct = Math.min(
        100,
        Math.max(0, ctx.tierDiscountPct + ctx.customDiscountPct)
    );
    const finalPriceDzd = Math.round(listPriceDzd * (1 - discountPct / 100));

    return {
        basePriceCentsUsd: input.priceCentsUsd,
        markupPct,
        listPriceDzd,
        finalPriceDzd,
        discountPct,
        conversionRate: rate,
    };
}

export const bsvPricingService = {
    async getUsdToDzdRate(): Promise<number> {
        return MOCK_USD_TO_DZD_RATE;
    },

    async computePrice(
        input: BsvListingPricingInput,
        ctx: ResellerPricingContext
    ): Promise<ComputedPrice> {
        const rate = await this.getUsdToDzdRate();
        return computeOne(input, ctx, rate);
    },

    async computeBulk(
        inputs: BsvListingPricingInput[],
        ctx: ResellerPricingContext
    ): Promise<ComputedPrice[]> {
        const rate = await this.getUsdToDzdRate();
        return inputs.map((i) => computeOne(i, ctx, rate));
    },
};

export type {
    BsvListingPricingInput,
    ResellerPricingContext,
    ComputedPrice,
};
