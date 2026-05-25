import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security", () => ({
    logSecurityAction: vi.fn().mockResolvedValue(undefined),
}));

import { generateMissingSlots } from "@/services/shared-account-orphan-generator.service";
import { logSecurityAction } from "@/lib/security";

interface Acc {
    id: number;
    expiresAt: Date | null;
    variant: { totalSlots: number | null; isSharing: boolean } | null;
    slots: { slotNumber: number }[];
}

function makeDb(accounts: Acc[]) {
    const inserted: any[] = [];
    const db = {
        query: {
            digitalCodes: {
                findMany: async (_opts: any) => accounts,
            },
        } as any,
        transaction: async (fn: any) => {
            const tx = {
                insert: () => ({
                    values: (rows: any[]) => {
                        inserted.push(...rows);
                        return Promise.resolve();
                    },
                }),
            };
            return await fn(tx);
        },
        select: () => ({}),
        insert: () => ({}),
        _inserted: inserted,
    };
    return db;
}

describe("shared-account-orphan-generator.service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("fills missing slots up to totalSlots from variant", async () => {
        const exp = new Date("2026-12-31");
        const db = makeDb([
            {
                id: 100,
                expiresAt: exp,
                variant: { totalSlots: 5, isSharing: true },
                slots: [{ slotNumber: 1 }, { slotNumber: 2 }], // 3 missing
            },
        ]);

        const result = await generateMissingSlots(db as any);
        expect(result.accountsTouched).toBe(1);
        expect(result.slotsCreated).toBe(3);
        expect(db._inserted).toHaveLength(3);
        expect(db._inserted.map((r) => r.slotNumber).sort()).toEqual([3, 4, 5]);
        // expires_at inheritance
        for (const row of db._inserted) {
            expect(row.expiresAt).toEqual(exp);
            expect(row.status).toBe("DISPONIBLE");
            expect(row.digitalCodeId).toBe(100);
            expect(row.profileName).toMatch(/^Profil \d+$/);
        }
        expect(logSecurityAction).toHaveBeenCalledWith(
            expect.objectContaining({ action: "SHARED_ACCOUNT_SLOTS_GENERATED" })
        );
    });

    it("is idempotent on already-complete accounts", async () => {
        const db = makeDb([
            {
                id: 1,
                expiresAt: null,
                variant: { totalSlots: 3, isSharing: true },
                slots: [
                    { slotNumber: 1 },
                    { slotNumber: 2 },
                    { slotNumber: 3 },
                ],
            },
        ]);
        const result = await generateMissingSlots(db as any);
        expect(result.accountsTouched).toBe(0);
        expect(result.slotsCreated).toBe(0);
        expect(db._inserted).toHaveLength(0);
        expect(logSecurityAction).not.toHaveBeenCalled();
    });

    it("inherits expires_at from parent account on new slots", async () => {
        const exp = new Date("2026-06-30T12:00:00.000Z");
        const db = makeDb([
            {
                id: 7,
                expiresAt: exp,
                variant: { totalSlots: 2, isSharing: true },
                slots: [],
            },
        ]);
        const result = await generateMissingSlots(db as any);
        expect(result.slotsCreated).toBe(2);
        for (const row of db._inserted) {
            expect(row.expiresAt).toEqual(exp);
        }
    });

    it("skips variants with no totalSlots", async () => {
        const db = makeDb([
            { id: 1, expiresAt: null, variant: { totalSlots: 0, isSharing: false }, slots: [] },
            { id: 2, expiresAt: null, variant: null, slots: [] },
        ]);
        const result = await generateMissingSlots(db as any);
        expect(result.accountsTouched).toBe(0);
        expect(result.slotsCreated).toBe(0);
    });
});
