import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * P3-5 — Pure replica: two-console sync + centralized device-quota.
 *
 * Proves the P3 end state: LoadBrain is the single source of truth, the boutique
 * is a 100% functional replica. Admin mutations proxy to LoadBrain (and changes
 * made in the LoadBrain dashboard flow back via webhook), and the
 * anti-link-sharing device-quota is enforced by LoadBrain's authoritative
 * usage_count.
 *
 * ── What runs where ──────────────────────────────────────────────────────────
 *  • The authoritative device-cap is ALSO proven, runnable & GREEN, at the
 *    LoadBrain layer — `modules/netflix/tests/integration/slot-device-bump-route.test.ts`
 *    ("anti-overuse: two concurrent bumps on the LAST credit — exactly one wins").
 *    That FOR UPDATE-guarded increment is the core guarantee; the boutique
 *    /activer gate (P3-2) delegates to it via POST /internal/slot/:id/device-bump.
 *  • The scenarios below drive the FULL stack (boutique dev server + LoadBrain
 *    netflix + both DBs + Redis) and are `test.fixme` until run on a live stack.
 *    The cross-DB fixture ships as `scripts/seed-netflix-sale-authority-e2e.js`
 *    (proven idempotent) — use E2E_SA_MAX_DEVICES to set the cap.
 *
 * ── Prerequisites (operator) ─────────────────────────────────────────────────
 *  1. LoadBrain netflix reachable at LOADBRAIN_URL + INTERNAL token; deployed
 *     with the P2/P3 internal routes (/internal/slot/states, /device-bump,
 *     /quota).
 *  2. Seed the mirrored fixture:
 *       DATABASE_URL=<flexbox> LOADBRAIN_DATABASE_URL=<netflix> \
 *       ENCRYPTION_KEY=<boutique> LOADBRAIN_SITE_ID=<uuid> \
 *       E2E_SA_SLOTS=1 E2E_SA_MAX_DEVICES=2 \
 *       node scripts/seed-netflix-sale-authority-e2e.js
 *  3. Flag ON: shop_settings.lb_netflix_authoritative = true.
 *  4. Boutique dev server on :4555 with LOADBRAIN_URL + LOADBRAIN_INTERNAL_TOKEN
 *     + LOADBRAIN_SITE_ID set.
 *  5. Run opted-in:  E2E_PURE_REPLICA=1 npx playwright test tests/e2e/17-netflix-pure-replica.spec.ts
 */

const ENABLED = !!process.env.E2E_PURE_REPLICA;

const LB_URL = (process.env.LOADBRAIN_URL ?? "").replace(/\/$/, "");
const LB_INTERNAL_TOKEN = process.env.LOADBRAIN_INTERNAL_TOKEN ?? "";
const LB_SITE_ID = process.env.LOADBRAIN_SITE_ID ?? "";
// A LoadBrain slot id (uuid) with max_uses=1 and usage_count=0, from the seed.
const LB_ONE_USE_SLOT = process.env.E2E_LB_ONE_USE_SLOT ?? "";

/** POST to LoadBrain's internal device-bump route (server-to-server). */
async function deviceBump(
    request: APIRequestContext,
    slotId: string,
): Promise<{ status: number; body: any }> {
    const res = await request.post(`${LB_URL}/internal/slot/${slotId}/device-bump`, {
        headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": LB_INTERNAL_TOKEN,
        },
        data: { siteId: LB_SITE_ID, debounceMinutes: 0 },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
}

test.describe("Netflix pure replica (P3)", () => {
    test.skip(!ENABLED, "set E2E_PURE_REPLICA=1 (and the prerequisites) to run");

    /**
     * Scenario 3 — centralized device-quota, driven against the authoritative
     * layer the boutique /activer gate delegates to. On a max_uses=1 slot: the
     * first device-bump succeeds (remaining 0), a concurrent/second bump on the
     * last credit gets 409 quota_exhausted. Runnable as soon as LoadBrain + a
     * 1-use slot are reachable (no browser needed).
     */
    test("device-quota: the N+1th device is blocked by LoadBrain authority", async ({ request }) => {
        test.skip(
            !LB_URL || !LB_INTERNAL_TOKEN || !LB_SITE_ID || !LB_ONE_USE_SLOT,
            "needs LOADBRAIN_URL + LOADBRAIN_INTERNAL_TOKEN + LOADBRAIN_SITE_ID + E2E_LB_ONE_USE_SLOT",
        );

        const first = await deviceBump(request, LB_ONE_USE_SLOT);
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({ ok: true, remaining: 0 });

        const second = await deviceBump(request, LB_ONE_USE_SLOT);
        expect(second.status).toBe(409);
        expect(second.body).toMatchObject({ ok: false, reason: "quota_exhausted" });
    });

    /**
     * Scenario 1 — an edit made in the LoadBrain dashboard flows back to the
     * boutique via webhook and is reflected in /admin/comptes-partages.
     */
    test.fixme("LoadBrain-side account edit propagates to the boutique mirror", async () => {
        // Drive: PATCH the account/slot in LoadBrain (or emit the mirror webhook).
        // Assert: /admin/comptes-partages (or the mirror row) reflects the change.
    });

    /**
     * Scenario 2 — an edit made in the boutique admin proxies to LoadBrain and is
     * visible there. Covered for the device-cap by P3-3 (updateSharedAccount →
     * PATCH /internal/slot/:id/quota); this asserts the round-trip on a live slot.
     */
    test.fixme("boutique admin slot-cap edit is visible in LoadBrain (max_uses)", async () => {
        // Drive: updateSharedAccount with a new maxDevices for a seeded LB slot.
        // Assert: GET /internal/slot/states (or admin/slots) shows the new max_uses.
    });

    /**
     * Scenario 4 — sale/refund stay green (P2) in default-on mode (flag ON), so
     * the boutique remains 100% functional as a pure replica.
     */
    test.fixme("sale + refund stay green with the flag ON (replica functional)", async () => {
        // Drive: kiosk checkout of the seeded isSharing variant → deliver → refund.
        // Assert: allocation via LoadBrain, mirror coherent, refund releases both
        // sides — the operator/customer flows are unchanged vs flag-off.
    });
});
