import { SignJWT } from "jose";
import postgres from "postgres";
import type { BrowserContext } from "@playwright/test";

/**
 * Establish a reseller session DETERMINISTICALLY for e2e.
 *
 * The form login (POST /reseller/login → createSession) succeeds, but the
 * Set-Cookie from a Server Action that returns/redirects is NOT reliably applied
 * by the browser in the CI/Playwright (Next 14.2) environment — so the next
 * reseller server action sees "no session cookie" and throws "Session expirée".
 * (Proven via auth diagnostics across multiple CI runs.)
 *
 * To make the authenticated reseller suites deterministic, mint the session JWT
 * ourselves (same shape + HS256 secret as src/lib/jwt.ts) using the REAL seeded
 * user id + tokenVersion (queried from the DB), and inject it directly as the
 * `session` cookie via Playwright's context — bypassing the flaky form post.
 *
 * Requires DATABASE_URL + SESSION_SECRET in the test process env (both are set by
 * the CI e2e job and local .env).
 */
export async function injectResellerSession(context: BrowserContext): Promise<void> {
    const secret = process.env.SESSION_SECRET;
    const dbUrl = process.env.DATABASE_URL;
    if (!secret) throw new Error("[reseller-auth] SESSION_SECRET required");
    if (!dbUrl) throw new Error("[reseller-auth] DATABASE_URL required");

    const sql = postgres(dbUrl, { max: 1 });
    let userId: number;
    let tokenVersion: number;
    try {
        const rows = await sql`
            SELECT id, token_version FROM users
             WHERE email = 'reseller@e2e.test' AND role = 'RESELLER'
             LIMIT 1`;
        if (rows.length === 0) {
            throw new Error("[reseller-auth] no seeded reseller (reseller@e2e.test) — run seed-e2e first");
        }
        userId = Number(rows[0].id);
        tokenVersion = Number(rows[0].token_version);
    } finally {
        await sql.end();
    }

    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
        userId,
        userRole: "RESELLER",
        tokenVersion,
        expires: new Date(Date.now() + 12 * 60 * 60 * 1000),
    })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("12h")
        .sign(key);

    // Playwright: provide `url` OR `domain`+`path`, not both. With `url` the
    // domain (localhost) and path (/) are derived — passing `path` too is rejected
    // ("Cookie should have either url or path").
    await context.addCookies([
        {
            name: "session",
            value: token,
            url: "http://localhost:4555",
            httpOnly: true,
            sameSite: "Lax",
        },
    ]);
}
