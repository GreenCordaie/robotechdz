import { SignJWT, jwtVerify } from "jose";

const secretKey = process.env.SESSION_SECRET;
if (!secretKey || secretKey.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
}
const key = new TextEncoder().encode(secretKey);

export async function encrypt(payload: { userId: number; userRole: string; tokenVersion: number; expires: Date }) {
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
