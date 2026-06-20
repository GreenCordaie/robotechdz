import { describe, it, expect, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { applyNetflixWebhook } from "@/lib/loadbrain-netflix-mirror";
import { digitalCodeSlots } from "@/db/schema";
import { DigitalCodeSlotStatus } from "@/lib/constants";

/**
 * Minimal fake drizzle db. Captures the .set() payload AND the .where() clause
 * from update chains, and resolves slotActivationTokens.findFirst to a fixed
 * local slot id (42). The captured where clause lets us assert the
 * current-state guard (status = VENDU) is composed into the update.
 */
function fakeDb() {
    const setCalls: any[] = [];
    const whereClauses: unknown[] = [];
    const update = vi.fn(() => ({
        set: vi.fn((payload: any) => {
            setCalls.push(payload);
            return {
                where: vi.fn(async (clause: unknown) => {
                    whereClauses.push(clause);
                    return [{ id: 1 }];
                }),
            };
        }),
    }));
    const db = {
        setCalls,
        whereClauses,
        update,
        query: {
            slotActivationTokens: { findFirst: vi.fn(async () => ({ slotId: 42 })) },
        },
    };
    return db as any;
}

/**
 * Serialize a drizzle SQL clause to a string for stable substring assertions.
 * Drizzle column objects hold circular table↔column refs, so we drop functions
 * and already-visited objects via a WeakSet.
 */
function serializeClause(clause: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(clause, (_k, v) => {
        if (typeof v === "function") return "[fn]";
        if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[circular]";
            seen.add(v);
        }
        return v;
    });
}

describe("applyNetflixWebhook", () => {
    it("slot.released flips the mirror slot back to DISPONIBLE, guarded by status=VENDU", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            { event: "slot.released", deliveryId: "d1", payload: { lbSlotId: "s1", externalOrderRef: "100pcia-slot-42" } },
            { publish },
        );
        expect(db.update).toHaveBeenCalledTimes(1);
        expect(db.setCalls[0]).toMatchObject({ status: DigitalCodeSlotStatus.DISPONIBLE, orderItemId: null });
        // H3 guard: the WHERE must also constrain the current state to VENDU so a
        // released event on a non-VENDU slot updates zero rows (a DB no-op).
        const where = serializeClause(db.whereClauses[0]);
        expect(where).toContain("status");
        expect(where).toContain(DigitalCodeSlotStatus.VENDU);
        expect(where).toContain("lb_slot_id");
        // Sanity: the expected guard clause serializes identically.
        const expected = serializeClause(
            and(eq(digitalCodeSlots.lbSlotId, "s1"), eq(digitalCodeSlots.status, DigitalCodeSlotStatus.VENDU)),
        );
        expect(where).toBe(expected);
        expect(publish).not.toHaveBeenCalled();
    });

    it("slot.expired marks the mirror slot EXPIRE, guarded by status=VENDU", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            { event: "slot.expired", deliveryId: "d3", payload: { lbSlotId: "s1" } },
            { publish },
        );
        expect(db.update).toHaveBeenCalledTimes(1);
        expect(db.setCalls[0]).toMatchObject({ status: DigitalCodeSlotStatus.EXPIRE });
        const where = serializeClause(db.whereClauses[0]);
        expect(where).toContain("status");
        expect(where).toContain(DigitalCodeSlotStatus.VENDU);
    });

    it("code.captured publishes OTP onto the event bus for the mapped slot", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            {
                event: "code.captured",
                deliveryId: "d2",
                payload: { publicToken: "abc", type: "OTP_CODE", value: "1234", timestamp: "2026-06-19T00:00:00Z" },
            },
            { publish },
        );
        expect(publish).toHaveBeenCalledWith(
            42,
            expect.objectContaining({ type: "OTP_CODE", value: "1234", timestamp: "2026-06-19T00:00:00Z" }),
        );
        expect(db.update).not.toHaveBeenCalled();
    });

    it("code.captured with an invalid type does NOT publish (M2 boundary validation)", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            {
                event: "code.captured",
                deliveryId: "d2-bad",
                payload: { publicToken: "abc", type: "NOT_A_REAL_TYPE", value: "1234" },
            },
            { publish },
        );
        expect(publish).not.toHaveBeenCalled();
    });

    it("code.captured with an over-long value does NOT publish (M2 length cap)", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            {
                event: "code.captured",
                deliveryId: "d2-long",
                payload: { publicToken: "abc", type: "OTP_CODE", value: "x".repeat(2049) },
            },
            { publish },
        );
        expect(publish).not.toHaveBeenCalled();
    });

    it("code.captured with a non-string value does NOT publish (M2 type coercion guard)", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            {
                event: "code.captured",
                deliveryId: "d2-num",
                payload: { publicToken: "abc", type: "OTP_CODE", value: 1234 },
            },
            { publish },
        );
        expect(publish).not.toHaveBeenCalled();
    });

    it("unknown event is a safe no-op", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            { event: "slot.allocated", deliveryId: "d4", payload: {} },
            { publish },
        );
        expect(db.update).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });
});
