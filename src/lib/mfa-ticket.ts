import "server-only";
import { SignJWT, jwtVerify } from "jose";

/**
 * Short-lived signed ticket bridging the two-step login (password/PIN → TOTP).
 *
 * Step 1 verifies the password/PIN and, when 2FA is enabled, issues a ticket
 * bound to the userId+role. Step 2 (`verify*MfaAction`) takes the ticket — NOT
 * a raw client-supplied userId — so the TOTP check can only run for a user who
 * actually passed step 1. Closes the IDOR / password-bypass where an attacker
 * holding only a victim's TOTP could authenticate by posting their userId.
 *
 * TTL is intentionally short: the user must enter their code within 5 minutes.
 * Signed with the same HS256 SESSION_SECRET as the session cookie. The key is
 * resolved lazily (per call) so importing this module never crashes a context
 * that has no secret (e.g. unit tests of unrelated code).
 */

const MFA_TICKET_TTL = "5m";
const PURPOSE = "mfa-step2";

function getKey(): Uint8Array {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("SESSION_SECRET must be at least 32 characters");
    }
    return new TextEncoder().encode(secret);
}

export interface MfaTicketClaims {
    userId: number;
    role: string;
}

export async function issueMfaTicket(userId: number, role: string): Promise<string> {
    return await new SignJWT({ uid: userId, role, purpose: PURPOSE })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(MFA_TICKET_TTL)
        .sign(getKey());
}

/**
 * Returns the bound claims for a valid, unexpired ticket, or null for anything
 * else (bad signature, expired, wrong purpose, malformed). Never throws.
 */
export async function verifyMfaTicket(ticket: string): Promise<MfaTicketClaims | null> {
    if (!ticket || typeof ticket !== "string") return null;
    try {
        const { payload } = await jwtVerify(ticket, getKey(), { algorithms: ["HS256"] });
        if (payload.purpose !== PURPOSE) return null;
        if (typeof payload.uid !== "number") return null;
        const role = typeof payload.role === "string" ? payload.role : "";
        return { userId: payload.uid, role };
    } catch {
        return null;
    }
}
