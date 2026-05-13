import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase G — Reseller outbound webhooks.
 *
 * SAFE :
 *   - Login reseller → /reseller/webhooks
 *   - Vérifie liste vide initialement
 *   - Ouvre modal Nouveau webhook → vérifie form
 *   - ON NE SOUMET PAS de webhook (sinon row persistante en DB de test)
 */

test.describe("Reseller outbound webhooks", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/reseller/login");
        await page.locator("input[type='email'], input[name='email']").first().fill("reseller@e2e.test");
        await page.locator("input[type='password']").first().fill("1234");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/reseller\/(dashboard|wallet|shop|orders|support)/, { timeout: 15_000 });
    });

    test("Page /reseller/webhooks : header + doc + bouton ajout", async ({ page }) => {
        await page.goto("/reseller/webhooks");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Webhooks sortants/i })).toBeVisible({
            timeout: 10_000,
        });

        // Bouton ajout présent
        await expect(page.getByTestId("add-webhook-btn")).toBeVisible();

        // Documentation rapide présente
        await expect(page.getByText(/Documentation rapide/i)).toBeVisible();

        // État : soit liste vide ("Aucun webhook"), soit rows
        await expect
            .poll(
                async () => {
                    const empty = await page.getByText(/Aucun webhook/i).count();
                    const rows = await page.getByTestId("webhook-row").count();
                    return empty + rows;
                },
                { timeout: 10_000 }
            )
            .toBeGreaterThan(0);
    });

    test("Modal nouveau webhook s'ouvre avec form (no submit)", async ({ page }) => {
        await page.goto("/reseller/webhooks");
        await page.waitForLoadState("domcontentloaded");

        await page.getByTestId("add-webhook-btn").click();

        await expect(page.getByRole("heading", { name: /Nouveau webhook/i })).toBeVisible({
            timeout: 5_000,
        });

        // URL input visible
        await expect(page.getByTestId("webhook-url")).toBeVisible();

        // 3 checkboxes events visibles dans le modal (filter visible only)
        await expect(page.getByText(/Events à écouter/i)).toBeVisible();
        await expect(page.locator("text=/order\\.paid/i").locator("visible=true").first()).toBeVisible();

        // Bouton submit visible mais DÉSACTIVÉ tant que pas d'URL
        await expect(page.getByTestId("webhook-submit")).toBeVisible();
        await expect(page.getByTestId("webhook-submit")).toBeDisabled();

        // Annuler proprement
        await page.getByRole("button", { name: /Annuler/i }).click();
        await expect(page.getByRole("heading", { name: /Nouveau webhook/i })).toHaveCount(0);
    });

    test("Validation : URL privée rejetée (SSRF protection)", async ({ page }) => {
        await page.goto("/reseller/webhooks");
        await page.waitForLoadState("domcontentloaded");

        await page.getByTestId("add-webhook-btn").click();
        await expect(page.getByTestId("webhook-url")).toBeVisible({ timeout: 5_000 });

        // Tente une URL privée (localhost) → submit devrait fail côté server
        await page.getByTestId("webhook-url").fill("http://localhost:3000/hook");

        // Coche au moins 1 event (order.paid coché par défaut)
        // Submit
        const submit = page.getByTestId("webhook-submit");
        await expect(submit).toBeEnabled();
        await submit.click();

        // Soit toast erreur "URL invalide — adresse privée/locale refusée"
        await expect
            .poll(async () => {
                return await page.getByText(/adresse privée|refus/i).count();
            }, { timeout: 5_000 })
            .toBeGreaterThan(0);
    });
});
