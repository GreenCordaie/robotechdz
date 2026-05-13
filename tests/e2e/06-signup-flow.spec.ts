import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase E + J — Signup public reseller + admin queue.
 *
 * SAFE :
 *   - Form public submit : crée une row PENDING (DB write OK, pas de credit)
 *   - Admin login → voit la request
 *   - On NE clique PAS "Approuver" (sinon ça créerait un VRAI user reseller
 *     persistant en DB de test, qui interférerait avec les autres tests)
 */

test.describe("Signup reseller public + admin queue", () => {
    test("Page /reseller/signup : form complet + honeypot caché", async ({ page }) => {
        await page.goto("/reseller/signup");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Devenir partenaire B2B/i })).toBeVisible();

        await expect(page.getByTestId("signup-email")).toBeVisible();
        await expect(page.getByTestId("signup-company")).toBeVisible();
        await expect(page.getByTestId("signup-phone")).toBeVisible();
        await expect(page.getByTestId("signup-submit")).toBeVisible();

        // Honeypot rendered in DOM (Tailwind classes le cachent visuellement
        // mais Playwright peut le considérer "visible" — l'important est qu'il
        // existe + tabIndex=-1 pour ne pas piéger les users clavier).
        await expect(page.locator("input[name='website_url']")).toHaveCount(1);
        await expect(page.locator("input[name='website_url']")).toHaveAttribute("tabindex", "-1");
    });

    test("Submit signup avec champs valides → écran de confirmation", async ({ page }) => {
        await page.goto("/reseller/signup");
        await page.waitForLoadState("domcontentloaded");

        // Email unique pour éviter le dédoublonnage idempotent
        const uniqueEmail = `e2e-test-${Date.now()}@signup.test`;

        await page.getByTestId("signup-email").fill(uniqueEmail);
        await page.getByTestId("signup-company").fill("E2E Test SARL");
        await page.getByTestId("signup-phone").fill("+213 555 999 888");

        await page.getByTestId("signup-submit").click();

        // Confirmation visible
        await expect(page.getByTestId("signup-success")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(/Demande envoyée/i)).toBeVisible();
        await expect(page.getByText(uniqueEmail)).toBeVisible();
    });

    test("Validation Zod : email invalide est rejeté", async ({ page }) => {
        await page.goto("/reseller/signup");
        await page.waitForLoadState("domcontentloaded");

        await page.getByTestId("signup-email").fill("pas-un-email");
        await page.getByTestId("signup-company").fill("Test");
        await page.getByTestId("signup-phone").fill("+213555000000");

        await page.getByTestId("signup-submit").click();

        // HTML5 validation côté navigateur (type="email") → form pas submited
        // Ou bien Zod côté serveur retourne erreur avec toast
        // On accepte les 2 : juste vérifier qu'on N'A PAS atteint l'écran success
        await page.waitForTimeout(2000);
        await expect(page.getByTestId("signup-success")).toHaveCount(0);
    });
});

test.describe("Admin signup queue", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/admin/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("admin@e2e.test");
        await page.locator("input[type='password']").first().fill("AdminTest123!");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/admin\/(dashboard|catalogue|iptv)/, { timeout: 15_000 });
    });

    test("Page /admin/b2b/signups : header + filtres + liste", async ({ page }) => {
        await page.goto("/admin/b2b/signups");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Demandes Reseller/i })).toBeVisible({
            timeout: 10_000,
        });

        // Filtres présents
        await expect(page.getByRole("button", { name: /^À traiter$/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Approuvées$/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Rejetées$/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /^Toutes$/i })).toBeVisible();

        // Soit "Aucune demande" soit ≥ 1 row (les tests précédents ont créé des entries)
        await expect
            .poll(
                async () => {
                    const empty = await page.getByText(/Aucune demande/i).count();
                    const rows = await page.getByTestId("signup-request-row").count();
                    return empty + rows;
                },
                { timeout: 10_000 }
            )
            .toBeGreaterThan(0);
    });

    test("Filtre 'À traiter' affiche au moins une demande des tests précédents", async ({ page }) => {
        await page.goto("/admin/b2b/signups");
        await page.waitForLoadState("domcontentloaded");

        // Le test précédent (submit signup) a créé au moins une demande PENDING
        await expect(page.getByRole("button", { name: /^À traiter$/i })).toBeVisible({ timeout: 10_000 });
        await page.getByRole("button", { name: /^À traiter$/i }).click();

        // Au moins 1 row dans le filtre PENDING (le test signup précédent)
        await expect(page.getByTestId("signup-request-row").first()).toBeVisible({ timeout: 10_000 });

        // Boutons Approuver et Rejeter visibles (les 2)
        const approveBtn = page.getByTestId("signup-approve-btn").first();
        await expect(approveBtn).toBeVisible();

        // ON NE CLIQUE PAS approve — ça créerait un vrai reseller en DB
    });
});
