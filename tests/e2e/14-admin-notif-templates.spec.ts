import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase L — Templates de notifications configurables.
 *
 * SAFE :
 *   - Login admin → /admin/settings/notifications
 *   - 5 rows visibles (1 par event)
 *   - Edit + save persiste
 *   - Preview server-side rend les variables
 *   - Reset retire la row DB
 */

test.describe("Admin notification templates", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/admin/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("admin@e2e.test");
        await page.locator("input[type='password']").first().fill("AdminTest123!");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/admin\/(dashboard|catalogue|iptv)/, { timeout: 30_000 });
    });

    test("Page liste les 5 templates", async ({ page }) => {
        await page.goto("/admin/settings/notifications");
        await page.waitForLoadState("domcontentloaded");

        await expect(
            page.getByRole("heading", { name: /Templates notifications WhatsApp/i })
        ).toBeVisible({ timeout: 10_000 });

        const eventKeys = [
            "wallet.recharged",
            "signup.approved",
            "signup.rejected",
            "order.confirmed",
            "order.credentials.ready",
        ];
        for (const key of eventKeys) {
            await expect(page.getByTestId(`tpl-row-${key}`)).toBeVisible({ timeout: 10_000 });
        }
    });

    test("Edit + save + reset cycle complet sur wallet.recharged", async ({ page }) => {
        await page.goto("/admin/settings/notifications");
        await page.waitForLoadState("domcontentloaded");
        await expect(page.getByTestId("tpl-row-wallet.recharged")).toBeVisible({ timeout: 10_000 });

        // Modifier le body avec un marker unique
        const marker = `[E2E-${Date.now()}]`;
        const textarea = page.getByTestId("tpl-body-wallet.recharged");
        await textarea.fill(`${marker} Recharge {{amount}} pour {{companyName}}`);

        // Save
        await page.getByTestId("tpl-save-wallet.recharged").click();
        await expect(page.getByText(/Template enregistré/i).first()).toBeVisible({ timeout: 5_000 });

        // Vérifier que le badge "Personnalisé" apparaît
        const row = page.getByTestId("tpl-row-wallet.recharged");
        await expect(row.getByText(/^Personnalisé$/i)).toBeVisible({ timeout: 5_000 });

        // Bouton reset doit apparaître
        const resetBtn = page.getByTestId("tpl-reset-wallet.recharged");
        await expect(resetBtn).toBeVisible();

        // Reset (auto-confirm via dialog handler)
        page.once("dialog", (d) => d.accept());
        await resetBtn.click();
        await expect(page.getByText(/Template reset/i).first()).toBeVisible({ timeout: 5_000 });

        // Le badge "Personnalisé" disparaît
        await expect(row.getByText(/^Défaut$/i)).toBeVisible({ timeout: 5_000 });
    });

    test("Aperçu rend les variables {{...}}", async ({ page }) => {
        await page.goto("/admin/settings/notifications");
        await page.waitForLoadState("domcontentloaded");
        await expect(page.getByTestId("tpl-row-wallet.recharged")).toBeVisible({ timeout: 10_000 });

        await page.getByTestId("tpl-preview-btn-wallet.recharged").click();

        const preview = page.getByTestId("tpl-preview-wallet.recharged");
        await expect(preview).toBeVisible({ timeout: 5_000 });

        // Le sample contient companyName=Boutique Demo, on doit le voir rendu (pas {{...}})
        await expect(preview).toContainText(/Boutique Demo/);
        await expect(preview).not.toContainText(/\{\{companyName\}\}/);
    });
});
