import "server-only";
import { digitalCodes, digitalCodeSlots, productVariants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logSecurityAction } from "@/lib/security";

export interface DbLike {
    query: any;
    transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
    select: any;
    insert: any;
}

interface AccountWithVariant {
    id: number;
    expiresAt: Date | null;
    variant: { totalSlots: number | null } | null;
    slots: { slotNumber: number }[];
}

/**
 * Scans every shared digitalCode and creates missing digital_code_slots
 * so each account has `totalSlots` rows. Idempotent.
 */
export async function generateMissingSlots(
    database: DbLike,
    userId: number | null = null
): Promise<{ accountsTouched: number; slotsCreated: number }> {
    const accounts: AccountWithVariant[] = await database.query.digitalCodes.findMany({
        with: {
            variant: { columns: { totalSlots: true, isSharing: true } },
            slots: { columns: { slotNumber: true } },
        },
    });

    const work: { accountId: number; missing: number[]; expiresAt: Date | null }[] = [];
    for (const acc of accounts) {
        const total = acc.variant?.totalSlots ?? 0;
        if (!total || total < 1) continue;
        const existing = new Set(acc.slots.map((s) => s.slotNumber));
        const missing: number[] = [];
        for (let i = 1; i <= total; i++) {
            if (!existing.has(i)) missing.push(i);
        }
        if (missing.length > 0) {
            work.push({ accountId: acc.id, missing, expiresAt: acc.expiresAt });
        }
    }

    if (work.length === 0) return { accountsTouched: 0, slotsCreated: 0 };

    const slotsCreated = await database.transaction(async (tx: any) => {
        let total = 0;
        for (const w of work) {
            const rows = w.missing.map((slotNumber) => ({
                digitalCodeId: w.accountId,
                slotNumber,
                profileName: `Profil ${slotNumber}`,
                code: null,
                status: "DISPONIBLE" as const,
                expiresAt: w.expiresAt,
            }));
            await tx.insert(digitalCodeSlots).values(rows);
            total += rows.length;
        }
        return total;
    });

    await logSecurityAction({
        userId,
        action: "SHARED_ACCOUNT_SLOTS_GENERATED",
        entityType: "SHARED_ACCOUNT",
        newData: {
            accountsTouched: work.length,
            slotsCreated,
            details: work.map((w) => ({ accountId: w.accountId, added: w.missing.length })),
        },
    }).catch(() => { });

    return { accountsTouched: work.length, slotsCreated };
}
