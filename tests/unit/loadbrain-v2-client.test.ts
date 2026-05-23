import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// `server-only` throws on import outside a Server Component graph; vitest runs
// node-side and triggers that guard. Stub it out for the test.
vi.mock("server-only", () => ({}));

/**
 * The `loadbrain-v2` module reads env at import time, so we must reset the
 * module registry between cases to exercise both "no API key" and "configured"
 * paths.
 */

const ORIGINAL_ENV = { ...process.env };

describe("loadbrain-v2 client", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it("exports lbV2 = null when LOADBRAIN_API_KEY is not set", async () => {
        delete process.env.LOADBRAIN_API_KEY;

        const mod = await import("@/lib/loadbrain-v2");

        expect(mod.lbV2).toBeNull();
        expect(mod.isLoadBrainV2Enabled()).toBe(false);
    });

    it("exposes the expected method shape when configured", async () => {
        process.env.LOADBRAIN_API_KEY = "test-key";
        process.env.LOADBRAIN_URL = "https://loadbrain.example.com";

        const mod = await import("@/lib/loadbrain-v2");

        expect(mod.lbV2).not.toBeNull();
        // Namespaces present
        expect(typeof mod.lbV2?.iptv).toBe("object");
        expect(typeof mod.lbV2?.iptv.apps).toBe("object");
        expect(typeof mod.lbV2?.iptv.apps.list).toBe("function");
        expect(typeof mod.lbV2?.iptv.products.list).toBe("function");
        expect(typeof mod.lbV2?.catalog.aggregate).toBe("function");
        expect(typeof mod.lbV2?.provision.tasks.create).toBe("function");
        expect(typeof mod.lbV2?.giftcards.catalog.list).toBe("function");
        expect(typeof mod.lbV2?.marketplace.products.list).toBe("function");
    });
});
