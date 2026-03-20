import { cookies, headers } from "next/headers";
import { encrypt, decrypt } from "./jwt";

async function getAuthDeps() {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    return { db, users, eq };
}

export async function createSession(user: { id: number; role: string; tokenVersion: number }) {
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const session = await encrypt({ userId: user.id, userRole: user.role, tokenVersion: user.tokenVersion, expires });

    // Initial activity tracking
    const { db, users, eq } = await getAuthDeps();
    await db.update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, user.id));

    const headerList = headers();
    const isHttps = headerList.get("x-forwarded-proto") === "https";

    cookies().set("session", session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" || isHttps,
        sameSite: "lax",
        path: "/",
    });
}

export async function updateSessionActivity(userId: number) {
    try {
        const { db, users, eq } = await getAuthDeps();
        await db.update(users)
            .set({ lastActiveAt: new Date() })
            .where(eq(users.id, userId));
    } catch (error) {
        console.error("Failed to update session activity:", error);
    }
}

export async function deleteSession() {
    cookies().delete("session");
}

export async function getSession() {
    const session = cookies().get("session")?.value;
    if (!session) {
        const headerList = headers();
        const host = headerList.get("host");
        console.log(`🚫 SESSION COOKIE MISSING (Host: ${host})`);
        return null;
    }
    try {
        const payload = await decrypt(session);
        return payload;
    } catch (e) {
        console.error("🚫 SESSION DECRYPT FAILED:", e);
        return null;
    }
}
