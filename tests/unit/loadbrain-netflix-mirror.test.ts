import { describe, it, expect, vi } from "vitest";
import { applyNetflixWebhook } from "@/lib/loadbrain-netflix-mirror";
import { DigitalCodeSlotStatus } from "@/lib/constants";

/**
 * Minimal fake drizzle db. Captures the .set() payload from update chains and
 * resolves slotActivationTokens.findFirst to a fixed local slot id (42).
 */
function fakeDb() {
    const setCalls: any[] = [];
    const update = vi.fn(() => ({
        set: vi.fn((payload: any) => {
            setCalls.push(payload);
            return { where: vi.fn(async () => [{ id: 1 }]) };
        }),
    }));
    const db = {
        setCalls,
        update,
        query: {
            slotActivationTokens: { findFirst: vi.fn(async () => ({ slotId: 42 })) },
        },
    };
    return db as any;
}

describe("applyNetflixWebhook", () => {
    it("slot.released flips the mirror slot back to DISPONIBLE", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            { event: "slot.released", deliveryId: "d1", payload: { lbSlotId: "s1", externalOrderRef: "100pcia-slot-42" } },
            { publish },
        );
        expect(db.update).toHaveBeenCalledTimes(1);
        expect(db.setCalls[0]).toMatchObject({ status: DigitalCodeSlotStatus.DISPONIBLE, orderItemId: null });
        expect(publish).not.toHaveBeenCalled();
    });

    it("slot.expired marks the mirror slot EXPIRE", async () => {
        const db = fakeDb();
        const publish = vi.fn();
        await applyNetflixWebhook(
            db,
            { event: "slot.expired", deliveryId: "d3", payload: { lbSlotId: "s1" } },
            { publish },
        );
        expect(db.update).toHaveBeenCalledTimes(1);
        expect(db.setCalls[0]).toMatchObject({ status: DigitalCodeSlotStatus.EXPIRE });
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
