import { Redis } from "@upstash/redis";

// Utilisation d'Upstash Redis (HTTP) pour la compatibilité Edge / Cloudflare Pages
export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

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
