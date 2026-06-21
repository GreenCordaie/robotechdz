import { describe, it, expect, vi, beforeEach } from "vitest";
// The service imports @/db (throws "DATABASE_URL must be set" at import). Stub it;
// the test injects a fake db via deps.
vi.mock("@/db", () => ({ db: {} }));

import { reconcileNetflixMirror } from "@/services/netflix-mirror-reconcile.service";
import type { SlotStateRow } from "@/services/loadbrain-netflix.client";

beforeEach(() => {
    process.env.LOADBRAIN_SITE_ID = "site-uuid";
});

/**
 * Fake drizzle db modelling exactly the calls the service makes:
 *   - db.select({...}).from(t).where(w).limit(n)  → resolves `mirrorRows`
 *   - db.transaction(cb) → cb(tx); tx.update(t).set(p).where(w) captured
 */
function fakeDb(mirrorRows: any[]) {
    const updates: Array<{ payload: any }> = [];
    const selectChain = {
        from: () => selectChain,
        where: () => selectChain,
        limit: async () => mirrorRows,
    };
    const tx = {
        update: () => ({
            set: (payload: any) => ({
                where: async () => {
                    updates.push({ payload });
                },
            }),
        }),
    };
    const db = {
        select: () => selectChain,
        transaction: async (cb: (t: any) => Promise<void>) => {
            await cb(tx);
        },
    };
    return { db, updates };
}

describe("reconcileNetflixMirror", () => {
    it("heals a mirror slot LoadBrain has freed and leaves an in-sync one alone", async () => {
        const { db, updates } = fakeDb([
            { slotId: 1, lbSlotId: "lb-a", localStatus: "VENDU", parentCodeId: 10 },
            { slotId: 2, lbSlotId: "lb-b", localStatus: "VENDU", parentCodeId: 10 },
        ]);

        const seenSlotIds: string[][] = [];
        const getStatesFn = vi.fn(async (input: { siteId: string; slotIds: string[] }): Promise<SlotStateRow[]> => {
            seenSlotIds.push(input.slotIds);
            return [
                { slotId: "lb-a", status: "AVAILABLE", externalOrderRef: null, publicToken: "t1" },
                { slotId: "lb-b", status: "ACTIVE", externalOrderRef: "5-0", publicToken: "t2" },
            ];
        });

        const report = await reconcileNetflixMirror({ database: db, getStatesFn, siteId: "site-uuid" });

        expect(getStatesFn).toHaveBeenCalledTimes(1);
        expect(seenSlotIds[0].sort()).toEqual(["lb-a", "lb-b"]);
        expect(report.checked).toBe(2);
        expect(report.healedToStock).toBe(1); // only lb-a (freed) heals
        expect(report.parentsReenabled).toBe(1);
        expect(report.conflicts).toBe(0);
        expect(report.orphans).toBe(0);
        // two writes: slot flip + parent re-enable
        expect(updates).toHaveLength(2);
    });

    it("reports a conflict (LB ACTIVE but boutique freed) without writing", async () => {
        const { db, updates } = fakeDb([
            { slotId: 9, lbSlotId: "lb-x", localStatus: "DISPONIBLE", parentCodeId: 20 },
        ]);
        const getStatesFn = async (): Promise<SlotStateRow[]> => [
            { slotId: "lb-x", status: "ACTIVE", externalOrderRef: "1-0", publicToken: "t" },
        ];

        const report = await reconcileNetflixMirror({ database: db, getStatesFn, siteId: "site-uuid" });

        expect(report.conflicts).toBe(1);
        expect(report.healedToStock).toBe(0);
        expect(updates).toHaveLength(0); // nothing healed
    });

    it("is a no-op (no LoadBrain call) when there are no LB-mirrored slots", async () => {
        const { db } = fakeDb([]);
        const getStatesFn = vi.fn(async (): Promise<SlotStateRow[]> => []);

        const report = await reconcileNetflixMirror({ database: db, getStatesFn, siteId: "site-uuid" });

        expect(getStatesFn).not.toHaveBeenCalled();
        expect(report).toMatchObject({ checked: 0, healedToStock: 0, conflicts: 0, orphans: 0 });
    });

    it("is a no-op when no siteId is configured", async () => {
        delete process.env.LOADBRAIN_SITE_ID;
        const { db } = fakeDb([{ slotId: 1, lbSlotId: "lb-a", localStatus: "VENDU", parentCodeId: 10 }]);
        const getStatesFn = vi.fn(async (): Promise<SlotStateRow[]> => []);

        const report = await reconcileNetflixMirror({ database: db, getStatesFn });

        expect(getStatesFn).not.toHaveBeenCalled();
        expect(report.checked).toBe(0);
    });
});
