import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase H — Admin manual wallet recharge.
 *
 * SAFE :
 *   - Visite /admin/b2b/wallets → liste resellers visible
 *   - Click "Recharger" → modal s'ouvre
 *   - On NE soumet PAS le formulaire (sinon recharge VRAIE en DB de test
 *     qui interférerait avec balance attendue par tests checkout)
 */

test.describe("Admin wallet manual recharge", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/admin/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("admin@e2e.test");
        await page.locator("input[type='password']").first().fill("AdminTest123!");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/admin\/(dashboard|catalogue|iptv)/, { timeout: 15_000 });
    });

    test("Page /admin/b2b/wallets : KPIs + liste + bouton recharger", async ({ page }) => {
        await page.goto("/admin/b2b/wallets");
        await page.waitForLoadState("domcontentloaded");

        // Header
        await expect(page.getByRole("heading", { name: /Wallets revendeurs/i })).toBeVisible({
            timeout: 10_000,
        });

        // KPIs cards (3 attendues : Total wallets, Solde global, Volume cumulé)
        await expect(page.getByText(/Total wallets/i)).toBeVisible();
        await expect(page.getByText(/Solde global/i)).toBeVisible();
        await expect(page.getByText(/Volume cumulé/i)).toBeVisible();

        // Liste : au moins la row du reseller seedé (E2E Test Company)
        await expect
            .poll(
                async () => {
                    const rows = await page.getByTestId("wallet-row").count();
                    const empty = await page.getByText(/Aucun reseller/i).count();
                    return rows + empty;
                },
                { timeout: 10_000 }
            )
            .toBeGreaterThan(0);

        // Si on a au moins une row → vérifier le bouton "Recharger" présent
        const rowCount = await page.getByTestId("wallet-row").count();
        if (rowCount > 0) {
            await expect(page.getByTestId("recharge-btn").first()).toBeVisible();
        }
    });

    test("Modal recharge s'ouvre avec champs (no submit)", async ({ page }) => {
        await page.goto("/admin/b2b/wallets");
        await page.waitForLoadState("domcontentloaded");

        // Attendre que la liste arrive
        const rechargeBtn = page.getByTestId("recharge-btn").first();
        await expect(rechargeBtn).toBeVisible({ timeout: 10_000 });

        await rechargeBtn.click();

        // Modal ouvert
        await expect(page.getByRole("heading", { name: /Recharger wallet/i })).toBeVisible({
            timeout: 5_000,
        });
        await expect(page.getByTestId("recharge-amount")).toBeVisible();
        // Modal contient au moins le warning text (présent une fois ouvert)
        await expect(page.getByText(/Cette action est/i)).toBeVisible();
        // Bouton submit présent
        await expect(page.getByTestId("recharge-submit")).toBeVisible();

        // Bouton submit visible mais DÉSACTIVÉ tant que pas de montant
        const submitBtn = page.getByTestId("recharge-submit");
        await expect(submitBtn).toBeVisible();
        await expect(submitBtn).toBeDisabled();

        // Annuler proprement
        await page.getByRole("button", { name: /Annuler/i }).click();
        await expect(page.getByRole("heading", { name: /Recharger wallet/i })).toHaveCount(0);
    });

    test("Recherche reseller : filtre fonctionne", async ({ page }) => {
        await page.goto("/admin/b2b/wallets");
        await page.waitForLoadState("domcontentloaded");

        const searchInput = page.locator("input[placeholder*='Recherche']");
        await expect(searchInput).toBeVisible({ timeout: 10_000 });

        // Recherche avec terme qui ne match rien
        await searchInput.fill("ZZZINEXISTANT123");

        // Soit message "Aucun reseller trouvé" soit 0 row
        await expect
            .poll(
                async () => {
                    const rows = await page.getByTestId("wallet-row").count();
                    return rows;
                },
                { timeout: 5_000 }
            )
            .toBe(0);
    });
});
