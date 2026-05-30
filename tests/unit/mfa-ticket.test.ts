import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";

// The ticket helper signs with SESSION_SECRET, resolved lazily at call time.
// Set it before any issue/verify runs (module import does NOT read it).
const SECRET = "x".repeat(40);
process.env.SESSION_SECRET = SECRET;

import { issueMfaTicket, verifyMfaTicket } from "@/lib/mfa-ticket";

const key = new TextEncoder().encode(SECRET);

describe("mfa-ticket", () => {
    it("round-trips userId + role for a freshly issued ticket", async () => {
        const ticket = await issueMfaTicket(42, "ADMIN");
        expect(await verifyMfaTicket(ticket)).toEqual({ userId: 42, role: "ADMIN" });
    });

    it("rejects an empty / non-string ticket", async () => {
        expect(await verifyMfaTicket("")).toBeNull();
        expect(await verifyMfaTicket(undefined as unknown as string)).toBeNull();
        expect(await verifyMfaTicket("not-a-jwt")).toBeNull();
    });

    it("rejects a tampered ticket", async () => {
        const ticket = await issueMfaTicket(1, "RESELLER");
        const tampered = ticket.slice(0, -2) + (ticket.endsWith("a") ? "bb" : "aa");
        expect(await verifyMfaTicket(tampered)).toBeNull();
    });

    it("rejects a JWT signed with a different secret", async () => {
        const foreign = await new SignJWT({ uid: 1, role: "ADMIN", purpose: "mfa-step2" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(new TextEncoder().encode("y".repeat(40)));
        expect(await verifyMfaTicket(foreign)).toBeNull();
    });

    it("rejects a valid-signature JWT that lacks the mfa-step2 purpose", async () => {
        const noPurpose = await new SignJWT({ uid: 1, role: "ADMIN" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(key);
        expect(await verifyMfaTicket(noPurpose)).toBeNull();
    });

    it("rejects an expired ticket", async () => {
        const expired = await new SignJWT({ uid: 1, role: "ADMIN", purpose: "mfa-step2" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt(0)
            .setExpirationTime(1) // absolute epoch = 1970, long expired
            .sign(key);
        expect(await verifyMfaTicket(expired)).toBeNull();
    });

    it("rejects a ticket whose uid is not a number", async () => {
        const badUid = await new SignJWT({ uid: "42", role: "ADMIN", purpose: "mfa-step2" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(key);
        expect(await verifyMfaTicket(badUid)).toBeNull();
    });

    // The role claim is what step-2 (`verifyMfaAction` / `verifyResellerMfaAction`)
    // gates against to refuse a cross-surface ticket (e.g. a RESELLER ticket on
    // the admin verify, or vice versa). Pin the round-trip so a future change to
    // the claim shape can't silently drop the role.
    it("preserves a RESELLER role claim end-to-end", async () => {
        const ticket = await issueMfaTicket(7, "RESELLER");
        expect(await verifyMfaTicket(ticket)).toEqual({ userId: 7, role: "RESELLER" });
    });

    it("preserves a SUPER_ADMIN role claim end-to-end", async () => {
        const ticket = await issueMfaTicket(1, "SUPER_ADMIN");
        expect(await verifyMfaTicket(ticket)).toEqual({ userId: 1, role: "SUPER_ADMIN" });
    });

    it("normalizes a missing role claim to an empty string (callers must allowlist)", async () => {
        const noRole = await new SignJWT({ uid: 9, purpose: "mfa-step2" })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(key);
        expect(await verifyMfaTicket(noRole)).toEqual({ userId: 9, role: "" });
    });
});
