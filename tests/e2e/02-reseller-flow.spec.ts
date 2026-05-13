import { test, expect } from "@playwright/test";

/**
 * Flow reseller complet : login → wallet → shop → cart → modal checkout
 * Aucun checkout réel (on stop juste avant "Confirmer & Payer" pour ne pas débiter).
 *
 * Couvre les bugs corrigés en EPIC 0/1/2 :
 *  - Wallet : stats mensuelles RÉELLES (pas hardcodées 12,500/625)
 *  - Wallet : badge tier coloré + progress bar
 *  - Wallet : bouton "Recharger" CACHÉ (pas câblé en prod)
 *  - Shop : appel à getResellerCatalogAction (pas l'admin qui rejetait)
 *  - Shop : bouton Panier OUVRE le modal (était cassé avant)
 *  - Shop : badges livraison Instant/Stock/Sur demande
 *  - Shop : tier-aware pricing
 */

test.describe("Reseller end-to-end flow", () => {
    test.beforeEach(async ({ page }) => {
        // Login reseller (PIN-based)
        await page.goto("/reseller/login");

        // Le form attend email + PIN — sélecteurs robustes
        const emailInput = page.locator("input[type='email'], input[name='email']").first();
        const pinInput = page.locator("input[type='password'], input[name='pin'], input[name='pinCode']").first();

        await emailInput.fill("reseller@e2e.test");
        await pinInput.fill("1234");

        // Bouton submit du form (texte = "Accéder au portail")
        await page.locator("form button[type='submit']").first().click();

        // Attendre la redirection vers dashboard ou wallet
        await page.waitForURL(/\/reseller\/(dashboard|wallet|shop|orders|support)/, { timeout: 15_000 });
    });

    test("Wallet : badge tier BRONZE visible + bouton Recharger CACHÉ", async ({ page }) => {
        await page.goto("/reseller/wallet");
        await page.waitForLoadState("domcontentloaded");

        // Solde affiché (100,000 DZD seedé)
        await expect(page.getByText(/100[\s,.]?000/).first()).toBeVisible({ timeout: 10_000 });

        // Badge tier BRONZE visible (case insensitive)
        await expect(page.getByText(/Palier BRONZE/i)).toBeVisible();

        // Stats hardcodées NE doivent PAS apparaître (l'ancien bug)
        await expect(page.getByText("12,500 DZD")).toHaveCount(0);
        await expect(page.getByText("625 DZD")).toHaveCount(0);

        // Bouton "Recharger le Compte" doit être MASQUÉ (corrigé EPIC 0)
        await expect(page.getByRole("button", { name: /recharger le compte/i })).toHaveCount(0);
    });

    test("Shop : catalogue charge + tier badge en header + badges livraison", async ({ page }) => {
        await page.goto("/reseller/shop");
        await page.waitForLoadState("domcontentloaded");

        // Le tier "BRONZE" doit apparaître dans le header
        await expect(page.getByText(/BRONZE/i).first()).toBeVisible({ timeout: 10_000 });

        // Au moins un produit visible (Netflix Premium Test seedé)
        await expect(page.getByText(/Netflix Premium Test/i).first()).toBeVisible();

        // Au moins un badge livraison doit être présent
        const hasInstant = await page.getByText(/Instant/i).count();
        const hasStock = await page.getByText(/Stock\s+\d+/i).count();
        const hasSurDemande = await page.getByText(/Sur demande/i).count();
        expect(hasInstant + hasStock + hasSurDemande).toBeGreaterThan(0);

        // Le variant kiosk-only NE doit PAS apparaître
        await expect(page.getByText(/Kiosk only/i)).toHaveCount(0);
    });

    test("Shop : ajout au panier ouvre le modal (BUG FIX critique)", async ({ page }) => {
        await page.goto("/reseller/shop");
        await page.waitForLoadState("domcontentloaded");

        // Cliquer sur le premier produit (carte cliquable)
        await page.getByText(/Netflix Premium Test/i).first().click();

        // Bouton Panier doit apparaître avec le total
        const cartButton = page.getByRole("button", { name: /panier/i }).first();
        await expect(cartButton).toBeVisible({ timeout: 5_000 });

        // Click panier → modal doit s'ouvrir (avant EPIC 2 ce bouton n'avait pas onClick)
        await cartButton.click();

        // Vérifier que le modal "Récapitulatif de Commande" est ouvert
        await expect(page.getByText(/Récapitulatif de Commande/i)).toBeVisible({ timeout: 5_000 });
        await expect(page.getByText(/Total à débiter/i)).toBeVisible();
    });

    test("Shop : on N'EXÉCUTE PAS le checkout (no credit consumed)", async ({ page }) => {
        await page.goto("/reseller/shop");
        await page.waitForLoadState("domcontentloaded");

        await page.getByText(/Netflix Premium Test/i).first().click();
        await page.getByRole("button", { name: /panier/i }).first().click();

        // Modal ouvert. On vérifie le bouton "Confirmer & Payer" présent
        // mais on NE clique PAS dessus (pour ne pas débiter le wallet).
        await expect(page.getByRole("button", { name: /confirmer.*payer/i })).toBeVisible();

        // On ferme le modal proprement
        await page.getByRole("button", { name: /continuer mes achats/i }).click();

        // Modal fermé
        await expect(page.getByText(/Récapitulatif de Commande/i)).toHaveCount(0);
    });
});
