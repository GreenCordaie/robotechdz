import { test, expect } from "@playwright/test";

/**
 * EPIC 2 / Phase A — Toggle admin pour auto-send WhatsApp post-paiement kiosk.
 *
 * SAFE :
 *   - Login admin → /admin/settings
 *   - Toggle visible
 *   - Toggle persiste après save + reload
 */

test.describe("Admin auto-send WhatsApp toggle", () => {
    // Settings page is heavy — extend default timeout for cold compile.
    test.setTimeout(120_000);

    test.beforeEach(async ({ page }) => {
        await page.goto("/admin/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("admin@e2e.test");
        await page.locator("input[type='password']").first().fill("AdminTest123!");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/admin\/(dashboard|catalogue|iptv)/, { timeout: 30_000 });
    });

    test("Toggle est visible dans God Mode et persiste", async ({ page }) => {
        await page.goto("/admin/settings", { timeout: 60_000 });
        await page.waitForLoadState("domcontentloaded");

        // Le toggle est dans l'onglet "Sécurité & God Mode"
        await page.getByRole("button", { name: /Sécurité & God Mode/i }).click();

        await expect(page.getByText(/Auto-envoi WhatsApp kiosk/i)).toBeVisible({ timeout: 15_000 });

        const toggle = page.getByTestId("auto-send-whatsapp-toggle");
        await expect(toggle).toBeVisible();

        // Laisser le useEffect de chargement DB terminer avant de lire l'état initial
        await page.waitForTimeout(1500);

        // Capturer l'état initial
        const initialClass = await toggle.getAttribute("class");
        const initiallyOn = (initialClass ?? "").includes("bg-emerald-500");

        // Toggle
        await toggle.click();

        // Save via le bouton dédié à la section Sécurité
        await page.getByTestId("security-save-btn").click();
        await expect(page.getByText(/Paramètres enregistrés/i).first()).toBeVisible({ timeout: 8_000 });

        // Reload + re-cliquer onglet + vérifier l'état inversé
        await page.reload({ timeout: 60_000 });
        await page.getByRole("button", { name: /Sécurité & God Mode/i }).click();
        await expect(page.getByText(/Auto-envoi WhatsApp kiosk/i)).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(1500);
        const afterClass = await page.getByTestId("auto-send-whatsapp-toggle").getAttribute("class");
        const afterOn = (afterClass ?? "").includes("bg-emerald-500");
        expect(afterOn).toBe(!initiallyOn);

        // Restore initial state
        await page.getByTestId("auto-send-whatsapp-toggle").click();
        await page.getByTestId("security-save-btn").click();
        await expect(page.getByText(/Paramètres enregistrés/i).first()).toBeVisible({ timeout: 8_000 });
    });
});
