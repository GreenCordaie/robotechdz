/**
 * Pure reconciliation planner for the boutique mirror ↔ LoadBrain (P2-5).
 *
 * LoadBrain is the system of record for shared Netflix accounts. The boutique
 * mirror (`digital_code_slots`) is kept in sync by allocate/release webhooks,
 * but a missed webhook can leave the two out of step. This planner takes the
 * local mirror slots that carry an `lbSlotId` plus the authoritative LoadBrain
 * status per `lbSlotId`, and decides what to heal — with NO database access, so
 * it is fully unit-testable. The DB wrapper (service) reads the mirror, calls
 * LoadBrain, runs this planner, and applies the result.
 *
 * Status mapping:
 *   - LoadBrain `ACTIVE`            ↔ boutique `VENDU`     (sold / in use)
 *   - LoadBrain anything else       ↔ boutique `DISPONIBLE` (free):
 *       AVAILABLE / REFUNDED / CANCELLED / RECLAIMED are all "freed" — the slot
 *       can be re-sold, so the boutique should show it DISPONIBLE.
 *
 * Heal direction (LoadBrain wins), only the SAFE direction is automated:
 *   - boutique VENDU but LoadBrain freed  → flip mirror DISPONIBLE + re-enable
 *     parent (returns lost inventory; cannot cause a double-sell).
 *   - LoadBrain ACTIVE but boutique freed → CONFLICT, reported only: blindly
 *     flipping to VENDU without an order item would fabricate a sale, so a human
 *     resolves it.
 *   - lbSlotId unknown to LoadBrain       → ORPHAN, reported only.
 */
import { DigitalCodeSlotStatus } from "@/lib/constants";

export interface MirrorSlot {
    /** local digital_code_slots.id */
    slotId: number;
    /** LoadBrain slot id stored on the mirror row */
    lbSlotId: string;
    /** local status (VENDU | DISPONIBLE | …) */
    localStatus: string;
    /** parent digital_codes.id (shared account), null if unknown */
    parentCodeId: number | null;
}

export interface ReconcilePlan {
    /** local slot ids to flip back to DISPONIBLE */
    healToStock: number[];
    /** parent digital_codes ids to re-enable (VENDU → DISPONIBLE), deduped */
    parentsToReenable: number[];
    /** LoadBrain ACTIVE but boutique free — double-sell risk, reported only */
    conflicts: { slotId: number; lbSlotId: string }[];
    /** lbSlotId LoadBrain doesn't know — reported only */
    orphans: { slotId: number; lbSlotId: string }[];
    /** total mirror slots examined */
    checked: number;
}

const LB_ACTIVE = "ACTIVE";

export function planReconcile(
    mirror: MirrorSlot[],
    lbStates: Map<string, string>,
): ReconcilePlan {
    const healToStock: number[] = [];
    const parentSet = new Set<number>();
    const conflicts: { slotId: number; lbSlotId: string }[] = [];
    const orphans: { slotId: number; lbSlotId: string }[] = [];

    for (const s of mirror) {
        const lbStatus = lbStates.get(s.lbSlotId);

        if (lbStatus === undefined) {
            orphans.push({ slotId: s.slotId, lbSlotId: s.lbSlotId });
            continue;
        }

        if (lbStatus === LB_ACTIVE) {
            // LoadBrain still holds it sold. Only a conflict if the boutique
            // already freed it (would re-sell a slot LoadBrain thinks is taken).
            if (s.localStatus !== DigitalCodeSlotStatus.VENDU) {
                conflicts.push({ slotId: s.slotId, lbSlotId: s.lbSlotId });
            }
            continue;
        }

        // LoadBrain freed the slot. If the boutique still holds it VENDU, heal.
        if (s.localStatus === DigitalCodeSlotStatus.VENDU) {
            healToStock.push(s.slotId);
            if (s.parentCodeId != null) parentSet.add(s.parentCodeId);
        }
    }

    return {
        healToStock,
        parentsToReenable: Array.from(parentSet),
        conflicts,
        orphans,
        checked: mirror.length,
    };
}
