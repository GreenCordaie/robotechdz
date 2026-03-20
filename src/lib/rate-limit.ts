import { RateLimitService } from "@/services/rate-limit.service";

/**
 * Migration Proxy for legacy Rate Limiting.
 * Redirects in-memory calls to the Database-Backed Service Layer.
 */

export async function checkRateLimit(key: string) {
    return await RateLimitService.checkLimit(key);
}

export async function recordFailure(key: string) {
    return await RateLimitService.recordFailure(key);
}

export async function resetRateLimit(key: string) {
    return await RateLimitService.resetLimit(key);
}
