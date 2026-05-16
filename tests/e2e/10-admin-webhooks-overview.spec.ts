import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase G2 — Page admin /admin/b2b/webhooks (vue globale).
 *
 * SAFE :
 *   - Login admin → /admin/b2b/webhooks
 *   - KPIs visibles + filtres
 *   - On NE soumet PAS la désactivation forcée (modifierait DB)
 */

test.describe("Admin webhooks overview", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/admin/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("admin@e2e.test");
        await page.locator("input[type='password']").first().fill("AdminTest123!");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/admin\/(dashboard|catalogue|iptv)/, { timeout: 15_000 });
    });

    test("Page /admin/b2b/webhooks : header + KPIs + filtres", async ({ page }) => {
        await page.goto("/admin/b2b/webhooks");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Webhooks resellers/i })).toBeVisible({
            timeout: 10_000,
        });

        // KPIs (5 attendus : Total / Actifs / Inactifs / Failing / Livraisons)
        await expect(page.getByText(/^Total$/i).first()).toBeVisible();
        await expect(page.getByText(/^Actifs$/i).first()).toBeVisible();
        await expect(page.getByText(/^Failing$/i).first()).toBeVisible();

        // Filtres
        await expect(page.getByRole("button", { name: /^Tous$/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Failing$/i })).toBeVisible();

        // État : aucun webhook OU rows visibles
        await expect
            .poll(
                async () => {
                    const empty = await page.getByText(/Aucun webhook/i).count();
                    const rows = await page.getByTestId("admin-webhook-row").count();
                    return empty + rows;
                },
                { timeout: 10_000 }
            )
            .toBeGreaterThan(0);
    });

    test("Filtre 'Failing' fonctionne sans crash si 0 résultat", async ({ page }) => {
        await page.goto("/admin/b2b/webhooks");
        await page.waitForLoadState("domcontentloaded");

        // Attendre que la page initiale finisse de charger
        await expect(page.getByRole("heading", { name: /Webhooks resellers/i })).toBeVisible({
            timeout: 10_000,
        });

        await page.getByRole("button", { name: /^Failing$/i }).click();

        // Le filter déclenche un fetch async — on attend la stabilisation
        await expect
            .poll(
                async () => {
                    const empty = await page.getByText(/Aucun webhook/i).count();
                    const rows = await page.getByTestId("admin-webhook-row").count();
                    return empty + rows;
                },
                { timeout: 10_000 }
            )
            .toBeGreaterThan(0);
    });
});
