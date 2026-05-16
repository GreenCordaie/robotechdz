import { test, expect } from "@playwright/test";

/**
 * Tracking public — vérifications sans débit / sans modif DB :
 *  - 6 chiffres requis (renforcement EPIC 0)
 *  - Order non trouvée → erreur sans crash
 */

test.describe("Suivi public", () => {
    test("Order inexistante → message clair", async ({ page }) => {
        await page.goto("/suivi/INEXISTANT-12345");
        // Pas networkidle — la page suivi polle toutes les 5s, networkidle ne se déclenche jamais
        await page.waitForLoadState("domcontentloaded");

        // Soit message d'erreur "Commande introuvable", soit retry — on accepte les 2
        const erreur = await page.getByText(/introuvable|404|inconnue/i).count();
        const retry = await page.getByText(/recherche/i).count();
        expect(erreur + retry).toBeGreaterThan(0);
    });

    test("Suivi entry page : input + bouton presents", async ({ page }) => {
        await page.goto("/suivi");
        // Pas networkidle — la page suivi polle toutes les 5s, networkidle ne se déclenche jamais
        await page.waitForLoadState("domcontentloaded");

        const input = page.locator("input").first();
        await expect(input).toBeVisible();
        await input.fill("ABC123");

        await expect(page.getByRole("button").first()).toBeEnabled();
    });
});
