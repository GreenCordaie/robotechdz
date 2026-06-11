import { test, expect } from "@playwright/test";
import postgres from "postgres";

/**
 * Verifies the reseller "Mes Commandes" page shows a game top-up order with a
 * human title (game · package) + player name, plus a reveal button — instead of
 * "Produit game:NNNN". Real games checkout is blocked upstream (403 g2bulk:order
 * scope), so we SEED a delivered game order directly in the DB, then assert the UI.
 *
 * Login pattern mirrors 02-reseller-flow.spec.ts (reseller@e2e.test / PIN 1234).
 */

const TITLE = "Freefire Global · 110";
const PLAYER = "2040376982";

async function loginAsReseller(page: import("@playwright/test").Page) {
    await page.goto("/reseller/login");
    await page.locator("input[type='email'], input[name='email']").first().fill("reseller@e2e.test");
    await page
        .locator("input[type='password'], input[name='pin'], input[name='pinCode']")
        .first()
        .fill("1234");
    await page.locator("form button[type='submit']").first().click();
    await page.waitForURL(/\/reseller\/(dashboard|wallet|shop|orders|support)/, { timeout: 15_000 });
}

test("reseller game order shows package title + player and reveals code", async ({ page }) => {
    const sql = postgres(process.env.DATABASE_URL!);
    let localOrderId = 0;
    try {
        // The reseller seeded for the e2e suite (linked to reseller@e2e.test).
        const [reseller] = await sql`
            SELECT r.id FROM resellers r
            JOIN users u ON u.id = r.user_id
            WHERE u.email = 'reseller@e2e.test'
            LIMIT 1`;
        test.skip(!reseller, "no e2e reseller seeded (reseller@e2e.test)");

        const orderNumber = `G2G-E2E-${Date.now()}`;
        const [order] = await sql`
            INSERT INTO orders (order_number, status, total_amount, montant_paye, reste_a_payer, reseller_id, source, delivery_method)
            VALUES (${orderNumber}, 'LIVRE', '235.75', '235.75', '0', ${reseller.id}, 'B2B_WEB', 'TICKET')
            RETURNING id`;
        localOrderId = order.id;

        const [g2b] = await sql`
            INSERT INTO g2bulk_orders (local_order_id, reseller_id, product_id, quantity, price_paid_dzd, status, won_snapshot)
            VALUES (${order.id}, ${reseller.id}, 'game:2055', 1, '235.75', 'COMPLETED',
                ${sql.json({ kind: "game", gameCode: "freefire_global", title: TITLE, playerName: PLAYER })})
            RETURNING id`;

        // Placeholder code — decryption will fail gracefully; we only assert the
        // reveal button renders (status COMPLETED + >=1 code).
        await sql`
            INSERT INTO g2bulk_delivered_codes (g2bulk_order_id, code, redemption_url, pin)
            VALUES (${g2b.id}, 'enc-placeholder', NULL, NULL)`;

        await loginAsReseller(page);
        await page.goto("/reseller/orders");

        const section = page.getByTestId("g2bulk-orders-section");
        await expect(section).toBeVisible({ timeout: 15_000 });
        await expect(section).toContainText(TITLE);
        await expect(section).toContainText(PLAYER);
        await expect(section).not.toContainText("Produit game:2055");

        // Reveal toggle present for the delivered order.
        const reveal = section.getByRole("button", { name: /voir le\(s\) code\(s\)/i }).first();
        await expect(reveal).toBeVisible();
        await reveal.click();
        await expect(section.getByRole("button", { name: /masquer/i }).first()).toBeVisible();
    } finally {
        if (localOrderId) {
            // Cascades to g2bulk_orders + g2bulk_delivered_codes (ON DELETE CASCADE).
            await sql`DELETE FROM orders WHERE id = ${localOrderId}`;
        }
        await sql.end();
    }
});
