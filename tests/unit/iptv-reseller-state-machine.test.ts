import { describe, it, expect } from "vitest";
import {
    canTransition,
    isTerminal,
    type IptvOrderStatus,
} from "@/services/iptv-reseller.service";

/**
 * Pure unit tests for the IPTV reseller state machine. No DB, no SDK —
 * these guard the transition matrix so a future regression can't silently
 * downgrade a CANCELLED row back to ACTIVE, or skip the refund step on
 * FAILED.
 */
describe("iptv-reseller state machine", () => {
    it("allows PENDING_LOADBRAIN -> ACTIVE", () => {
        expect(canTransition("PENDING_LOADBRAIN", "ACTIVE")).toBe(true);
    });

    it("allows PENDING_LOADBRAIN -> FAILED", () => {
        expect(canTransition("PENDING_LOADBRAIN", "FAILED")).toBe(true);
    });

    it("allows ACTIVE -> FROZEN and FROZEN -> ACTIVE", () => {
        expect(canTransition("ACTIVE", "FROZEN")).toBe(true);
        expect(canTransition("FROZEN", "ACTIVE")).toBe(true);
    });

    it("allows ACTIVE -> EXPIRED -> ACTIVE (renewal)", () => {
        expect(canTransition("ACTIVE", "EXPIRED")).toBe(true);
        expect(canTransition("EXPIRED", "ACTIVE")).toBe(true);
    });

    it("allows CANCELLED -> REFUNDED only (no resurrection)", () => {
        expect(canTransition("CANCELLED", "REFUNDED")).toBe(true);
        expect(canTransition("CANCELLED", "ACTIVE")).toBe(false);
        expect(canTransition("CANCELLED", "FROZEN")).toBe(false);
    });

    it("locks FAILED as terminal", () => {
        const targets: IptvOrderStatus[] = [
            "ACTIVE",
            "FROZEN",
            "EXPIRED",
            "CANCELLED",
            "REFUNDED",
            "PENDING_LOADBRAIN",
        ];
        for (const t of targets) {
            expect(canTransition("FAILED", t)).toBe(false);
        }
        expect(isTerminal("FAILED")).toBe(true);
    });

    it("locks REFUNDED as terminal", () => {
        const targets: IptvOrderStatus[] = [
            "ACTIVE",
            "FROZEN",
            "EXPIRED",
            "CANCELLED",
            "FAILED",
            "PENDING_LOADBRAIN",
        ];
        for (const t of targets) {
            expect(canTransition("REFUNDED", t)).toBe(false);
        }
        expect(isTerminal("REFUNDED")).toBe(true);
    });

    it("rejects ACTIVE -> PENDING_LOADBRAIN (no rewinding to limbo)", () => {
        expect(canTransition("ACTIVE", "PENDING_LOADBRAIN")).toBe(false);
    });

    it("allows ACTIVE/FROZEN -> REFUNDED (chargeback path)", () => {
        expect(canTransition("ACTIVE", "REFUNDED")).toBe(true);
        expect(canTransition("FROZEN", "REFUNDED")).toBe(true);
    });

    it("rejects EXPIRED -> FROZEN (must reactivate first)", () => {
        expect(canTransition("EXPIRED", "FROZEN")).toBe(false);
    });

    it("treats self-transitions as no-op allowed", () => {
        expect(canTransition("ACTIVE", "ACTIVE")).toBe(true);
        expect(canTransition("FAILED", "FAILED")).toBe(true);
    });

    it("marks only CANCELLED/FAILED/REFUNDED as terminal", () => {
        expect(isTerminal("CANCELLED")).toBe(true);
        expect(isTerminal("FAILED")).toBe(true);
        expect(isTerminal("REFUNDED")).toBe(true);
        expect(isTerminal("ACTIVE")).toBe(false);
        expect(isTerminal("FROZEN")).toBe(false);
        expect(isTerminal("EXPIRED")).toBe(false);
        expect(isTerminal("PENDING_LOADBRAIN")).toBe(false);
    });
});
