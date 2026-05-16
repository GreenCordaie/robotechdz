import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase G3 — Webhook DLQ admin.
 *
 * SAFE :
 *   - Login admin → /admin/b2b/webhooks/dlq
 *   - KPIs visibles + filtres
 *   - Cron route 401 sans secret, 200 avec secret
 *   - Aucun call externe (DLQ vide attendu)
 */

test.describe("Admin webhooks DLQ", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/admin/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("admin@e2e.test");
        await page.locator("input[type='password']").first().fill("AdminTest123!");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/admin\/(dashboard|catalogue|iptv)/, { timeout: 15_000 });
    });

    test("Page /admin/b2b/webhooks/dlq : header + KPIs + filtres", async ({ page }) => {
        await page.goto("/admin/b2b/webhooks/dlq");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Webhooks DLQ/i })).toBeVisible({
            timeout: 10_000,
        });

        // KPIs (Retrying / Dead / Resolved)
        await expect(page.getByText(/^Retrying$/i).first()).toBeVisible();
        await expect(page.getByText(/^Dead$/i).first()).toBeVisible();
        await expect(page.getByText(/^Resolved$/i).first()).toBeVisible();

        // Filtres
        await expect(page.getByRole("button", { name: /^Dead$/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Retrying$/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Tous$/i })).toBeVisible();

        // État : aucune ligne OU rows visibles (DB de test souvent vide)
        await expect
            .poll(
                async () => {
                    const empty = await page.getByText(/Aucune tentative/i).count();
                    const rows = await page.getByTestId("dlq-row").count();
                    return empty + rows;
                },
                { timeout: 10_000 }
            )
            .toBeGreaterThan(0);
    });

    test("Filtre 'Retrying' fonctionne sans crash si 0 résultat", async ({ page }) => {
        await page.goto("/admin/b2b/webhooks/dlq");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Webhooks DLQ/i })).toBeVisible({
            timeout: 10_000,
        });

        await page.getByRole("button", { name: /^Retrying$/i }).click();

        await expect
            .poll(
                async () => {
                    const empty = await page.getByText(/Aucune tentative/i).count();
                    const rows = await page.getByTestId("dlq-row").count();
                    return empty + rows;
                },
                { timeout: 10_000 }
            )
            .toBeGreaterThan(0);
    });

    test("Lien depuis vue admin webhooks vers DLQ", async ({ page }) => {
        await page.goto("/admin/b2b/webhooks");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Webhooks resellers/i })).toBeVisible({
            timeout: 10_000,
        });

        const dlqLink = page.getByTestId("dlq-link");
        await expect(dlqLink).toBeVisible();
        await dlqLink.click();
        await page.waitForURL(/\/admin\/b2b\/webhooks\/dlq/);
        await expect(page.getByRole("heading", { name: /Webhooks DLQ/i })).toBeVisible({
            timeout: 10_000,
        });
    });
});

test.describe("Cron webhook-retries", () => {
    test("GET sans secret → 401", async ({ request }) => {
        const res = await request.get("/api/admin/cron/webhook-retries");
        expect(res.status()).toBe(401);
    });

    test("GET avec mauvais secret → 401", async ({ request }) => {
        const res = await request.get("/api/admin/cron/webhook-retries", {
            headers: { Authorization: "Bearer wrong-secret" },
        });
        expect(res.status()).toBe(401);
    });

    test("GET avec bon secret → 200 + stats", async ({ request }) => {
        const secret = process.env.CRON_SECRET || "test_cron_secret_xxx";
        const res = await request.get("/api/admin/cron/webhook-retries", {
            headers: { Authorization: `Bearer ${secret}` },
        });
        expect(res.status()).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(typeof json.processed).toBe("number");
        expect(typeof json.succeeded).toBe("number");
        expect(typeof json.failed).toBe("number");
        expect(typeof json.dead).toBe("number");
    });
});
