import { describe, it, expect, vi, beforeEach } from "vitest";

// `react.cache` is not available outside a React server runtime — stub it to
// the identity so the queries-class statics initialise.
vi.mock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react");
    return { ...actual, cache: <T extends (...a: any[]) => any>(fn: T) => fn };
});

// Mock the logger to avoid pulling telegram/env in tests.
const warnSpy = vi.fn();
vi.mock("@/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: (...args: unknown[]) => warnSpy(...args),
        error: vi.fn(),
        critical: vi.fn(),
    },
}));

// Capture what the queries pass to drizzle so we can assert the cap.
const findManyMock = vi.fn();
const selectMock = vi.fn();
const findFirstMock = vi.fn();

// Fluent stub that resolves to whatever selectMock() returns at await-time,
// regardless of which builder methods (.from / .groupBy / .innerJoin / .where)
// the caller chains. Each .then forwards to the queued mock resolution.
function makeFluent(resolveTo: () => Promise<unknown>) {
    const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        groupBy: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        offset: () => chain,
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            resolveTo().then(resolve, reject),
    };
    return chain;
}

let selectCallIndex = 0;
const selectResults: unknown[][] = [];

vi.mock("@/db", () => ({
    db: {
        query: {
            supplierTransactions: {
                findMany: (...args: unknown[]) => findManyMock(...args),
            },
            shopSettings: {
                findFirst: (...args: unknown[]) => findFirstMock(...args),
            },
        },
        select: () => {
            const idx = selectCallIndex++;
            return makeFluent(async () => {
                selectMock(idx);
                return selectResults[idx] ?? [];
            });
        },
    },
}));

import { SupplierQueries } from "@/services/queries/supplier.queries";

beforeEach(() => {
    findManyMock.mockReset();
    selectMock.mockReset();
    findFirstMock.mockReset();
    warnSpy.mockReset();
    selectCallIndex = 0;
    selectResults.length = 0;
    findManyMock.mockResolvedValue([]);
    findFirstMock.mockResolvedValue({ usdExchangeRate: "245" });
});

describe("SupplierQueries.getHistory caps", () => {
    it("applies the default 200 limit when none is given", async () => {
        await SupplierQueries.getHistory(0);
        expect(findManyMock).toHaveBeenCalledTimes(1);
        const arg = findManyMock.mock.calls[0][0];
        expect(arg.limit).toBe(200);
    });

    it("caps caller-requested limit at 1_000", async () => {
        await SupplierQueries.getHistory(42, 99_999);
        const arg = findManyMock.mock.calls[0][0];
        expect(arg.limit).toBe(1_000);
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("rejects negative supplierId instead of silently returning everything", async () => {
        await expect(SupplierQueries.getHistory(-1)).rejects.toThrow(
            /invalid supplierId/,
        );
        expect(findManyMock).not.toHaveBeenCalled();
    });

    it("treats supplierId=0 as the all-suppliers sentinel (no where on supplierId)", async () => {
        await SupplierQueries.getHistory(0, 50);
        const arg = findManyMock.mock.calls[0][0];
        expect(arg.where).toBeUndefined();
        expect(arg.limit).toBe(50);
    });
});

describe("SupplierQueries.getFinancialStats aggregation", () => {
    it("does NOT stream all rows (no findMany on supplierTransactions)", async () => {
        await SupplierQueries.getFinancialStats();
        expect(findManyMock).not.toHaveBeenCalled();
    });

    it("returns the same shape as before (totalPaidDzd / totalUnpaidDzd / netProfit / exchangeRate)", async () => {
        // Two GROUP BY rows from the supplierTransactions aggregate:
        //  - RECHARGE/PAID/USD @ rate 250, sum=100 -> +25_000 DZD paid
        //  - RECHARGE/UNPAID/DZD @ no rate, sum=500 -> +500 DZD unpaid
        selectResults[0] = [
            { type: "RECHARGE", paymentStatus: "PAID", currency: "USD", exchangeRate: "250", totalAmount: "100", count: 1 },
            { type: "RECHARGE", paymentStatus: "UNPAID", currency: "DZD", exchangeRate: null, totalAmount: "500", count: 1 },
        ];
        // No sales — the orderItems select returns []
        selectResults[1] = [];

        const stats = await SupplierQueries.getFinancialStats();

        expect(stats).toMatchObject({
            totalPaidDzd: expect.any(String),
            totalUnpaidDzd: expect.any(String),
            netProfit: expect.any(String),
            exchangeRate: expect.any(String),
        });
        expect(parseFloat(stats.totalPaidDzd)).toBeCloseTo(25_000, 2);
        expect(parseFloat(stats.totalUnpaidDzd)).toBeCloseTo(500, 2);
    });
});
