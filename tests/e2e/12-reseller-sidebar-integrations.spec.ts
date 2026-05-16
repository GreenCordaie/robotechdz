import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase I2 — Sidebar reseller : section Intégrations.
 *
 * SAFE :
 *   - Login reseller → /reseller/dashboard
 *   - Vérifie présence des liens Webhooks + API & Docs
 *   - API & Docs ouvre dans nouvel onglet (target=_blank)
 */

test.describe("Reseller sidebar — Intégrations", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/reseller/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("reseller@e2e.test");
        await page.locator("input[type='password'], input[name='pin']").first().fill("1234");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/reseller\/(dashboard|wallet|shop|orders|support)/, { timeout: 15_000 });
    });

    test("Sidebar contient lien Mes Webhooks + API & Docs", async ({ page }) => {
        await page.goto("/reseller/dashboard");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByText(/^Intégrations$/i).first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole("link", { name: /Mes Webhooks/i })).toBeVisible();

        const apiDocsLink = page.getByTestId("reseller-api-docs-link");
        await expect(apiDocsLink).toBeVisible();
        await expect(apiDocsLink).toHaveAttribute("href", "/api-docs");
        await expect(apiDocsLink).toHaveAttribute("target", "_blank");
        await expect(apiDocsLink).toHaveAttribute("rel", /noopener/);
    });

    test("Clic sur 'Mes Webhooks' navigue vers /reseller/webhooks", async ({ page }) => {
        await page.goto("/reseller/dashboard");
        await page.waitForLoadState("domcontentloaded");

        await page.getByRole("link", { name: /Mes Webhooks/i }).click();
        await page.waitForURL(/\/reseller\/webhooks/, { timeout: 10_000 });
    });
});
