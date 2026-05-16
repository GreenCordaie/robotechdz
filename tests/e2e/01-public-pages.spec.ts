import { test, expect } from "@playwright/test";

/**
 * Tests des pages publiques accessibles SANS authentification.
 * Ne déclenche aucun appel externe (Telegram/WhatsApp/LoadBrain).
 */

test.describe("Public pages render", () => {
    test("Admin login page loads with form", async ({ page }) => {
        await page.goto("/admin/login");
        await expect(page).toHaveTitle(/.+/);
        // Le form doit être présent
        await expect(page.locator("input[type='email'], input[name='email']").first()).toBeVisible();
        await expect(page.locator("input[type='password']").first()).toBeVisible();
    });

    test("Reseller login page loads", async ({ page }) => {
        await page.goto("/reseller/login");
        await expect(page.locator("input").first()).toBeVisible();
    });

    test("Suivi entry page loads", async ({ page }) => {
        await page.goto("/suivi");
        await expect(page.locator("input").first()).toBeVisible();
        await expect(page.getByRole("button").first()).toBeVisible();
    });

    test("B2B landing page loads", async ({ page }) => {
        await page.goto("/b2b");
        // h1 (titre) doit être présent
        await expect(page.locator("h1").first()).toBeVisible();
    });
});
