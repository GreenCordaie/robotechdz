import { test, expect, type APIRequestContext } from "@playwright/test";
import crypto from "crypto";

/**
 * P0 END-TO-END — real-time Netflix OTP delivery through a real browser.
 *
 * Proves the centralization chain works in-process, top to bottom:
 *
 *   signed `code.captured` webhook
 *     → POST /api/loadbrain/netflix/webhook   (HMAC verify, replay window, idempotency)
 *       → applyNetflixWebhook                  (resolve slotId via slot_activation_tokens.token)
 *         → streamingEventBus.publish(slotId)  (in-process pub/sub)
 *           → GET /api/activer/[token]/events  (existing SSE consumer)
 *             → /activer/[token] page          (ActivationClient renders the OTP)
 *
 * No real Netflix / MS Graph needed — the webhook IS the injection point.
 * The webhook route and the SSE route live in the SAME Next.js process, so a
 * single running server suffices.
 *
 * ── Prerequisites (operator) ─────────────────────────────────────────────────
 *  1. Seed the fixture (idempotent, prints the token):
 *       DATABASE_URL=postgresql://user:password@localhost:5435/flexbox \
 *       ENCRYPTION_KEY=<real key from .env> \
 *       node scripts/seed-netflix-activation-e2e.js
 *  2. Start the app pointed at the SAME flexbox DB, with the webhook secret set:
 *       DATABASE_URL=postgresql://user:password@localhost:5435/flexbox \
 *       ENCRYPTION_KEY=<real key from .env> \
 *       LOADBRAIN_WEBHOOK_SECRET=<secret> \
 *       npx next dev -p 4555
 *     (the boutique's .env already sets ENCRYPTION_KEY + LOADBRAIN_WEBHOOK_SECRET;
 *      running `next dev -p 4555` from the repo root loads .env automatically.)
 *  3. Run with the SAME secret the server uses, exported in the test env:
 *       LOADBRAIN_WEBHOOK_SECRET=<secret> \
 *       npx playwright test tests/e2e/14-netflix-activation-webhook.spec.ts
 *
 * The TEST and the SERVER must agree on the secret. The test reads
 * LOADBRAIN_WEBHOOK_SECRET from its own env; no secret is committed. If the
 * env var is absent the whole describe block is skipped.
 */

// Must match scripts/seed-netflix-activation-e2e.js (and be ≤16 chars).
const TOKEN = process.env.E2E_NF_TOKEN || "E2E-NF-TOK-001";

// Must match the running server's LOADBRAIN_WEBHOOK_SECRET. NEVER hardcode the
// secret — it is read from the test env only. When absent, the describe block
// below is skipped (see test.skip guard) so nothing leaks and CI stays green.
const SECRET = process.env.LOADBRAIN_WEBHOOK_SECRET ?? "";

const OTP = "482913";
const WEBHOOK_PATH = "/api/loadbrain/netflix/webhook";

/** Build the signed headers + raw body for a code.captured delivery. */
function signedDelivery(opts: {
    token: string;
    type?: "OTP_CODE" | "HOUSEHOLD_LINK";
    value: string;
    secret?: string;
    deliveryId?: string;
}): { body: string; headers: Record<string, string> } {
    const body = JSON.stringify({
        event: "code.captured",
        payload: {
            publicToken: opts.token,
            type: opts.type ?? "OTP_CODE",
            value: opts.value,
            timestamp: new Date().toISOString(),
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
            "x-loadbrain-delivery-id":
                opts.deliveryId ?? `e2e-${crypto.randomUUID()}`,
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

test.describe("Netflix activation — webhook → SSE → OTP", () => {
    // No secret in env ⇒ nothing to sign with. Skip rather than hardcode one.
    test.skip(
        !process.env.LOADBRAIN_WEBHOOK_SECRET,
        "LOADBRAIN_WEBHOOK_SECRET required (export it to run this E2E)",
    );

    test("signed code.captured delivers the OTP live to /activer", async ({
        page,
        request,
    }) => {
        // 1. Open the activation page. It subscribes to SSE on mount.
        await page.goto(`/activer/${TOKEN}`);
        await page.waitForLoadState("domcontentloaded");

        // The page must NOT be the invalid/expired or device-limit screen.
        await expect(page.getByText(/Lien invalide|Limite d.appareils/)).toHaveCount(0);
        // A known element from ActivationClient is visible (the "Code temps réel" card).
        await expect(page.getByText("Code temps réel")).toBeVisible();

        // 2. Wait for the SSE to actually connect. The event-bus publish is
        //    live-only (no DB persistence for webhook-injected events), so the
        //    subscriber MUST be attached before we POST — otherwise the live
        //    event is lost. The page flips the badge to "● en ligne" on
        //    EventSource.onopen.
        await expect(page.getByText("● en ligne")).toBeVisible({ timeout: 15_000 });

        // 3. Inject the OTP via a signed webhook (server-to-server).
        const delivery = signedDelivery({ token: TOKEN, value: OTP });
        const res = await postWebhook(request, delivery);
        expect(res.status()).toBe(200);
        expect(await res.json()).toMatchObject({ received: true });

        // 4. The browser page should now render the OTP in real time.
        await expect(page.getByText("Ton code Netflix :")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(OTP, { exact: false })).toBeVisible({ timeout: 10_000 });
    });

    test("wrong signature is rejected with 400 (no OTP leaked)", async ({ request }) => {
        const bad = signedDelivery({
            token: TOKEN,
            value: "000000",
            secret: "definitely-not-the-secret",
        });
        const res = await postWebhook(request, bad);
        expect(res.status()).toBe(400);
        expect(await res.json()).toMatchObject({ error: "Invalid signature" });
    });
});
