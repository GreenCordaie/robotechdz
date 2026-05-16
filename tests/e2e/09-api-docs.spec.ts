import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase I — Documentation API publique.
 *
 * SAFE :
 *   - Page /api-docs accessible publiquement (pas d'auth)
 *   - Spec /openapi.yaml téléchargeable
 *   - Aucun appel API externe
 */

test.describe("API Docs publique", () => {
    test("/api-docs : header + bouton OpenAPI yaml + container Stoplight", async ({ page }) => {
        await page.goto("/api-docs");
        await page.waitForLoadState("domcontentloaded");

        // Header présent (multiple matches car Stoplight render aussi le titre depuis le yaml)
        await expect(page.getByRole("heading", { name: /API Partenaires/i }).first()).toBeVisible({
            timeout: 10_000,
        });

        // Bouton de téléchargement de la spec yaml
        await expect(page.getByTestId("openapi-yaml-link")).toBeVisible();

        // Container Stoplight (custom element <elements-api>)
        await expect(page.getByTestId("api-docs-container")).toBeVisible();
    });

    test("/openapi.yaml : spec accessible avec content-type yaml", async ({ request }) => {
        const res = await request.get("/openapi.yaml");
        expect(res.status()).toBe(200);
        const body = await res.text();
        expect(body).toContain("openapi: 3.1.0");
        expect(body).toContain("FLEXBOX DIRECT");
        expect(body).toContain("/api/v1/orders");
        expect(body).toContain("X-Robotech-Signature");
    });

    test("/openapi.yaml : tous les endpoints v1 documentés", async ({ request }) => {
        const res = await request.get("/openapi.yaml");
        const body = await res.text();

        // Endpoints documentés
        expect(body).toContain("/api/v1/public/catalog:");
        expect(body).toContain("/api/v1/public/settings:");
        expect(body).toContain("/api/v1/products:");
        expect(body).toContain("/api/v1/products/{id}:");
        expect(body).toContain("/api/v1/orders:");
        expect(body).toContain("/api/v1/orders/{id}:");

        // Webhooks documentés
        expect(body).toContain("order.paid:");
        expect(body).toContain("credentials.ready:");
        expect(body).toContain("wallet.recharged:");
    });
});
