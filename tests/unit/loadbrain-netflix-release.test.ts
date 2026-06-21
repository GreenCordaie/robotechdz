import { describe, it, expect, vi, beforeEach } from "vitest";
// The helper imports the LoadBrain client which (transitively via the barrel)
// can pull in @/db, whose module throws "DATABASE_URL must be set" at import
// time. Stub @/db so this pure-logic test loads without a real database (same
// pattern as loadbrain-netflix-allocation.test).
vi.mock("@/db", () => ({ db: {} }));

import { releaseRefundedLbSlots } from "@/lib/loadbrain-netflix-release";
import type { ReleaseSlotInput, ReleaseSlotResult } from "@/services/loadbrain-netflix.client";

beforeEach(() => {
    process.env.LOADBRAIN_SITE_ID = "AGENT007";
});

/** A spy releaseFn that records the inputs it was called with and resolves ok. */
function okRelease() {
    const calls: ReleaseSlotInput[] = [];
    const fn = vi.fn(async (input: ReleaseSlotInput): Promise<ReleaseSlotResult> => {
        calls.push(input);
        return { released: true, slotId: `slot-for-${input.externalOrderRef}` };
    });
    return { fn, calls };
}

describe("releaseRefundedLbSlots", () => {
    it("releases one ref per LB-allocated unit, ref = `${orderItemId}-${i}`", async () => {
        const { fn, calls } = okRelease();

        const summary = await releaseRefundedLbSlots(
            [{ orderItemId: 42, lbSlotCount: 2 }],
            { releaseFn: fn, siteId: "AGENT007" },
        );

        expect(summary).toEqual({ released: 2, failed: 0 });
        expect(calls.map((c) => c.externalOrderRef)).toEqual(["42-0", "42-1"]);
        expect(calls.every((c) => c.siteId === "AGENT007")).toBe(true);
    });

    it("skips items with no LB-allocated slots (lbSlotCount 0)", async () => {
        const { fn } = okRelease();

        const summary = await releaseRefundedLbSlots(
            [{ orderItemId: 7, lbSlotCount: 0 }],
            { releaseFn: fn, siteId: "AGENT007" },
        );

        expect(summary).toEqual({ released: 0, failed: 0 });
        expect(fn).not.toHaveBeenCalled();
    });

    it("never throws when the LoadBrain client rejects — counts failures (fail-soft)", async () => {
        const fn = vi.fn(async (): Promise<ReleaseSlotResult> => {
            throw new Error("LB down");
        });

        const summary = await releaseRefundedLbSlots(
            [{ orderItemId: 9, lbSlotCount: 3 }],
            { releaseFn: fn, siteId: "AGENT007" },
        );

        expect(summary).toEqual({ released: 0, failed: 3 });
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("is a no-op when no siteId is configured (LB integration absent)", async () => {
        delete process.env.LOADBRAIN_SITE_ID;
        const { fn } = okRelease();

        const summary = await releaseRefundedLbSlots(
            [{ orderItemId: 1, lbSlotCount: 2 }],
            { releaseFn: fn },
        );

        expect(summary).toEqual({ released: 0, failed: 0 });
        expect(fn).not.toHaveBeenCalled();
    });

    it("handles multiple items independently", async () => {
        const { fn, calls } = okRelease();

        const summary = await releaseRefundedLbSlots(
            [
                { orderItemId: 5, lbSlotCount: 1 },
                { orderItemId: 6, lbSlotCount: 2 },
            ],
            { releaseFn: fn, siteId: "AGENT007" },
        );

        expect(summary).toEqual({ released: 3, failed: 0 });
        expect(calls.map((c) => c.externalOrderRef)).toEqual(["5-0", "6-0", "6-1"]);
    });
});
