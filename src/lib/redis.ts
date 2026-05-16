import { Redis } from "@upstash/redis";

/**
 * Si UPSTASH non configuré (dev/test), on retourne un client no-op.
 * Sans ce fallback, le rate-limit fail-closed bloque TOUS les logins (SPOF).
 *
 * En prod : ENCRYPTION_KEY / SESSION_SECRET / UPSTASH_REDIS_REST_URL sont set,
 * comportement strictement inchangé.
 */
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const noopRedis = {
    get: async () => null,
    set: async () => "OK",
    del: async () => 0,
    incr: async () => 0,
    expire: async () => 0,
    ttl: async () => -2,
} as unknown as Redis;

export const redis: Redis =
    upstashUrl && upstashToken
        ? new Redis({ url: upstashUrl, token: upstashToken })
        : (() => {
              if (process.env.NODE_ENV === "production") {
                  console.warn(
                      "[redis] UPSTASH_REDIS_REST_URL/TOKEN absentes en PROD — rate-limit + cache désactivés (no-op)."
                  );
              }
              return noopRedis;
          })();

// ---------------------------------------------------------------------------
// Helpers — all with try/catch for graceful degradation
// ---------------------------------------------------------------------------

export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        const data = await redis.get<T>(key);
        return data;
    } catch {
        return null;
    }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
        await redis.set(key, value, { ex: ttlSeconds });
    } catch {
        // no-op on error
    }
}

export async function cacheDel(...keys: string[]): Promise<void> {
    try {
        if (keys.length > 0) await redis.del(...keys);
    } catch {
        // no-op on error
    }
}

export async function cacheIncr(key: string): Promise<number> {
    try {
        return await redis.incr(key);
    } catch {
        return 0;
    }
}

export async function cacheExpire(key: string, ttlSeconds: number): Promise<void> {
    try {
        await redis.expire(key, ttlSeconds);
    } catch {
        // no-op on error
    }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CACHE_KEYS = {
    KIOSK_CATALOGUE: "kiosk:catalogue",
    DASHBOARD: (period: string) => `admin:dashboard:${period}`,
    DASHBOARD_ALL: ["today", "yesterday", "week", "month", "all"].map(
        (p) => `admin:dashboard:${p}`
    ),
    RATE_LIMIT: (ip: string, action: string) => `ratelimit:${ip}:${action}`,
} as const;

export const CACHE_TTL = {
    KIOSK_CATALOGUE: 60,
    DASHBOARD: 300,
    RATE_LIMIT: 900,
} as const;
