import "server-only";
import crypto from "crypto";
import { db } from "@/db";
import { partnerApiKeys, apiLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cacheIncr, cacheExpire } from "@/lib/redis";
import type { NextRequest } from "next/server";

export const API_RATE_LIMIT = 100; // req/min per key

export async function authenticateApiKey(request: NextRequest) {
    const key = request.headers.get("x-api-key") || request.headers.get("X-API-Key");
    if (!key) return null;

    const keyHash = crypto.createHash("sha256").update(key).digest("hex");

    const apiKey = await db.query.partnerApiKeys.findFirst({
        where: and(
            eq(partnerApiKeys.keyHash, keyHash),
            eq(partnerApiKeys.isActive, true)
        ),
    });

    if (!apiKey) return null;

    // Fire-and-forget: update lastUsedAt
    db.update(partnerApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(partnerApiKeys.id, apiKey.id))
        .catch(() => {});

    return { apiKey, keyHash };
}

export async function checkApiRateLimit(keyHash: string): Promise<boolean> {
    try {
        const rateLimitKey = `ratelimit:${keyHash}:api`;
        const count = await cacheIncr(rateLimitKey);
        if (count === 1) {
            await cacheExpire(rateLimitKey, 60); // 1 minute window
        }
        return count > API_RATE_LIMIT;
    } catch {
        return false; // graceful degradation
    }
}

export async function logApiCall(
    apiKeyId: number,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number
): Promise<void> {
    db.insert(apiLogs).values({
        apiKeyId,
        endpoint,
        method,
        statusCode,
        responseTimeMs,
    }).catch(() => {});
}
