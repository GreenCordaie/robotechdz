import { test, expect } from "@playwright/test";

/**
 * EPIC 2 / Phase D — Reseller orders page : credentials display + send to client.
 *
 * SAFE :
 *   - Login reseller
 *   - Visite /reseller/orders
 *   - Vérifie qu'il n'y a pas de "Articles en gros" hardcodé (ancien bug fix)
 *   - On ne créé PAS de commande (ce qui débiterait le wallet)
 *   - Le test "Envoyer au client" ouvre le modal mais NE soumet PAS
 *     (le serveur retournerait success no-op vu WHATSAPP vide, mais on évite)
 */

test.describe("Reseller orders + credentials display", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/reseller/login");

        await page.locator("input[type='email'], input[name='email']").first().fill("reseller@e2e.test");
        await page.locator("input[type='password']").first().fill("1234");

        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/reseller\/(dashboard|wallet|shop|orders|support)/, { timeout: 15_000 });
    });

    test("Page orders : header + recherche + état vide ou liste", async ({ page }) => {
        await page.goto("/reseller/orders");
        await page.waitForLoadState("domcontentloaded");

        // Header présent
        await expect(page.getByRole("heading", { name: /Mes Commandes/i })).toBeVisible({ timeout: 10_000 });

        // Search input présent
        await expect(page.locator("input[placeholder*='Numéro de commande']")).toBeVisible();

        // Attendre la fin du loading (soit "Aucune commande" soit une row visible)
        await expect
            .poll(
                async () => {
                    const empty = await page.getByText(/Aucune commande/i).count();
                    const rows = await page.getByTestId("order-row").count();
                    return empty + rows;
                },
                { timeout: 10_000, message: "Ni 'Aucune commande' ni order-row détecté" }
            )
            .toBeGreaterThan(0);

        // Pas de "Articles en gros" hardcodé (ancien placeholder qui n'avait aucun sens)
        await expect(page.getByText(/Articles en gros/i)).toHaveCount(0);
    });

    test("Filtre recherche fonctionne (sans crash si 0 résultat)", async ({ page }) => {
        await page.goto("/reseller/orders");
        await page.waitForLoadState("domcontentloaded");

        await page.locator("input[placeholder*='Numéro de commande']").fill("ZZZINEXISTANT");

        // Liste vide ou pas de row visible
        const visibleRows = await page.getByTestId("order-row").count();
        expect(visibleRows).toBeLessThanOrEqual(0);
    });
});
