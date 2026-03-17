type RateLimitEntry = {
    count: number;
    lastAttempt: number;
    blockedUntil: number | null;
};

const limits = new Map<string, RateLimitEntry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks if a key (IP or Email) is rate-limited.
 * Returns { isBlocked: boolean, remainingAttempts: number, blockedUntil: number | null }
 */
export function checkRateLimit(key: string) {
    const now = Date.now();
    let entry = limits.get(key);

    // Clean up if expired
    if (entry && (now - entry.lastAttempt > WINDOW_MS) && !entry.blockedUntil) {
        limits.delete(key);
        entry = undefined;
    }

    if (!entry) {
        return { isBlocked: false, remainingAttempts: MAX_ATTEMPTS, blockedUntil: null };
    }

    if (entry.blockedUntil && now < entry.blockedUntil) {
        return { isBlocked: true, remainingAttempts: 0, blockedUntil: entry.blockedUntil };
    }

    // Reset if block expired
    if (entry.blockedUntil && now >= entry.blockedUntil) {
        limits.delete(key);
        return { isBlocked: false, remainingAttempts: MAX_ATTEMPTS, blockedUntil: null };
    }

    const remaining = Math.max(0, MAX_ATTEMPTS - entry.count);
    return { isBlocked: entry.count >= MAX_ATTEMPTS, remainingAttempts: remaining, blockedUntil: entry.blockedUntil };
}

/**
 * Records a failed attempt for a key.
 */
export function recordFailure(key: string) {
    const now = Date.now();
    let entry = limits.get(key);

    if (!entry) {
        entry = { count: 1, lastAttempt: now, blockedUntil: null };
    } else {
        entry.count += 1;
        entry.lastAttempt = now;
        if (entry.count >= MAX_ATTEMPTS) {
            entry.blockedUntil = now + BLOCK_DURATION_MS;
        }
    }

    limits.set(key, entry);
    return entry;
}

/**
 * Resets rate limit for a key (on successful login).
 */
export function resetRateLimit(key: string) {
    limits.delete(key);
}
