/**
 * LoadBrain slot-release on refund/cancel/return (P2-4).
 *
 * When the sale path allocated a shared-streaming slot via LoadBrain (the
 * system-of-record), the boutique's refund/cancel/return paths already flip the
 * LOCAL mirror slot back to DISPONIBLE. But LoadBrain still holds that slot
 * SOLD → the pool desyncs (the freed profile can never be re-allocated). This
 * module tells LoadBrain to release those slots back to its pool.
 *
 * Design invariants:
 *  - FAIL-SOFT: the money refund has ALREADY committed before this runs. A
 *    LoadBrain hiccup must NEVER throw/roll back the refund. We swallow errors
 *    and report counts; a later reconcile pass (P2-5) can re-run safely.
 *  - IDEMPOTENT: LoadBrain release is keyed by (siteId, externalOrderRef) and is
 *    safe to repeat. Re-running this helper is a no-op once LoadBrain has freed
 *    the slot.
 *  - REF MIRRORS THE ALLOCATOR: `externalOrderRef = `${orderItemId}-${unitIndex}``
 *    (see loadbrain-netflix-allocation). Allocation fills units contiguously
 *    (0..N-1), fully or not at all, so releasing refs 0..lbSlotCount-1 matches
 *    exactly the units that were claimed. A non-migrated / token-less slot has
 *    lbSlotCount 0 and is skipped.
 */
import {
    releaseSlot as defaultReleaseSlot,
} from "@/services/loadbrain-netflix.client";
import type { ReleaseSlotInput, ReleaseSlotResult } from "@/services/loadbrain-netflix.client";

export interface LbReleaseItem {
    /** orderItemId — the per-unit externalOrderRef base. */
    orderItemId: number;
    /** count of freed slots that were LoadBrain-allocated (had a non-null lbSlotId). */
    lbSlotCount: number;
}

export interface LbReleaseDeps {
    /** Injectable LoadBrain client (tests pass a spy). */
    releaseFn?: (input: ReleaseSlotInput) => Promise<ReleaseSlotResult>;
    /** Site id; defaults to LOADBRAIN_SITE_ID env (AGENT007). */
    siteId?: string;
    /** Audit reason forwarded to LoadBrain. */
    reason?: string;
}

export interface LbReleaseSummary {
    released: number;
    failed: number;
}

/**
 * Best-effort release of LoadBrain-allocated slots freed by a refund/cancel/
 * return. Never throws. See file header for invariants.
 */
export async function releaseRefundedLbSlots(
    items: LbReleaseItem[],
    deps: LbReleaseDeps = {},
): Promise<LbReleaseSummary> {
    const releaseFn = deps.releaseFn ?? defaultReleaseSlot;
    const siteId = deps.siteId ?? process.env.LOADBRAIN_SITE_ID;
    const reason = deps.reason ?? "refund";

    let released = 0;
    let failed = 0;

    // No siteId → LoadBrain integration isn't configured here. Nothing to
    // release; not an error (boutique may run standalone).
    if (!siteId) {
        return { released, failed };
    }

    for (const item of items) {
        for (let i = 0; i < item.lbSlotCount; i++) {
            try {
                await releaseFn({
                    siteId,
                    externalOrderRef: `${item.orderItemId}-${i}`,
                    reason,
                });
                released++;
            } catch (err: unknown) {
                failed++;
                console.error(
                    `[lb-release] item ${item.orderItemId} unit ${i} release failed`,
                    err instanceof Error ? err.message : String(err),
                );
            }
        }
    }

    return { released, failed };
}
