import { test, expect } from "@playwright/test";

/**
 * EPIC 1 / Phase G4 — Cron rétention DLQ webhook.
 *
 * Auth-only tests (pas de DB state spécifique).
 */

test.describe("Cron webhook-cleanup", () => {
    test("GET sans secret → 401", async ({ request }) => {
        const res = await request.get("/api/admin/cron/webhook-cleanup");
        expect(res.status()).toBe(401);
    });

    test("GET avec mauvais secret → 401", async ({ request }) => {
        const res = await request.get("/api/admin/cron/webhook-cleanup", {
            headers: { Authorization: "Bearer wrong-secret" },
        });
        expect(res.status()).toBe(401);
    });

    test("GET avec bon secret → 200 + counts", async ({ request }) => {
        const secret = process.env.CRON_SECRET || "test_cron_secret_xxx";
        const res = await request.get("/api/admin/cron/webhook-cleanup", {
            headers: { Authorization: `Bearer ${secret}` },
        });
        expect(res.status()).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(typeof json.resolvedDeleted).toBe("number");
        expect(typeof json.deadDeleted).toBe("number");
        expect(json.cutoffs).toBeDefined();
    });
});
