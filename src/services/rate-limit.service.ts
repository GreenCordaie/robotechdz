import { cacheIncr, cacheExpire, cacheDel, CACHE_TTL, redis } from "@/lib/redis";

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Service Layer for Rate Limiting.
 * Uses Redis (INCR + EXPIRE) for distributed, atomic rate limiting.
 * Falls back gracefully if Redis is unavailable (all helpers have try/catch).
 */
export class RateLimitService {

    /**
     * Checks if a key is currently blocked.
     * Returns { isBlocked: boolean, remaining: number, blockedUntil?: Date }
     */
    static async checkLimit(key: string, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
        try {
            const raw = await redis.get(key);
            const count = raw !== null ? parseInt(raw, 10) : 0;
            const isBlocked = count >= maxAttempts;

            let blockedUntil: Date | undefined;
            if (isBlocked) {
                // Get remaining TTL to compute blockedUntil
                const ttl = await redis.ttl(key);
                if (ttl > 0) {
                    blockedUntil = new Date(Date.now() + ttl * 1000);
                } else {
                    blockedUntil = new Date(Date.now() + CACHE_TTL.RATE_LIMIT * 1000);
                }
            }

            return {
                isBlocked,
                remaining: Math.max(0, maxAttempts - count),
                blockedUntil,
            };
        } catch {
            // Fail-closed: block requests when Redis is unavailable
            return { isBlocked: true, remaining: 0 };
        }
    }

    /**
     * Records a failure for a key.
     * On the first increment, sets the TTL window.
     */
    static async recordFailure(key: string) {
        try {
            const count = await cacheIncr(key);
            // Always set TTL to prevent permanent lockout if EXPIRE fails separately
            await cacheExpire(key, CACHE_TTL.RATE_LIMIT);
        } catch {
            // Fail silently — rate limit is best-effort
        }
    }

    /**
     * Resets rate limit for a key (on success).
     */
    static async resetLimit(key: string) {
        await cacheDel(key);
    }
}
