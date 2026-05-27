import "server-only";
import crypto from "crypto";
import { eq, and, or, gt, isNull } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import {
    slotActivationTokens,
    digitalCodeSlots,
    digitalCodes,
    slotLifecycle,
} from "@/db/schema";

/**
 * Slot Activation Token service — generates and resolves URL-safe tokens that
 * grant a customer access to the per-slot streaming deeplink page without auth.
 */

const DEFAULT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days fallback

export function generateToken(): string {
    // 12 random bytes → 96 bits, base64url = 16 chars (the column is varchar(16)).
    // Up from 9 bytes / 72 bits (~16M× harder to brute-force within the validity
    // window). Widening the column to reach 256 bits is a separate migration.
    // Cryptographically random, URL-safe. Existing tokens stay valid (exact lookup).
    return crypto.randomBytes(12).toString("base64url");
}

export interface CreatedToken {
    token: string;
    validUntil: Date;
}

/**
 * Generates and persists an activation token for a given slot. The validity
 * mirrors the slot's `expiresAt`. If the slot has no expiry, falls back to
 * now + 30 days.
 */
export async function createTokenForSlot(
    db: any,
    slotId: number
): Promise<CreatedToken> {
    const slot = await db.query.digitalCodeSlots.findFirst({
        where: eq(digitalCodeSlots.id, slotId),
    });
    if (!slot) throw new Error(`Slot ${slotId} not found`);

    const validUntil = slot.expiresAt
        ? new Date(slot.expiresAt)
        : new Date(Date.now() + DEFAULT_VALIDITY_MS);

    // Retry on collision (extremely unlikely with 9 random bytes)
    for (let attempt = 0; attempt < 5; attempt++) {
        const token = generateToken();
        try {
            await db.insert(slotActivationTokens).values({
                token,
                slotId,
                validUntil,
            });
            return { token, validUntil };
        } catch (err: any) {
            if (attempt === 4) throw err;
            // Try again on unique violation
        }
    }
    throw new Error("Failed to generate unique activation token");
}

export interface ResolvedSlot {
    tokenRow: typeof slotActivationTokens.$inferSelect;
    slot: typeof digitalCodeSlots.$inferSelect;
    account: typeof digitalCodes.$inferSelect;
    lifecycle: typeof slotLifecycle.$inferSelect | null;
}

/**
 * Looks up an active slot via its activation token. Returns null if the token
 * is unknown or expired.
 */
export async function findActiveSlotByToken(
    db: any,
    token: string
): Promise<ResolvedSlot | null> {
    if (!token || typeof token !== "string") return null;

    const tokenRow = await db.query.slotActivationTokens.findFirst({
        where: eq(slotActivationTokens.token, token),
    });
    if (!tokenRow) return null;
    if (tokenRow.validUntil && new Date(tokenRow.validUntil).getTime() < Date.now()) {
        return null;
    }

    const slot = await db.query.digitalCodeSlots.findFirst({
        where: eq(digitalCodeSlots.id, tokenRow.slotId),
    });
    if (!slot) return null;

    const account = await db.query.digitalCodes.findFirst({
        where: eq(digitalCodes.id, slot.digitalCodeId),
    });
    if (!account) return null;

    const lifecycle = await db.query.slotLifecycle.findFirst({
        where: eq(slotLifecycle.slotId, slot.id),
    }) ?? null;

    return { tokenRow, slot, account, lifecycle };
}

/**
 * Updates `last_seen_at` for the token. Used to mark the customer as actively
 * watching the page (drives mailbox polling intensity).
 */
export async function touchPageSeen(db: any, token: string): Promise<void> {
    if (!token) return;
    // Only touch a known, still-valid token. An arbitrary/expired token matches
    // zero rows, so this unauthenticated endpoint can't be used to write at will
    // or amplify mailbox polling.
    await db
        .update(slotActivationTokens)
        .set({ lastSeenAt: new Date() })
        .where(and(
            eq(slotActivationTokens.token, token),
            or(
                isNull(slotActivationTokens.validUntil),
                gt(slotActivationTokens.validUntil, new Date())
            )
        ));
}

/**
 * Convenience: regenerate validity (e.g. after slot renewal).
 */
export async function extendTokenValidity(
    db: any,
    slotId: number,
    newValidUntil: Date
): Promise<void> {
    await db
        .update(slotActivationTokens)
        .set({ validUntil: newValidUntil })
        .where(eq(slotActivationTokens.slotId, slotId));
}

export const __forTests = { DEFAULT_VALIDITY_MS };
