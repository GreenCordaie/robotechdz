import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export const redis =
    globalForRedis.redis ??
    new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
    });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// ---------------------------------------------------------------------------
// Helpers — all with try/catch for graceful degradation
// ---------------------------------------------------------------------------

export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        const raw = await redis.get(key);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
        await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
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
