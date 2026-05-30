import { describe, it, expect } from "vitest";
import { deriveEffectiveStatus } from "@/lib/iptv-effective-status";

/**
 * Bug #2 — reseller history "actif" must never appear once the line has
 * actually expired (regardless of whether the panel still reports
 * `active=true`). The display layer derives a status from `expiresAt`
 * independently of the raw mirror status, so all 3 providers
 * (panelking365 / atlaspro / ironmax) behave identically.
 */
describe("deriveEffectiveStatus", () => {
    const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const PAST = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    it("returns EXPIRED when expiresAt is in the past, even if status=ACTIVE", () => {
        expect(deriveEffectiveStatus("ACTIVE", PAST)).toBe("EXPIRED");
    });

    it("returns EXPIRED when expiresAt is in the past, even if status=FROZEN", () => {
        expect(deriveEffectiveStatus("FROZEN", PAST)).toBe("EXPIRED");
    });

    it("returns ACTIVE when expiresAt is in the future", () => {
        expect(deriveEffectiveStatus("ACTIVE", FUTURE)).toBe("ACTIVE");
    });

    it("preserves ACTIVE when expiresAt is missing (no expiry data → trust mirror)", () => {
        expect(deriveEffectiveStatus("ACTIVE", null)).toBe("ACTIVE");
        expect(deriveEffectiveStatus("ACTIVE", undefined)).toBe("ACTIVE");
    });

    it("never overrides terminal mirror states (CANCELLED / FAILED / REFUNDED)", () => {
        expect(deriveEffectiveStatus("CANCELLED", PAST)).toBe("CANCELLED");
        expect(deriveEffectiveStatus("FAILED", PAST)).toBe("FAILED");
        expect(deriveEffectiveStatus("REFUNDED", PAST)).toBe("REFUNDED");
    });

    it("does NOT flip PENDING_LOADBRAIN to EXPIRED (still provisioning)", () => {
        expect(deriveEffectiveStatus("PENDING_LOADBRAIN", PAST)).toBe(
            "PENDING_LOADBRAIN",
        );
    });

    it("accepts a Date object too", () => {
        expect(deriveEffectiveStatus("ACTIVE", new Date(Date.now() - 1000))).toBe(
            "EXPIRED",
        );
    });

    it("ignores an unparseable expiresAt string", () => {
        expect(deriveEffectiveStatus("ACTIVE", "not-a-date")).toBe("ACTIVE");
    });

    it("falls back to PENDING_LOADBRAIN for an unknown status string", () => {
        expect(deriveEffectiveStatus("SOMETHING_ELSE", FUTURE)).toBe(
            "PENDING_LOADBRAIN",
        );
    });
});
