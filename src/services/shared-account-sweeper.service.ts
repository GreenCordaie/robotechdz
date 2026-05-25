import "server-only";
import { digitalCodeSlots } from "@/db/schema";
import { eq, and, lt, inArray } from "drizzle-orm";
import { logSecurityAction } from "@/lib/security";

/**
 * Grace period (ms) before an expired slot is swept.
 * Avoids race conditions during order checkout.
 */
export const EXPIRATION_GRACE_MS = 5 * 60 * 1000; // 5 minutes

export interface DbLike {
    query: any;
    transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
    update: any;
    select: any;
}

/**
 * Returns slot IDs eligible for expiration:
 * - status = 'DISPONIBLE'
 * - expires_at is set
 * - expires_at < (now - 5 min grace)
 */
export async function findExpiredSlots(database: DbLike): Promise<number[]> {
    const threshold = new Date(Date.now() - EXPIRATION_GRACE_MS);
    const rows = await database
        .select({ id: digitalCodeSlots.id })
        .from(digitalCodeSlots)
        .where(
            and(
                eq(digitalCodeSlots.status, "DISPONIBLE"),
                lt(digitalCodeSlots.expiresAt, threshold)
            )
        );
    return rows.map((r: { id: number }) => r.id);
}

/**
 * Bulk-marks slots as EXPIRE inside a transaction and logs an audit event.
 */
export async function expireSlots(
    database: DbLike,
    slotIds: number[],
    reason: string = "auto-sweep"
): Promise<{ expired: number }> {
    if (slotIds.length === 0) return { expired: 0 };

    const expired = await database.transaction(async (tx: any) => {
        await tx
            .update(digitalCodeSlots)
            .set({ status: "EXPIRE" })
            .where(inArray(digitalCodeSlots.id, slotIds));
        return slotIds.length;
    });

    await logSecurityAction({
        userId: null,
        action: "SHARED_ACCOUNT_SLOT_EXPIRED",
        entityType: "SHARED_ACCOUNT_SLOT",
        newData: { slotIds, count: expired, reason },
    }).catch(() => { });

    return { expired };
}

/**
 * Composes findExpiredSlots + expireSlots. Returns metrics.
 */
export async function sweepExpiredSlots(
    database: DbLike
): Promise<{ expired: number; took_ms: number }> {
    const t0 = Date.now();
    const ids = await findExpiredSlots(database);
    const { expired } = await expireSlots(database, ids, "scheduled-sweep");
    return { expired, took_ms: Date.now() - t0 };
}
