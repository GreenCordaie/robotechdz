import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase K — Préférences notif reseller (opt-in/opt-out WhatsApp).
 *
 * SAFE :
 *   - Login reseller → /reseller/settings/notifications
 *   - 5 toggles (1 par event type)
 *   - Toggle persiste au reload
 */

test.describe("Reseller notification preferences", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/reseller/login");
        await page.locator("input[name='email'], input[type='email']").first().fill("reseller@e2e.test");
        await page.locator("input[type='password'], input[name='pin']").first().fill("1234");
        await page.locator("form button[type='submit']").first().click();
        await page.waitForURL(/\/reseller\/(dashboard|wallet|shop|orders|support)/, { timeout: 15_000 });
    });

    test("Page liste les 5 events avec toggles", async ({ page }) => {
        await page.goto("/reseller/settings/notifications");
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByRole("heading", { name: /Notifications WhatsApp/i })).toBeVisible({
            timeout: 10_000,
        });

        // 5 events attendus
        const eventKeys = [
            "wallet.recharged",
            "signup.approved",
            "signup.rejected",
            "order.confirmed",
            "order.credentials.ready",
        ];
        for (const key of eventKeys) {
            await expect(page.getByTestId(`notif-pref-row-${key}`)).toBeVisible({ timeout: 10_000 });
        }
    });

    test("Toggle wallet.recharged persiste au reload", async ({ page }) => {
        await page.goto("/reseller/settings/notifications");
        await page.waitForLoadState("domcontentloaded");
        await expect(page.getByTestId("notif-pref-row-wallet.recharged")).toBeVisible({
            timeout: 10_000,
        });

        const switchLocator = page.getByTestId("notif-pref-switch-wallet.recharged");
        const initial = await switchLocator.isChecked();

        await switchLocator.click();
        // Attendre le toast de confirmation
        await expect(page.getByText(/Notification (activée|désactivée)/i).first()).toBeVisible({
            timeout: 5_000,
        });

        await page.reload();
        await expect(page.getByTestId("notif-pref-row-wallet.recharged")).toBeVisible({
            timeout: 10_000,
        });
        const after = await page.getByTestId("notif-pref-switch-wallet.recharged").isChecked();
        expect(after).toBe(!initial);

        // Restore initial state pour ne pas polluer les autres tests
        await page.getByTestId("notif-pref-switch-wallet.recharged").click();
        await expect(page.getByText(/Notification (activée|désactivée)/i).first()).toBeVisible({
            timeout: 5_000,
        });
    });

    test("Lien Notifications dans le dropdown profil", async ({ page }) => {
        await page.goto("/reseller/dashboard");
        await page.waitForLoadState("domcontentloaded");

        await page.getByRole("button", { name: /profil/i }).click();
        const link = page.getByRole("menuitem", { name: /^Notifications$/i });
        await expect(link).toBeVisible();
        await link.click();
        await page.waitForURL(/\/reseller\/settings\/notifications/);
        await expect(page.getByRole("heading", { name: /Notifications WhatsApp/i })).toBeVisible({
            timeout: 10_000,
        });
    });
});
