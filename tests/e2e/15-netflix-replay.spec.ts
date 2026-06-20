import { test, expect, type APIRequestContext } from "@playwright/test";
import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import postgres from "postgres";

/**
 * P1 END-TO-END — REPLAY of a webhook-captured OTP delivered BEFORE the page opens.
 *
 * This is the inverse of tests/e2e/14-netflix-activation-webhook.spec.ts. Test 14
 * proves the LIVE path (subscriber attached first, THEN webhook). This spec proves
 * the P1-2 REPLAY fix:
 *
 *   signed `code.captured` webhook arrives FIRST (no SSE subscriber yet)
 *     → applyNetflixWebhook persists a slot_events row (encrypted, dedup on
 *       (digital_code_id, source_email_id) via onConflictDoNothing) BEFORE publishing
 *         → the live publish reaches nobody (page not open yet) — that's fine
 *   THEN the customer opens /activer/[token]
 *     → GET /api/activer/[token]/events replays undelivered slot_events on connect
 *       (decrypts, exactly-once-guarded UPDATE), gated by the `?since` window
 *         → /activer/[token] (ActivationClient) renders the OTP from the replay
 *
 * Before the P1-2 fix, a webhook-delivered code was LIVE-ONLY: if it arrived a beat
 * before the page connected, it was lost. This test fails on the old code and passes
 * on the new persist-then-publish-then-replay path.
 *
 * ── Window timing (why this works) ───────────────────────────────────────────
 * The SSE route derives windowStart = `since` (page-open instant the client stamps)
 * minus a 30s WINDOW_BUFFER_MS, and only replays slot_events with
 * receivedAt >= windowStart. We POST the webhook with timestamp = now, then open the
 * page ~1-2s later, so the event's receivedAt sits comfortably inside the 30s window.
 *
 * ── Prerequisites (operator) ─────────────────────────────────────────────────
 *  1. The boutique DB (flexbox @5435) must be reachable; .env provides
 *     DATABASE_URL + ENCRYPTION_KEY + LOADBRAIN_WEBHOOK_SECRET.
 *  2. Start the app on :4555 against the SAME DB, with the webhook secret set:
 *       npx next dev -p 4555            (loads .env automatically)
 *  3. Run with the SAME secret the server uses, exported in the test env:
 *       LOADBRAIN_WEBHOOK_SECRET=<secret> npx playwright test tests/e2e/15-netflix-replay.spec.ts --reporter=list
 *
 * No secret is hardcoded: the test reads LOADBRAIN_WEBHOOK_SECRET from its own env
 * and skips the whole describe block when it is absent (CI stays green).
 */

// ── Minimal .env loader (no dotenv dep) — only fills vars not already in env. ──
// Playwright does not auto-load .env; the seed script and `next dev` do. We mirror
// the seed's loader so a local `npx playwright test` finds DATABASE_URL / keys
// without the operator having to export them by hand. The file is gitignored; we
// never hardcode any secret here.
function loadDotEnv(): void {
    try {
        const envPath = path.resolve(__dirname, "..", "..", ".env");
        const raw = fs.readFileSync(envPath, "utf8");
        for (const line of raw.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
            if (!m) continue;
            const key = m[1];
            if (process.env[key]) continue; // explicit env wins
            let val = m[2].trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    } catch {
        // .env optional when env already injected
    }
}
loadDotEnv();

// Fixed token used by the seed fixture. ≤16 chars (column is varchar(16)).
const TOKEN = process.env.E2E_NF_TOKEN || "E2E-NF-TOK-001";

// Must match the running server's LOADBRAIN_WEBHOOK_SECRET. NEVER hardcode — read
// from env only. When absent, the describe block below is skipped.
const SECRET = process.env.LOADBRAIN_WEBHOOK_SECRET ?? "";

// DISTINCT OTP + codeId from test 14 (482913 / random uuid) so the two specs can
// never collide on the (digital_code_id, source_email_id) dedup index.
const OTP = "571904";
const CODE_ID = "e2e-replay-571904";
const WEBHOOK_PATH = "/api/loadbrain/netflix/webhook";

/** Build the signed headers + raw body for a code.captured delivery. */
function signedDelivery(opts: {
    token: string;
    type?: "OTP_CODE" | "HOUSEHOLD_LINK";
    value: string;
    codeId: string;
    timestamp?: string;
    secret?: string;
    deliveryId?: string;
}): { body: string; headers: Record<string, string> } {
    const body = JSON.stringify({
        event: "code.captured",
        payload: {
            publicToken: opts.token,
            type: opts.type ?? "OTP_CODE",
            value: opts.value,
            timestamp: opts.timestamp ?? new Date().toISOString(),
            // codeId is used by the mirror as sourceEmailId for the dedup key.
            codeId: opts.codeId,
        },
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig =
        "sha256=" +
        crypto
            .createHmac("sha256", opts.secret ?? SECRET)
            .update(`${ts}.${body}`)
            .digest("hex");
    return {
        body,
        headers: {
            "Content-Type": "application/json",
            "x-loadbrain-signature": sig,
            "x-loadbrain-timestamp": ts,
            "x-loadbrain-delivery-id": opts.deliveryId ?? `e2e-replay-${crypto.randomUUID()}`,
        },
    };
}

async function postWebhook(
    request: APIRequestContext,
    delivery: { body: string; headers: Record<string, string> },
) {
    return request.post(WEBHOOK_PATH, {
        headers: delivery.headers,
        data: delivery.body,
    });
}

/**
 * Resolve the seeded slot id for TOKEN and DELETE only its slot_events rows.
 * Scoped strictly to this test's slot — never touches other accounts/slots.
 * Returns the slot id (null if the fixture isn't seeded). Best-effort: a DB
 * hiccup must not crash the suite, so callers tolerate a null/throw upstream.
 */
async function cleanSlotEventsForToken(): Promise<number | null> {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return null;
    const sql = postgres(dbUrl, { max: 1 });
    try {
        const rows = await sql<{ slot_id: number }[]>`
            SELECT s.id AS slot_id
            FROM slot_activation_tokens t
            JOIN digital_code_slots s ON s.id = t.slot_id
            WHERE t.token = ${TOKEN}
        `;
        const slotId = rows[0]?.slot_id ?? null;
        if (slotId != null) {
            // Scoped to THIS slot only — leaves test 14's rows (different slot
            // after its own reseed, or same slot but wiped by its own seed run)
            // and every other account untouched.
            await sql`DELETE FROM slot_events WHERE slot_id = ${slotId}`;
        }
        return slotId;
    } finally {
        await sql.end();
    }
}

test.describe("Netflix activation — REPLAY: webhook before page-open still delivers OTP", () => {
    // No secret in env ⇒ nothing to sign with. Skip rather than hardcode one.
    test.skip(
        !process.env.LOADBRAIN_WEBHOOK_SECRET,
        "LOADBRAIN_WEBHOOK_SECRET required (export it to run this E2E)",
    );

    test.beforeAll(() => {
        // Re-run the idempotent seed so the slot/token exist and the slot's
        // slot_events start clean (the seed DELETEs slot_events for the slot).
        // Inherits DATABASE_URL + ENCRYPTION_KEY from env (loaded above / by op).
        try {
            execFileSync("node", ["scripts/seed-netflix-activation-e2e.js"], {
                cwd: path.resolve(__dirname, "..", ".."),
                stdio: "pipe",
                env: process.env,
            });
        } catch (err) {
            // If the seed can't run (no DB), the navigation step will surface a
            // clear failure; don't mask it here.
            console.error("[15-replay] seed failed:", (err as Error)?.message);
        }
    });

    test.beforeEach(async () => {
        // Guarantee a clean replay window for THIS slot before each attempt so a
        // re-run inside the same server session doesn't see an already-delivered
        // row. Scoped to the test slot only.
        await cleanSlotEventsForToken();
    });

    test("code.captured persisted before page-open is replayed on SSE connect", async ({
        page,
        request,
    }) => {
        // 1. POST the signed webhook FIRST — no SSE subscriber is attached yet.
        //    With persist-then-publish, this writes an undelivered slot_events row.
        const delivery = signedDelivery({ token: TOKEN, value: OTP, codeId: CODE_ID });
        const res = await postWebhook(request, delivery);
        expect(res.status()).toBe(200);
        expect(await res.json()).toMatchObject({ received: true });

        // 2. THEN open the activation page. It subscribes to SSE on mount with
        //    `since = now`; windowStart = since - 30s, so the just-persisted row
        //    (receivedAt ≈ now) is inside the replay window.
        await page.goto(`/activer/${TOKEN}`);
        await page.waitForLoadState("domcontentloaded");

        // Sanity: not the invalid/expired or device-limit screen.
        await expect(page.getByText(/Lien invalide|Limite d.appareils/)).toHaveCount(0);
        await expect(page.getByText("Code temps réel")).toBeVisible();

        // 3. The OTP must appear via REPLAY-on-connect (not a live publish — the
        //    webhook fired before any subscriber existed). Generous timeout to
        //    absorb cold-compile of the SSE route on a dev server.
        await expect(page.getByText("Ton code Netflix :")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(OTP, { exact: false })).toBeVisible({ timeout: 15_000 });
    });

    test("re-delivered webhook (same codeId) is idempotent — OTP not duplicated", async ({
        page,
        request,
    }) => {
        // Two deliveries with the SAME codeId BEFORE opening the page. The dedup
        // index (digital_code_id, source_email_id) + onConflictDoNothing must
        // collapse them to a single persisted row, so replay shows ONE OTP.
        const first = signedDelivery({ token: TOKEN, value: OTP, codeId: CODE_ID });
        const r1 = await postWebhook(request, first);
        expect(r1.status()).toBe(200);
        expect(await r1.json()).toMatchObject({ received: true });

        const second = signedDelivery({ token: TOKEN, value: OTP, codeId: CODE_ID });
        const r2 = await postWebhook(request, second);
        // Still accepted (200) — the duplicate is a DB no-op, not an error.
        expect(r2.status()).toBe(200);
        expect(await r2.json()).toMatchObject({ received: true });

        await page.goto(`/activer/${TOKEN}`);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.getByText("Ton code Netflix :")).toBeVisible({ timeout: 15_000 });

        // Exactly one OTP rendered in the live-code card (no duplicate row replayed).
        await expect(page.getByText(OTP, { exact: true })).toHaveCount(1);
    });
});
