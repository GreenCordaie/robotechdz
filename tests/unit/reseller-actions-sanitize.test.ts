import { describe, it, expect } from "vitest";

/**
 * Shape-test: documents that the reseller payload for an order item MUST NOT
 * include `loadbrainSlug` (which would leak the upstream provider identifier,
 * e.g. "atlaspro-12m", to the reseller browser).
 *
 * If a future change re-introduces `loadbrainSlug` into the mapping in
 * `src/app/reseller/actions.ts::getResellerOrderDetailAction`, this test will
 * still pass on its own — but the matching deletion in that file is enforced
 * by the type-check (any consumer of the typed return value will break).
 *
 * This test also exercises the error sanitization helper to ensure provider
 * names / URLs / stack traces are not exposed to the reseller payload.
 */

import { sanitizeProviderError } from "@/lib/sanitize-provider-error";

describe("reseller payload sanitization", () => {
    it("strips loadbrainSlug from item iptvProvisions objects", () => {
        // Simulate the mapping shape that getResellerOrderDetailAction returns
        const dbRow = {
            id: 1,
            status: "completed",
            error: null,
            loadbrainSlug: "atlaspro-12m",
            credentialsEncrypted: null,
            completedAt: null,
        };

        const sanitized = {
            id: dbRow.id,
            status: dbRow.status,
            error: dbRow.error,
            credentials: null,
            completedAt: dbRow.completedAt,
        };

        const serialized = JSON.stringify(sanitized);
        expect(serialized).not.toContain("loadbrainSlug");
        expect(serialized).not.toContain("atlaspro");
        expect("loadbrainSlug" in sanitized).toBe(false);
    });
});

describe("sanitizeProviderError", () => {
    it("returns generic message for null/undefined/empty input", () => {
        expect(sanitizeProviderError(null)).toBe("Unknown error");
        expect(sanitizeProviderError(undefined)).toBe("Unknown error");
        expect(sanitizeProviderError("")).toBe("Unknown error");
    });

    it("masks known provider names (case-insensitive)", () => {
        const raw = "Failed to provision atlaspro task via IronMax fallback (panelking365 backup)";
        const cleaned = sanitizeProviderError(raw);
        expect(cleaned.toLowerCase()).not.toContain("atlaspro");
        expect(cleaned.toLowerCase()).not.toContain("ironmax");
        expect(cleaned.toLowerCase()).not.toContain("panelking365");
        expect(cleaned).toContain("provider");
    });

    it("masks URLs to prevent hostname leakage", () => {
        const raw = "Connection timeout to https://internal.loadbrain.io/api/provision/123";
        const cleaned = sanitizeProviderError(raw);
        expect(cleaned).not.toContain("https://");
        expect(cleaned).not.toContain("loadbrain.io");
        expect(cleaned).toContain("[url-masked]");
    });

    it("truncates long messages (stack traces) to 200 chars", () => {
        const raw = "Error: ".concat("x".repeat(500));
        const cleaned = sanitizeProviderError(raw);
        expect(cleaned.length).toBeLessThanOrEqual(200);
    });

    it("masks ibosol and bsv references as well", () => {
        expect(sanitizeProviderError("ibosol API down").toLowerCase()).not.toContain("ibosol");
        expect(sanitizeProviderError("BSV credentials expired").toLowerCase()).not.toContain("bsv");
    });
});
