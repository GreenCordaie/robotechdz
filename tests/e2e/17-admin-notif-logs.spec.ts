import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase L2 — Notification logs admin viewer.
 *
 * SAFE :
 *   - Login admin → /admin/settings/notifications/logs
 *   - KPIs + filtres visibles
 *   - Lien depuis page templates
 */

test.describe("Admin notification logs", () => {
    test.setTimeout(120_000);

    test.beforeEach(async ({ page }) => {
        await page.goto("/admin/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("admin@e2e.test");
        await page.locator("input[type='password']").first().fill("AdminTest123!");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/admin\/(dashboard|catalogue|iptv)/, { timeout: 30_000 });
    });

    test("Page logs : header + KPIs + filtres", async ({ page }) => {
        await page.goto("/admin/settings/notifications/logs", { timeout: 60_000 });
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Notification Logs/i })).toBeVisible({
            timeout: 15_000,
        });

        // 4 KPIs (Total / Délivrés / Échecs / Taux)
        await expect(page.getByText(/Total/i).first()).toBeVisible();
        await expect(page.getByText(/Délivrés/i).first()).toBeVisible();
        await expect(page.getByText(/Échecs/i).first()).toBeVisible();
        await expect(page.getByText(/Taux de succès/i)).toBeVisible();

        // Filtres status
        await expect(page.getByTestId("logs-status-ALL")).toBeVisible();
        await expect(page.getByTestId("logs-status-DELIVERED")).toBeVisible();
        await expect(page.getByTestId("logs-status-FAILED")).toBeVisible();

        // État : aucun log OU rows visibles
        await expect
            .poll(
                async () => {
                    const empty = await page.getByText(/Aucun log/i).count();
                    const rows = await page.getByTestId("log-row").count();
                    return empty + rows;
                },
                { timeout: 10_000 }
            )
            .toBeGreaterThan(0);
    });

    test("Lien depuis page templates vers logs", async ({ page }) => {
        await page.goto("/admin/settings/notifications", { timeout: 60_000 });
        await page.waitForLoadState("domcontentloaded");

        await expect(
            page.getByRole("heading", { name: /Templates notifications WhatsApp/i })
        ).toBeVisible({ timeout: 15_000 });

        const link = page.getByTestId("notif-logs-link");
        await expect(link).toBeVisible();
        await link.click();
        await page.waitForURL(/\/admin\/settings\/notifications\/logs/);
        await expect(page.getByRole("heading", { name: /Notification Logs/i })).toBeVisible({
            timeout: 15_000,
        });
    });
});
