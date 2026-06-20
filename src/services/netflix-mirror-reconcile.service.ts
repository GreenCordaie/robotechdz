/**
 * Boutique mirror ↔ LoadBrain reconciler (P2-5).
 *
 * LoadBrain is the system of record for shared Netflix accounts; the boutique
 * mirror (`digital_code_slots`) is kept in sync by allocate/release webhooks. A
 * missed webhook can leave the two out of step. This reconciler is the pull
 * safety-net: it reads every mirror slot that carries an `lbSlotId`, asks
 * LoadBrain for the authoritative state of those slots (`getSlotStates`), and
 * heals the SAFE divergence — a slot the boutique still holds VENDU that
 * LoadBrain has freed → flip back to DISPONIBLE + re-enable the parent (returns
 * lost inventory, can't cause a double-sell). The dangerous direction (LoadBrain
 * ACTIVE but boutique freed) and orphans are reported, never auto-written.
 *
 * Decision logic lives in the pure planner (`netflix-mirror-reconcile-plan`);
 * this module is the thin DB wrapper around it.
 */
import { db as defaultDb } from "@/db";
import { digitalCodes, digitalCodeSlots } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { DigitalCodeSlotStatus, DigitalCodeStatus } from "@/lib/constants";
import { getSlotStates as defaultGetSlotStates } from "@/services/loadbrain-netflix.client";
import type { GetSlotStatesInput, SlotStateRow } from "@/services/loadbrain-netflix.client";
import { planReconcile } from "@/lib/netflix-mirror-reconcile-plan";
import type { MirrorSlot } from "@/lib/netflix-mirror-reconcile-plan";

export interface ReconcileDeps {
    /** Injectable drizzle db (defaults to @/db). */
    database?: any;
    /** Injectable LoadBrain read client (tests pass a stub). */
    getStatesFn?: (input: GetSlotStatesInput) => Promise<SlotStateRow[]>;
    /** Site id; defaults to LOADBRAIN_SITE_ID env (AGENT007). */
    siteId?: string;
    /** Max mirror slots examined per run (also caps the LoadBrain batch). */
    batchSize?: number;
}

export interface ReconcileReport {
    checked: number;
    healedToStock: number;
    parentsReenabled: number;
    conflicts: number;
    orphans: number;
}

const DEFAULT_BATCH = 500;

export async function reconcileNetflixMirror(
    deps: ReconcileDeps = {},
): Promise<ReconcileReport> {
    const database = deps.database ?? defaultDb;
    const getStatesFn = deps.getStatesFn ?? defaultGetSlotStates;
    const siteId = deps.siteId ?? process.env.LOADBRAIN_SITE_ID;
    const batchSize = deps.batchSize ?? DEFAULT_BATCH;

    const empty: ReconcileReport = {
        checked: 0,
        healedToStock: 0,
        parentsReenabled: 0,
        conflicts: 0,
        orphans: 0,
    };

    // No siteId → LoadBrain integration isn't configured; nothing to reconcile.
    if (!siteId) return empty;

    // 1. Mirror slots that were allocated via LoadBrain (carry an lbSlotId).
    const rows = (await database
        .select({
            slotId: digitalCodeSlots.id,
            lbSlotId: digitalCodeSlots.lbSlotId,
            localStatus: digitalCodeSlots.status,
            parentCodeId: digitalCodeSlots.digitalCodeId,
        })
        .from(digitalCodeSlots)
        .where(isNotNull(digitalCodeSlots.lbSlotId))
        .limit(batchSize)) as MirrorSlot[];

    if (rows.length === 0) return empty;

    // 2. Authoritative LoadBrain state for those slot ids.
    const slotIds = rows.map((r) => r.lbSlotId);
    const states = await getStatesFn({ siteId, slotIds });
    const lbStates = new Map<string, string>(states.map((s) => [s.slotId, s.status]));

    // 3. Plan (pure) then apply the safe heals transactionally.
    const plan = planReconcile(rows, lbStates);

    if (plan.healToStock.length > 0 || plan.parentsToReenable.length > 0) {
        await database.transaction(async (tx: any) => {
            if (plan.healToStock.length > 0) {
                await tx
                    .update(digitalCodeSlots)
                    .set({
                        status: DigitalCodeSlotStatus.DISPONIBLE,
                        orderItemId: null,
                        activationUrl: null,
                    })
                    .where(inArray(digitalCodeSlots.id, plan.healToStock));
            }
            if (plan.parentsToReenable.length > 0) {
                await tx
                    .update(digitalCodes)
                    .set({
                        status: DigitalCodeStatus.DISPONIBLE,
                        isDebitCompleted: false,
                    })
                    .where(
                        and(
                            inArray(digitalCodes.id, plan.parentsToReenable),
                            eq(digitalCodes.status, DigitalCodeStatus.VENDU),
                        ),
                    );
            }
        });
    }

    if (plan.conflicts.length > 0 || plan.orphans.length > 0) {
        console.warn(
            `[netflix-reconcile] conflicts=${plan.conflicts.length} orphans=${plan.orphans.length}`,
            { conflicts: plan.conflicts, orphans: plan.orphans },
        );
    }

    return {
        checked: plan.checked,
        healedToStock: plan.healToStock.length,
        parentsReenabled: plan.parentsToReenable.length,
        conflicts: plan.conflicts.length,
        orphans: plan.orphans.length,
    };
}
