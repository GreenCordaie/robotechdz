import { describe, it, expect } from "vitest";
import {
    validateAmountDzd,
    hasSufficientBalance,
    computeBalanceAfter,
    isCentralTxType,
    reconcileCentralCounters,
    MAX_AMOUNT_DZD,
} from "@/services/central-wallet.service";

describe("central-wallet service helpers", () => {
    describe("validateAmountDzd", () => {
        it("accepts a positive integer amount", () => {
            const res = validateAmountDzd("10000");
            expect(res.ok).toBe(true);
            if (res.ok) {
                expect(res.value).toBe(10000);
                expect(res.normalized).toBe("10000.00");
            }
        });

        it("accepts a 2-decimal amount", () => {
            const res = validateAmountDzd("1234.56");
            expect(res.ok).toBe(true);
            if (res.ok) expect(res.normalized).toBe("1234.56");
        });

        it("rejects negative amounts", () => {
            const res = validateAmountDzd("-50");
            expect(res.ok).toBe(false);
        });

        it("rejects zero", () => {
            const res = validateAmountDzd("0");
            expect(res.ok).toBe(false);
        });

        it("rejects more than 2 decimals", () => {
            const res = validateAmountDzd("100.123");
            expect(res.ok).toBe(false);
        });

        it("rejects amounts at or above the max bound", () => {
            const res = validateAmountDzd(MAX_AMOUNT_DZD.toString());
            expect(res.ok).toBe(false);
        });

        it("rejects empty string", () => {
            const res = validateAmountDzd("");
            expect(res.ok).toBe(false);
        });

        it("rejects non-numeric input", () => {
            expect(validateAmountDzd("abc").ok).toBe(false);
            expect(validateAmountDzd("10,50").ok).toBe(false);
        });
    });

    describe("hasSufficientBalance", () => {
        it("returns true when balance equals amount", () => {
            expect(hasSufficientBalance("1000.00", 1000)).toBe(true);
        });

        it("returns true when balance exceeds amount", () => {
            expect(hasSufficientBalance("5000.50", 2500.25)).toBe(true);
        });

        it("returns false when balance is short", () => {
            expect(hasSufficientBalance("100.00", 250)).toBe(false);
        });

        it("avoids float drift at the cent level", () => {
            // 0.1 + 0.2 = 0.30000000000000004 in JS floats
            expect(hasSufficientBalance("0.30", 0.1 + 0.2)).toBe(true);
        });

        it("treats empty/invalid balance as zero", () => {
            expect(hasSufficientBalance("", 1)).toBe(false);
            expect(hasSufficientBalance("not-a-number", 0.01)).toBe(false);
        });
    });

    describe("computeBalanceAfter", () => {
        it("adds positive deltas precisely", () => {
            expect(computeBalanceAfter("1000.00", 250.25)).toBe("1250.25");
        });

        it("subtracts negative deltas precisely", () => {
            expect(computeBalanceAfter("1000.00", -250.25)).toBe("749.75");
        });

        it("handles classic float-drift cases", () => {
            expect(computeBalanceAfter("0.10", 0.2)).toBe("0.30");
        });

        it("returns 2-decimal fixed precision", () => {
            const out = computeBalanceAfter("100", 1);
            expect(out).toBe("101.00");
        });
    });

    describe("isCentralTxType", () => {
        it("accepts the three canonical types", () => {
            expect(isCentralTxType("admin_topup")).toBe(true);
            expect(isCentralTxType("reseller_credit")).toBe(true);
            expect(isCentralTxType("adjustment")).toBe(true);
        });

        it("rejects unknown types", () => {
            expect(isCentralTxType("foo")).toBe(false);
            expect(isCentralTxType("")).toBe(false);
        });
    });

    describe("reconcileCentralCounters", () => {
        it("reports balanced when balance == toppedUp - disbursed", () => {
            const r = reconcileCentralCounters({
                balance: "250.00",
                totalToppedUp: "1000.00",
                totalDisbursed: "750.00",
            });
            expect(r.balanced).toBe(true);
            expect(r.expectedBalance).toBe(250);
            expect(r.actualBalance).toBe(250);
            expect(r.drift).toBe(0);
        });

        it("flags a drift when balance is short", () => {
            const r = reconcileCentralCounters({
                balance: "240.00",
                totalToppedUp: "1000.00",
                totalDisbursed: "750.00",
            });
            expect(r.balanced).toBe(false);
            expect(r.drift).toBe(-10);
        });

        it("flags a drift when balance is over", () => {
            const r = reconcileCentralCounters({
                balance: "260.00",
                totalToppedUp: "1000.00",
                totalDisbursed: "750.00",
            });
            expect(r.balanced).toBe(false);
            expect(r.drift).toBe(10);
        });

        it("treats a pass-through (top-up + disburse same amount) as balanced", () => {
            // Reseller pays 100k cash → central in 100k + out 100k → balance unchanged
            const r = reconcileCentralCounters({
                balance: "0.00",
                totalToppedUp: "100000.00",
                totalDisbursed: "100000.00",
            });
            expect(r.balanced).toBe(true);
            expect(r.expectedBalance).toBe(0);
        });

        it("tolerates one centime of postgres numeric noise", () => {
            const r = reconcileCentralCounters({
                balance: "250.01",
                totalToppedUp: "1000.00",
                totalDisbursed: "750.00",
            });
            expect(r.balanced).toBe(true);
            expect(r.drift).toBe(0.01);
        });

        it("accepts a tighter custom tolerance", () => {
            const r = reconcileCentralCounters({
                balance: "250.01",
                totalToppedUp: "1000.00",
                totalDisbursed: "750.00",
                tolerance: 0,
            });
            expect(r.balanced).toBe(false);
        });

        it("treats empty/invalid counters as zero", () => {
            const r = reconcileCentralCounters({
                balance: "",
                totalToppedUp: "",
                totalDisbursed: "",
            });
            expect(r.balanced).toBe(true);
            expect(r.actualBalance).toBe(0);
        });
    });
});
