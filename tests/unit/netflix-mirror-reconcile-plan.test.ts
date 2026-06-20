import { describe, it, expect } from "vitest";
import { planReconcile } from "@/lib/netflix-mirror-reconcile-plan";
import type { MirrorSlot } from "@/lib/netflix-mirror-reconcile-plan";

/**
 * planReconcile is pure: given the local mirror slots (those carrying an
 * lbSlotId) and the authoritative LoadBrain state per lbSlotId, it decides what
 * to heal — WITHOUT touching a database. LoadBrain is authoritative.
 *
 * Mapping: LoadBrain ACTIVE ↔ boutique VENDU; any other LB status
 * (AVAILABLE/REFUNDED/CANCELLED/RECLAIMED) ↔ boutique DISPONIBLE (free).
 */

function slot(over: Partial<MirrorSlot>): MirrorSlot {
    return {
        slotId: 1,
        lbSlotId: "lb-1",
        localStatus: "VENDU",
        parentCodeId: 10,
        ...over,
    };
}

describe("planReconcile", () => {
    it("heals a boutique-VENDU slot that LoadBrain has already freed", () => {
        const mirror = [slot({ slotId: 1, lbSlotId: "lb-1", localStatus: "VENDU", parentCodeId: 10 })];
        const lb = new Map([["lb-1", "AVAILABLE"]]);

        const plan = planReconcile(mirror, lb);

        expect(plan.healToStock).toEqual([1]);
        expect(plan.parentsToReenable).toEqual([10]);
        expect(plan.conflicts).toEqual([]);
        expect(plan.orphans).toEqual([]);
        expect(plan.checked).toBe(1);
    });

    it("treats REFUNDED/CANCELLED/RECLAIMED as freed (heals VENDU mirror)", () => {
        const mirror = [
            slot({ slotId: 1, lbSlotId: "a", localStatus: "VENDU", parentCodeId: 10 }),
            slot({ slotId: 2, lbSlotId: "b", localStatus: "VENDU", parentCodeId: 10 }),
            slot({ slotId: 3, lbSlotId: "c", localStatus: "VENDU", parentCodeId: 11 }),
        ];
        const lb = new Map([
            ["a", "REFUNDED"],
            ["b", "CANCELLED"],
            ["c", "RECLAIMED"],
        ]);

        const plan = planReconcile(mirror, lb);

        expect(plan.healToStock).toEqual([1, 2, 3]);
        // parent ids deduped
        expect(plan.parentsToReenable.sort()).toEqual([10, 11]);
    });

    it("does nothing when local and LoadBrain agree (ACTIVE↔VENDU, freed↔DISPONIBLE)", () => {
        const mirror = [
            slot({ slotId: 1, lbSlotId: "a", localStatus: "VENDU" }),
            slot({ slotId: 2, lbSlotId: "b", localStatus: "DISPONIBLE" }),
        ];
        const lb = new Map([
            ["a", "ACTIVE"],
            ["b", "AVAILABLE"],
        ]);

        const plan = planReconcile(mirror, lb);

        expect(plan.healToStock).toEqual([]);
        expect(plan.parentsToReenable).toEqual([]);
        expect(plan.conflicts).toEqual([]);
        expect(plan.orphans).toEqual([]);
        expect(plan.checked).toBe(2);
    });

    it("flags a conflict when LoadBrain is ACTIVE but the boutique freed the slot (double-sell risk)", () => {
        const mirror = [slot({ slotId: 5, lbSlotId: "x", localStatus: "DISPONIBLE", parentCodeId: 20 })];
        const lb = new Map([["x", "ACTIVE"]]);

        const plan = planReconcile(mirror, lb);

        // NOT auto-healed (we won't blind-flip to VENDU without an order) — reported.
        expect(plan.healToStock).toEqual([]);
        expect(plan.conflicts).toEqual([{ slotId: 5, lbSlotId: "x" }]);
    });

    it("flags an orphan when LoadBrain has no state for the lbSlotId", () => {
        const mirror = [slot({ slotId: 7, lbSlotId: "gone", localStatus: "VENDU", parentCodeId: 30 })];
        const lb = new Map<string, string>(); // empty → nothing known

        const plan = planReconcile(mirror, lb);

        expect(plan.orphans).toEqual([{ slotId: 7, lbSlotId: "gone" }]);
        expect(plan.healToStock).toEqual([]);
    });

    it("does not re-enable a parent twice and skips null parents", () => {
        const mirror = [
            slot({ slotId: 1, lbSlotId: "a", localStatus: "VENDU", parentCodeId: 10 }),
            slot({ slotId: 2, lbSlotId: "b", localStatus: "VENDU", parentCodeId: 10 }),
            slot({ slotId: 3, lbSlotId: "c", localStatus: "VENDU", parentCodeId: null }),
        ];
        const lb = new Map([
            ["a", "AVAILABLE"],
            ["b", "AVAILABLE"],
            ["c", "AVAILABLE"],
        ]);

        const plan = planReconcile(mirror, lb);

        expect(plan.healToStock).toEqual([1, 2, 3]);
        expect(plan.parentsToReenable).toEqual([10]);
    });
});
