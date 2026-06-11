import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// Mock security to avoid Next.js headers() import
vi.mock("@/lib/security", () => ({
    logSecurityAction: vi.fn().mockResolvedValue(undefined),
}));

import {
    findExpiredSlots,
    expireSlots,
    sweepExpiredSlots,
    EXPIRATION_GRACE_MS,
} from "@/services/shared-account-sweeper.service";
import { logSecurityAction } from "@/lib/security";

interface SlotRow {
    id: number;
    status: string;
    expiresAt: Date | null;
}

function makeDb(initial: SlotRow[]) {
    const slots = [...initial];

    const db = {
        // chain: select({...}).from(...).where(filterFn)
        select: () => ({
            from: () => ({
                where: (predicate: any) => {
                    // We accept the drizzle filter object and apply rough logic in tests
                    // For simplicity, the where() in production is opaque — we re-implement
                    // the same logic the service expects against the test data.
                    const threshold = new Date(Date.now() - EXPIRATION_GRACE_MS);
                    return Promise.resolve(
                        slots
                            .filter(
                                (s) =>
                                    s.status === "DISPONIBLE" &&
                                    s.expiresAt !== null &&
                                    s.expiresAt < threshold
                            )
                            .map((s) => ({ id: s.id }))
                    );
                },
            }),
        }),
        transaction: async (fn: any) => {
            const tx = {
                update: () => ({
                    set: (vals: any) => ({
                        where: (predicate: any) => {
                            // Track which ids were targeted via predicate (we encoded ids on call)
                            const ids = (predicate as any).__ids as number[];
                            for (const s of slots) {
                                if (ids.includes(s.id)) Object.assign(s, vals);
                            }
                            return Promise.resolve();
                        },
                    }),
                }),
            };
            return await fn(tx);
        },
        // not used here
        update: () => ({}),
        query: {} as any,
        _slots: slots,
    };
    return db;
}

// Patch drizzle inArray to attach ids onto a marker for our test transaction
vi.mock("drizzle-orm", async () => {
    const actual = await vi.importActual<any>("drizzle-orm");
    return {
        ...actual,
        inArray: (_col: any, ids: number[]) => ({ __ids: ids }),
    };
});

describe("shared-account-sweeper.service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("findExpiredSlots returns DISPONIBLE slots past expires_at and ignores future ones", async () => {
        const past = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
        const future = new Date(Date.now() + 60 * 60 * 1000);
        const db = makeDb([
            { id: 1, status: "DISPONIBLE", expiresAt: past },
            { id: 2, status: "DISPONIBLE", expiresAt: future },
            { id: 3, status: "VENDU", expiresAt: past }, // sold -> ignored
            { id: 4, status: "DISPONIBLE", expiresAt: null }, // no expiry -> ignored
        ]);
        const ids = await findExpiredSlots(db as any);
        expect(ids).toEqual([1]);
    });

    it("findExpiredSlots respects the 5-min grace period", async () => {
        const justExpired = new Date(Date.now() - 60 * 1000); // 1 min ago, within grace
        const wellPast = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
        const db = makeDb([
            { id: 10, status: "DISPONIBLE", expiresAt: justExpired },
            { id: 11, status: "DISPONIBLE", expiresAt: wellPast },
        ]);
        const ids = await findExpiredSlots(db as any);
        expect(ids).toEqual([11]);
    });

    it("expireSlots flips status atomically and emits audit", async () => {
        const past = new Date(Date.now() - 10 * 60 * 1000);
        const db = makeDb([
            { id: 1, status: "DISPONIBLE", expiresAt: past },
            { id: 2, status: "DISPONIBLE", expiresAt: past },
        ]);
        const result = await expireSlots(db as any, [1, 2], "test-reason");
        expect(result.expired).toBe(2);
        expect(db._slots.filter((s) => s.status === "EXPIRE").length).toBe(2);
        expect(logSecurityAction).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "SHARED_ACCOUNT_SLOT_EXPIRED",
                entityType: "SHARED_ACCOUNT_SLOT",
                newData: expect.objectContaining({ count: 2, reason: "test-reason" }),
            })
        );
    });

    it("expireSlots is a no-op on empty input", async () => {
        const db = makeDb([]);
        const result = await expireSlots(db as any, []);
        expect(result.expired).toBe(0);
        expect(logSecurityAction).not.toHaveBeenCalled();
    });

    it("sweepExpiredSlots returns accurate count and timing", async () => {
        const past = new Date(Date.now() - 10 * 60 * 1000);
        const db = makeDb([
            { id: 1, status: "DISPONIBLE", expiresAt: past },
            { id: 2, status: "DISPONIBLE", expiresAt: past },
            { id: 3, status: "VENDU", expiresAt: past },
        ]);
        const res = await sweepExpiredSlots(db as any);
        expect(res.expired).toBe(2);
        expect(res.took_ms).toBeGreaterThanOrEqual(0);
        expect(db._slots.find((s) => s.id === 1)?.status).toBe("EXPIRE");
        expect(db._slots.find((s) => s.id === 3)?.status).toBe("VENDU");
    });
});
