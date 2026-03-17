import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const secretKey = process.env.SESSION_SECRET;
const key = new TextEncoder().encode(secretKey);

export async function encrypt(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("12h")
        .sign(key);
}

export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, key, {
        algorithms: ["HS256"],
    });
    return payload;
}

export async function createSession(user: { id: number; role: string }) {
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const session = await encrypt({ userId: user.id, userRole: user.role, expires });

    // Initial activity tracking
    await db.update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, user.id));

    cookies().set("session", session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    });
}

export async function updateSessionActivity(userId: number) {
    try {
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
    if (!session) return null;
    return await decrypt(session);
}
