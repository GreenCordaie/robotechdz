import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/loadbrain-v2", () => ({ lbV2: null }));
// Stub the DB module so the reconciler's top-level `import { db } from "@/db"`
// doesn't trip on a missing DATABASE_URL. Tests always inject their own
// `dbInstance` via options, so the default never runs.
vi.mock("@/db", () => ({ db: {} }));
// Stub iptv-reseller.service: pulled in transitively, requires server-only.
vi.mock("@/services/iptv-reseller.service", () => ({
    markIptvOrderDelivered: vi.fn(),
    markIptvOrderFailed: vi.fn(),
}));

import { markExpiredIptvOrders } from "@/services/iptv-reseller-reconciler.service";

/**
 * Follow-up to commit a047517 (reseller IPTV bug fix lot).
 *
 * markExpiredIptvOrders persists the EXPIRED terminal state on mirror rows
 * whose expiresAt is in the past. The display layer (deriveEffectiveStatus)
 * already covers the UI, but listings/exports and any consumer reading the
 * raw status column should not depend on display logic.
 */
describe("markExpiredIptvOrders", () => {
    interface FakeRow { id: number }

    function makeFakeDb(rowsToExpire: FakeRow[]) {
        const seen = { selectCalled: 0, updateCalled: 0, updatedIds: [] as number[] };

        const fakeDb = {
            select: () => ({
                from: () => ({
                    where: () => ({
                        limit: async () => {
                            seen.selectCalled++;
                            return rowsToExpire;
                        },
                    }),
                }),
            }),
            update: () => ({
                set: () => ({
                    where: async () => {
                        seen.updateCalled++;
                        seen.updatedIds = rowsToExpire.map((r) => r.id);
                        return undefined;
                    },
                }),
            }),
        } as never;

        return { fakeDb, seen };
    }

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns expired=0 when no rows match (idempotent on already-EXPIRED rows)", async () => {
        const { fakeDb, seen } = makeFakeDb([]);
        const r = await markExpiredIptvOrders({ dbInstance: fakeDb, limit: 100 });
        expect(r.expired).toBe(0);
        expect(seen.selectCalled).toBe(1);
        // No UPDATE round-trip when no candidates.
        expect(seen.updateCalled).toBe(0);
    });

    it("flips N rows and returns the count", async () => {
        const { fakeDb, seen } = makeFakeDb([{ id: 11 }, { id: 12 }, { id: 13 }]);
        const r = await markExpiredIptvOrders({ dbInstance: fakeDb, limit: 100 });
        expect(r.expired).toBe(3);
        expect(seen.updatedIds).toEqual([11, 12, 13]);
    });

    it("clamps limit to the [1, 5000] window", async () => {
        const { fakeDb } = makeFakeDb([]);
        // Below floor → clamped to 1 (no throw).
        await expect(markExpiredIptvOrders({ dbInstance: fakeDb, limit: 0 })).resolves.toEqual({
            expired: 0,
        });
        await expect(markExpiredIptvOrders({ dbInstance: fakeDb, limit: -1 })).resolves.toEqual({
            expired: 0,
        });
        // Above ceiling → clamped (no throw).
        await expect(
            markExpiredIptvOrders({ dbInstance: fakeDb, limit: 999_999 }),
        ).resolves.toEqual({ expired: 0 });
    });

    it("defaults to limit=500 when not provided", async () => {
        const { fakeDb } = makeFakeDb([]);
        await expect(markExpiredIptvOrders({ dbInstance: fakeDb })).resolves.toEqual({
            expired: 0,
        });
    });
});
