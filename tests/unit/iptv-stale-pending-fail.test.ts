import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/loadbrain-v2", () => ({ lbV2: null }));
// Stub the DB module so the reconciler's top-level `import { db } from "@/db"`
// doesn't trip on a missing DATABASE_URL. Tests inject their own `dbInstance`.
vi.mock("@/db", () => ({ db: {} }));
// markIptvOrderFailed is the canonical, row-locked refund path. We assert the
// sweeper delegates to it (never re-implements the refund) and tallies outcomes.
const markFailed = vi.fn();
vi.mock("@/services/iptv-reseller.service", () => ({
    markIptvOrderDelivered: vi.fn(),
    markIptvOrderFailed: (...args: unknown[]) => markFailed(...args),
}));

import { failStalePendingIptvOrders } from "@/services/iptv-reseller-reconciler.service";

/**
 * Money-safety net for the panelking365 (King365) failure mode proven on prod:
 * LoadBrain keeps a task `queued` forever when the panel session expires and the
 * captcha re-login fails. The upstream never turns terminal, so the live
 * reconciler leaves the mirror PENDING_LOADBRAIN indefinitely — wallet debited,
 * no error surfaced, no refund, and dropped past the 7-day scan window.
 *
 * failStalePendingIptvOrders fails + refunds PENDING_LOADBRAIN rows older than a
 * grace period via the canonical markIptvOrderFailed path. Because the state
 * machine guarantees PENDING_LOADBRAIN was never delivered, refunding is safe.
 */
describe("failStalePendingIptvOrders", () => {
    interface FakeRow {
        id: number;
        resellerId: number;
        lastError: string | null;
    }

    function makeFakeDb(staleRows: FakeRow[]) {
        const seen = { selectCalled: 0 };
        const fakeDb = {
            select: () => ({
                from: () => ({
                    where: () => ({
                        limit: async () => {
                            seen.selectCalled++;
                            return staleRows;
                        },
                    }),
                }),
            }),
        } as never;
        return { fakeDb, seen };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        markFailed.mockReset();
    });

    it("returns failed=0/refunded=0 when no stale rows (idempotent)", async () => {
        const { fakeDb, seen } = makeFakeDb([]);
        const r = await failStalePendingIptvOrders({ dbInstance: fakeDb });
        expect(r).toEqual({ failed: 0, refunded: 0, errors: [] });
        expect(seen.selectCalled).toBe(1);
        expect(markFailed).not.toHaveBeenCalled();
    });

    it("fails + refunds each stale PENDING row via markIptvOrderFailed", async () => {
        markFailed.mockResolvedValue({ updated: true, refunded: true });
        const { fakeDb } = makeFakeDb([
            { id: 4, resellerId: 2, lastError: null },
            { id: 9, resellerId: 2, lastError: "Session expired — captcha failed" },
        ]);
        const r = await failStalePendingIptvOrders({ dbInstance: fakeDb, graceHours: 24 });
        expect(r.failed).toBe(2);
        expect(r.refunded).toBe(2);
        expect(markFailed).toHaveBeenCalledTimes(2);
        // Canonical path invoked with the owning reseller (never trusts input).
        expect(markFailed).toHaveBeenCalledWith(fakeDb, expect.objectContaining({ id: 4, resellerId: 2 }));
        expect(markFailed).toHaveBeenCalledWith(fakeDb, expect.objectContaining({ id: 9, resellerId: 2 }));
    });

    it("threads the upstream error and grace window into the refund reason", async () => {
        markFailed.mockResolvedValue({ updated: true, refunded: true });
        const { fakeDb } = makeFakeDb([{ id: 9, resellerId: 2, lastError: "Session expired — captcha failed" }]);
        await failStalePendingIptvOrders({ dbInstance: fakeDb, graceHours: 24 });
        const reason = (markFailed.mock.calls[0][1] as { reason: string }).reason;
        expect(reason).toContain("24");
        expect(reason).toContain("Session expired — captcha failed");
    });

    it("counts failed without refunded when the wallet was not credited", async () => {
        // e.g. already-terminal / no wallet row → updated may be false, refunded false.
        markFailed
            .mockResolvedValueOnce({ updated: true, refunded: false })
            .mockResolvedValueOnce({ updated: false, refunded: false });
        const { fakeDb } = makeFakeDb([
            { id: 4, resellerId: 2, lastError: null },
            { id: 9, resellerId: 2, lastError: null },
        ]);
        const r = await failStalePendingIptvOrders({ dbInstance: fakeDb });
        expect(r.failed).toBe(1); // only the updated one
        expect(r.refunded).toBe(0);
    });

    it("captures a per-row failure without aborting the sweep", async () => {
        markFailed
            .mockRejectedValueOnce(new Error("db timeout"))
            .mockResolvedValueOnce({ updated: true, refunded: true });
        const { fakeDb } = makeFakeDb([
            { id: 4, resellerId: 2, lastError: null },
            { id: 9, resellerId: 2, lastError: null },
        ]);
        const r = await failStalePendingIptvOrders({ dbInstance: fakeDb });
        expect(r.failed).toBe(1);
        expect(r.refunded).toBe(1);
        expect(r.errors).toEqual([{ id: 4, reason: "db timeout" }]);
        expect(markFailed).toHaveBeenCalledTimes(2);
    });
});
