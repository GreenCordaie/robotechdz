import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * P2-6 — Sale authority (anti-désync) end-to-end.
 *
 * Proves the P2 invariant: with LB_NETFLIX_AUTHORITATIVE on, LoadBrain is the
 * single allocation authority at sale/refund time, so a shared Netflix profile
 * can never be double-sold, and a refund/cancel returns the slot to BOTH the
 * boutique mirror and the LoadBrain pool.
 *
 * ── What runs where ──────────────────────────────────────────────────────────
 *  • Scenario 3 (anti-double-sell) is ALSO proven, runnable & GREEN, at the
 *    authoritative layer — LoadBrain integration test
 *    `modules/netflix/tests/integration/slot-allocate-route.test.ts`
 *    ("anti-double-sell: two concurrent allocations on a 1-slot pool"). Two
 *    concurrent /internal/slot/allocate on a 1-slot pool → exactly one 201, one
 *    409, via FOR UPDATE SKIP LOCKED. That is the core guarantee; the boutique
 *    sale path delegates to it.
 *  • Scenarios 1/2/4 below drive the FULL stack (boutique dev server + LoadBrain
 *    netflix + both DBs + Redis) through a real purchase. They are marked
 *    `test.fixme` until the cross-DB sale-authority fixture exists, so CI stays
 *    green and nothing claims a pass it didn't run. Flip them on once the
 *    prerequisites below are met.
 *
 * ── Prerequisites (operator) ─────────────────────────────────────────────────
 *  1. LoadBrain netflix running, reachable at LOADBRAIN_URL, with INTERNAL token.
 *  2. A seed creating a MIRRORED shared account on BOTH systems:
 *       - LoadBrain: netflix.accounts + N AVAILABLE netflix.slots (public_token
 *         = the boutique slot's activation token; site = AGENT007's siteId).
 *       - Boutique: a digital_codes row (status DISPONIBLE, lb_account_id set to
 *         the LoadBrain account id) + matching digital_code_slots, plus a kiosk
 *         product/variant with isSharing=true bound to that variant.
 *     (To be added: scripts/seed-netflix-sale-authority-e2e.js.)
 *  3. Flag ON: shop_settings.lb_netflix_authoritative = true.
 *  4. Boutique dev server on :4555 pointed at the flexbox DB, with
 *     LOADBRAIN_URL + LOADBRAIN_INTERNAL_TOKEN (+ LOADBRAIN_SITE_ID=AGENT007's
 *     uuid) set so allocate/release/getSlotStates reach LoadBrain.
 *  5. Run opted-in:  E2E_SALE_AUTHORITY=1 npx playwright test tests/e2e/16-netflix-sale-authority.spec.ts
 *
 * The whole describe is skipped unless E2E_SALE_AUTHORITY is set, so no
 * half-configured run produces a misleading red/green.
 */

const ENABLED = !!process.env.E2E_SALE_AUTHORITY;

const LB_URL = (process.env.LOADBRAIN_URL ?? "").replace(/\/$/, "");
const LB_INTERNAL_TOKEN = process.env.LOADBRAIN_INTERNAL_TOKEN ?? "";
const LB_SITE_ID = process.env.LOADBRAIN_SITE_ID ?? "";
// A LoadBrain account id (uuid) with exactly ONE AVAILABLE slot, provided by the
// seed. Required only by the directly-runnable anti-double-sell probe below.
const LB_ONE_SLOT_ACCOUNT = process.env.E2E_LB_ONE_SLOT_ACCOUNT ?? "";

/** POST to LoadBrain's internal allocate route (server-to-server). */
async function allocate(
    request: APIRequestContext,
    ref: string,
): Promise<{ status: number; body: any }> {
    const res = await request.post(`${LB_URL}/internal/slot/allocate`, {
        headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": LB_INTERNAL_TOKEN,
        },
        data: {
            siteId: LB_SITE_ID,
            accountId: LB_ONE_SLOT_ACCOUNT,
            externalOrderRef: ref,
            customerPhone: "+213700000000",
        },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
}

test.describe("Netflix sale authority (P2)", () => {
    test.skip(!ENABLED, "set E2E_SALE_AUTHORITY=1 (and the prerequisites) to run");

    /**
     * Scenario 3 — anti-double-sell, driven against the authoritative layer the
     * boutique sale path delegates to. Two concurrent allocations on a 1-slot
     * pool: exactly one 201, one 409. Runnable as soon as LoadBrain + a 1-slot
     * account are reachable (no boutique purchase needed).
     */
    test("anti-double-sell: concurrent allocations on a 1-slot pool — exactly one wins", async ({
        request,
    }) => {
        test.skip(
            !LB_URL || !LB_INTERNAL_TOKEN || !LB_SITE_ID || !LB_ONE_SLOT_ACCOUNT,
            "needs LOADBRAIN_URL + LOADBRAIN_INTERNAL_TOKEN + LOADBRAIN_SITE_ID + E2E_LB_ONE_SLOT_ACCOUNT",
        );

        const [a, b] = await Promise.all([
            allocate(request, `e2e-race-A-${Date.now()}`),
            allocate(request, `e2e-race-B-${Date.now()}`),
        ]);

        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual([201, 409]);

        const winner = a.status === 201 ? a : b;
        const loser = a.status === 201 ? b : a;
        expect(winner.body?.slotId).toBeTruthy();
        expect(loser.body).toEqual({ error: "out_of_stock" });
    });

    /**
     * Scenario 1 — a kiosk purchase of an isSharing variant (flag ON) allocates
     * the slot via LoadBrain (not a local pick); the delivered creds + activation
     * token render, and the boutique mirror reflects the LoadBrain slot
     * (digital_code_slots VENDU + lb_slot_id set). Needs the sale-driving harness
     * + cross-DB fixture.
     */
    test.fixme("purchase routes allocation through LoadBrain + mirror reflects it", async () => {
        // Drive: seed → kiosk checkout of the isSharing variant → payOrder.
        // Assert: order delivered; the assigned digital_code_slots row is VENDU
        // with lb_slot_id NOT NULL; the LoadBrain slot for that lb_slot_id is
        // ACTIVE (GET via /internal/slot/states); activation token + creds shown.
    });

    /**
     * Scenario 2 — refunding that order releases the slot in BOTH systems: the
     * boutique mirror returns to DISPONIBLE and LoadBrain frees the slot
     * (status back to AVAILABLE). Idempotent.
     */
    test.fixme("refund returns the slot to stock locally AND releases it in LoadBrain", async () => {
        // Drive: refundFullOrder on the order from scenario 1.
        // Assert: mirror slot DISPONIBLE + parent DISPONIBLE; LoadBrain
        // /internal/slot/states for that lb_slot_id reports a freed status
        // (AVAILABLE), proving the post-commit releaseRefundedLbSlots fired.
    });

    /**
     * Scenario 4 — degraded mode: LoadBrain unreachable at sale time. The sale
     * must FAIL CLOSED (no local pick that could double-sell) → the item falls to
     * manual delivery, no second debit. When LoadBrain is back, the reconciler
     * leaves money untouched and only realigns slot state.
     */
    test.fixme("LoadBrain down → fail-closed to manual delivery, no double debit", async () => {
        // Drive: point LOADBRAIN_URL at an unreachable host (or stop LB), then
        // checkout the isSharing variant. Assert: no local slot marked VENDU for
        // the item; order shows manual-delivery; wallet/cash debited exactly once.
        // Then restore LB + run the reconciler: no money movement, slot state
        // realigns (LoadBrain authoritative).
    });
});
