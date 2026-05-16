import { test, expect } from "@playwright/test";

/**
 * EPIC 2 / Phase C — Page admin LoadBrain Marketplace.
 *
 * Tests SAFE :
 *   - Login admin (email + password)
 *   - Visiter la page /admin/iptv/loadbrain-services
 *   - Vérifier que les fixtures (mode dev, LOADBRAIN_API_KEY vide) s'affichent
 *   - On NE clique PAS "Lier" (créerait des rows DB)
 */

test.describe("LoadBrain Marketplace admin", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/admin/login");

        await page.locator("input[type='email'], input[name='email']").first().fill("admin@e2e.test");
        await page.locator("input[type='password']").first().fill("AdminTest123!");

        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/admin\/(dashboard|catalogue|iptv)/, { timeout: 15_000 });
    });

    test("Page LoadBrain Marketplace : fixtures dev visibles", async ({ page }) => {
        await page.goto("/admin/iptv/loadbrain-services");
        await page.waitForLoadState("domcontentloaded");

        // Header
        await expect(page.getByRole("heading", { name: /LoadBrain Marketplace/i })).toBeVisible({ timeout: 10_000 });

        // Au moins une carte service visible (les fixtures contiennent 8 services)
        const cards = page.getByTestId("loadbrain-service-card");
        await expect(cards.first()).toBeVisible({ timeout: 10_000 });
        const count = await cards.count();
        expect(count).toBeGreaterThanOrEqual(3);

        // Filtres présents
        await expect(page.getByRole("button", { name: /^Tous$/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /À lier/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /Déjà liés/i })).toBeVisible();

        // Au moins un bouton "Lier" (services pas encore liés)
        const lierBtns = page.getByRole("button", { name: /^Lier$/i });
        expect(await lierBtns.count()).toBeGreaterThan(0);
    });

    test("Modal de liaison s'ouvre sur click 'Lier' (no submit)", async ({ page }) => {
        await page.goto("/admin/iptv/loadbrain-services");
        await page.waitForLoadState("domcontentloaded");

        // Wait pour que les fixtures arrivent
        await expect(page.getByTestId("loadbrain-service-card").first()).toBeVisible({ timeout: 10_000 });

        // Click sur le 1er bouton "Lier"
        await page.getByRole("button", { name: /^Lier$/i }).first().click();

        // Le modal doit s'ouvrir avec les inputs préfillés
        await expect(page.getByText(/Lier .+/i).first()).toBeVisible({ timeout: 5_000 });
        await expect(page.getByText(/Stock virtuel — provisioning à la demande/i)).toBeVisible();

        // On NE submit PAS (pour ne pas créer de row DB)
        // Annuler proprement
        await page.getByRole("button", { name: /Annuler/i }).click();
    });
});
