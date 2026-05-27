import "server-only";
import { cacheIncr, cacheExpire } from "@/lib/redis";

/**
 * Best-effort per-IP rate limit for unauthenticated, CDN-cached public
 * endpoints. Fails OPEN (allowed) when Redis is unavailable — for read-only
 * public reads, availability beats strict enforcement. It's a backstop against
 * cache-bypass scraping, not a security boundary.
 */
export async function publicIpRateLimited(
    ip: string,
    opts: { bucket: string; limit: number; windowSec: number }
): Promise<boolean> {
    try {
        const key = `pubrl:${opts.bucket}:${ip}`;
        const count = await cacheIncr(key);
        if (count === 1) await cacheExpire(key, opts.windowSec);
        return count > opts.limit;
    } catch {
        return false; // fail open
    }
}

/** Best-effort client IP extraction (Cloudflare first, then standard headers). */
export function clientIpFrom(req: Request): string {
    const h = req.headers;
    return (
        h.get("cf-connecting-ip") ||
        h.get("x-real-ip") ||
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
    );
}
