import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { eq, sql, and, gt } from "drizzle-orm";

const MAX_ATTEMPTS = 20;
const WINDOW_MINUTES = 15;

/**
 * Service Layer for Rate Limiting.
 * Uses database persistence to track attempts across nodes and restarts.
 */
export class RateLimitService {

    /**
     * Checks if a key is currently blocked.
     * Returns { isBlocked: boolean, remaining: number, blockedUntil?: Date }
     */
    static async checkLimit(key: string) {
        const now = new Date();

        const entry = await db.query.rateLimits.findFirst({
            where: eq(rateLimits.key, key)
        });

        if (!entry) {
            return { isBlocked: false, remaining: MAX_ATTEMPTS };
        }

        // Check if block has expired
        if (entry.expiresAt < now) {
            // Reset entry if expired
            await db.delete(rateLimits).where(eq(rateLimits.key, key));
            return { isBlocked: false, remaining: MAX_ATTEMPTS };
        }

        const isCurrentlyBlocked = entry.points >= MAX_ATTEMPTS;
        return {
            isBlocked: isCurrentlyBlocked,
            remaining: Math.max(0, MAX_ATTEMPTS - entry.points),
            blockedUntil: entry.expiresAt
        };
    }

    /**
     * Records a failure for a key.
     */
    static async recordFailure(key: string) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + WINDOW_MINUTES * 60000);

        const entry = await db.query.rateLimits.findFirst({
            where: eq(rateLimits.key, key)
        });

        if (!entry) {
            await db.insert(rateLimits).values({
                key,
                points: 1,
                expiresAt
            });
        } else {
            // Increment points and update expiry if it was already expired or just keep window
            const newPoints = entry.points + 1;
            await db.update(rateLimits)
                .set({
                    points: newPoints,
                    // If we just hit the limit, set the block expiry from now
                    expiresAt: newPoints >= MAX_ATTEMPTS ? expiresAt : entry.expiresAt
                })
                .where(eq(rateLimits.key, key));
        }
    }

    /**
     * Resets rate limit for a key (on success).
     */
    static async resetLimit(key: string) {
        await db.delete(rateLimits).where(eq(rateLimits.key, key));
    }
}
