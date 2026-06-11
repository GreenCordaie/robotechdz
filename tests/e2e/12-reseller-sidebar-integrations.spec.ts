import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase I2 — Nav reseller : intégrations exposées.
 *
 * La nav reseller est un top-nav (ShopTopNav) avec un dropdown profil.
 * (L'ancienne sidebar a été remplacée par le top-nav — cf. STATUS B5 2026-05-28.)
 *
 * SAFE :
 *   - Login reseller → ouvre le dropdown profil
 *   - Vérifie présence des liens Mes Webhooks + API & Docs
 *   - API & Docs ouvre dans un nouvel onglet (target=_blank)
 */

test.describe("Reseller nav — Intégrations", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/reseller/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("reseller@e2e.test");
        await page.locator("input[type='password'], input[name='pin']").first().fill("1234");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/reseller\/(dashboard|wallet|shop|orders|support)/, { timeout: 15_000 });
    });

    test("Dropdown profil contient Mes Webhooks + API & Docs (nouvel onglet)", async ({ page }) => {
        await page.goto("/reseller/dashboard");
        await page.waitForLoadState("domcontentloaded");

        await page.getByRole("button", { name: /profil/i }).click();

        await expect(page.getByRole("menuitem", { name: /Mes Webhooks/i })).toBeVisible({ timeout: 10_000 });

        const apiDocsLink = page.getByTestId("reseller-api-docs-link");
        await expect(apiDocsLink).toBeVisible();
        await expect(apiDocsLink).toHaveAttribute("href", "/api-docs");
        await expect(apiDocsLink).toHaveAttribute("target", "_blank");
        await expect(apiDocsLink).toHaveAttribute("rel", /noopener/);
    });

    test("Clic sur 'Mes Webhooks' navigue vers /reseller/webhooks", async ({ page }) => {
        await page.goto("/reseller/dashboard");
        await page.waitForLoadState("domcontentloaded");

        await page.getByRole("button", { name: /profil/i }).click();
        await page.getByRole("menuitem", { name: /Mes Webhooks/i }).click();
        await page.waitForURL(/\/reseller\/webhooks/, { timeout: 10_000 });
    });
});
