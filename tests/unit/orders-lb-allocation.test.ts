import { describe, it, expect, vi, beforeEach } from "vitest";

// allocateOrderStock imports @/db/schema -> (transitively) @/db, whose module
// throws "DATABASE_URL must be set" at import time. Stub @/db so this pure-logic
// test loads without a real database (same pattern as the allocation test).
vi.mock("@/db", () => ({ db: {} }));

// checkStockAndAlert hits the global `db` (not the tx) — neutralize it so the
// unit test stays focused on the allocation decision.
vi.mock("@/lib/stock-alerts", () => ({ checkStockAndAlert: vi.fn(async () => {}) }));

// logSecurityAction writes audit rows — neutralize for the unit test.
vi.mock("@/lib/security", () => ({ logSecurityAction: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// The two P2-1 modules the P2-2 gate calls. Both are spied so we can assert
// exactly whether the LoadBrain authority path was taken.
const isLbNetflixAuthoritative = vi.fn<() => Promise<boolean>>();
const allocateSharingItemViaLoadBrain = vi.fn();

// LbAllocError must be the SAME class the runtime `instanceof` check sees, so we
// re-export the real one from the actual module alongside the spy.
vi.mock("@/lib/loadbrain-netflix-flag", () => ({
    isLbNetflixAuthoritative: () => isLbNetflixAuthoritative(),
}));
vi.mock("@/lib/loadbrain-netflix-allocation", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/loadbrain-netflix-allocation")>();
    return {
        ...actual,
        allocateSharingItemViaLoadBrain: (...args: any[]) => allocateSharingItemViaLoadBrain(...args),
    };
});

import { allocateOrderStock } from "@/lib/orders";
import { LbAllocError } from "@/lib/loadbrain-netflix-allocation";
import { DigitalCodeSlotStatus } from "@/lib/constants";

const ORDER_ID = 9001;

/**
 * One sharing order item with a non-manual product. `isManualDelivery === false`
 * and `isSharing === true` routes it into the gated branch.
 */
const SHARING_ITEM = {
    id: 700,
    name: "Netflix Partagé",
    orderId: ORDER_ID,
    variantId: 42,
    quantity: 1,
    variant: {
        isSharing: true,
        loadbrainSlug: null,
        totalSlots: 5,
        product: { isManualDelivery: false },
    },
};

/**
 * Focused fake drizzle tx. Drives exactly one sharing item through
 * allocateOrderStock and records every UPDATE so a test can assert whether the
 * local-pick UPDATE-to-VENDU ran.
 *
 * The local sharing path issues:
 *   tx.select({...}).from(...).innerJoin(...).where(...).orderBy(...).limit(n).for('update')
 *     → returns `availableSlots`
 *   tx.update(digitalCodeSlots).set({status:VENDU,...}).where(inArray(ids))
 *
 * We don't decode drizzle clauses; we just capture the `.set()` payloads into
 * `updates`. A payload of `{status:'VENDU', orderItemId}` (no lbSlotId) is the
 * local-pick signature; the LoadBrain path's slot writes happen INSIDE the
 * orchestrator (which is mocked here), so they never reach this tx.
 */
function makeTx(opts: {
    availableSlots?: Array<{ id: number; digitalCodeId: number; slotNumber: number; status: string }>;
    order?: { id: number; customerPhone: string | null; client: { telephone: string | null; nomComplet: string | null } | null } | null;
}) {
    const availableSlots = opts.availableSlots ?? [];
    const updates: Array<{ payload: any }> = [];

    // tx.select(...) is used for: the local available-slots SELECT (sharing) and,
    // when the LB path succeeds, the parent-code resolution SELECT. We make a
    // chainable object whose terminal `.for()` / awaited value yields the slots.
    const selectChain: any = {
        from: () => selectChain,
        innerJoin: () => selectChain,
        where: () => selectChain,
        orderBy: () => selectChain,
        limit: () => selectChain,
        for: async () => availableSlots,
        // when awaited directly (no .for), behave as a thenable returning []
        then: (resolve: any) => resolve(availableSlots),
    };

    const tx: any = {
        updates,
        select: vi.fn(() => selectChain),
        update: vi.fn(() => ({
            set: (payload: any) => ({
                where: async () => {
                    updates.push({ payload });
                    return [{ id: 1 }];
                },
            }),
        })),
        insert: vi.fn(() => ({ values: async () => [] })),
        query: {
            orderItems: {
                findMany: vi.fn(async () => [SHARING_ITEM]),
            },
            orders: {
                findFirst: vi.fn(async () => opts.order ?? null),
            },
            shopSettings: {
                findFirst: vi.fn(async () => ({ usdExchangeRate: "245" })),
            },
            digitalCodeSlots: {
                // parent-code "remaining DISPONIBLE" probe — return [] so the
                // parent gets marked VENDU (exercises that branch harmlessly).
                findMany: vi.fn(async () => []),
            },
            digitalCodes: {
                findFirst: vi.fn(async () => null),
            },
            productVariantSuppliers: {
                findFirst: vi.fn(async () => null),
            },
            suppliers: {
                findFirst: vi.fn(async () => null),
            },
        },
    };

    return tx;
}

/**
 * True if the LOCAL pick marked a slot VENDU. The local slot UPDATE sets
 * `{status:VENDU, orderItemId}` on digital_code_slots; the LB path's slot writes
 * happen inside the (mocked) orchestrator and never reach this tx, while the
 * parent-code VENDU UPDATE carries `{status:VENDU}` only (no orderItemId). So
 * `status===VENDU && orderItemId present` uniquely identifies the local slot pick.
 */
function localVenduUpdateRan(tx: any): boolean {
    return tx.updates.some(
        (u: any) => u.payload?.status === DigitalCodeSlotStatus.VENDU && u.payload?.orderItemId !== undefined,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("allocateOrderStock — P2-2 LoadBrain authority gate", () => {
    it("NON-REGRESSION: flag OFF → local pick runs, orchestrator NEVER called (flag-off = unchanged)", async () => {
        isLbNetflixAuthoritative.mockResolvedValue(false);
        const tx = makeTx({
            availableSlots: [{ id: 77, digitalCodeId: 5, slotNumber: 1, status: "DISPONIBLE" }],
        });

        await allocateOrderStock(tx, ORDER_ID, {});

        // The LoadBrain orchestrator was NOT consulted at all.
        expect(allocateSharingItemViaLoadBrain).not.toHaveBeenCalled();
        // The order's customer was NOT loaded (gate off short-circuits it).
        expect(tx.query.orders.findFirst).not.toHaveBeenCalled();
        // The EXISTING local SELECT-for-update + UPDATE-to-VENDU path ran.
        expect(tx.select).toHaveBeenCalled();
        expect(localVenduUpdateRan(tx)).toBe(true);
    });

    it("flag ON + orchestrator succeeds → orchestrator called with item+customer, local pick NOT run", async () => {
        isLbNetflixAuthoritative.mockResolvedValue(true);
        allocateSharingItemViaLoadBrain.mockResolvedValue({
            slots: [{ localSlotId: 77, lbSlotId: "lb-slot-0", publicToken: "tok0", profileName: "P1" }],
        });
        const tx = makeTx({
            availableSlots: [{ id: 77, digitalCodeId: 5, slotNumber: 1, status: "DISPONIBLE" }],
            order: { id: ORDER_ID, customerPhone: "+213700112233", client: { telephone: null, nomComplet: "Sara" } },
        });

        const res = await allocateOrderStock(tx, ORDER_ID, {});

        expect(allocateSharingItemViaLoadBrain).toHaveBeenCalledTimes(1);
        const [, passedItem] = allocateSharingItemViaLoadBrain.mock.calls[0];
        expect(passedItem).toMatchObject({
            id: 700,
            variantId: 42,
            quantity: 1,
            customer: { phone: "+213700112233", name: "Sara", email: null },
        });
        // Local pick did NOT mark a slot VENDU (the orchestrator owns that write).
        expect(localVenduUpdateRan(tx)).toBe(false);
        // No manual-delivery degrade; order finalizes TERMINE.
        expect(res.hasManualDelivery).toBe(false);
    });

    it("flag ON + orchestrator throws OUT_OF_STOCK → hasManualDelivery, local pick NOT run (no desync)", async () => {
        isLbNetflixAuthoritative.mockResolvedValue(true);
        allocateSharingItemViaLoadBrain.mockRejectedValue(new LbAllocError("OUT_OF_STOCK", "no slot"));
        const tx = makeTx({
            availableSlots: [{ id: 77, digitalCodeId: 5, slotNumber: 1, status: "DISPONIBLE" }],
            order: { id: ORDER_ID, customerPhone: "+213700112233", client: null },
        });

        const res = await allocateOrderStock(tx, ORDER_ID, {});

        expect(allocateSharingItemViaLoadBrain).toHaveBeenCalledTimes(1);
        // Fail-closed: no local pick, item degrades to manual delivery.
        expect(localVenduUpdateRan(tx)).toBe(false);
        expect(res.hasManualDelivery).toBe(true);
    });

    it("flag ON + orchestrator throws NO_LB_ACCOUNT → falls through to local pick (local VENDU runs)", async () => {
        isLbNetflixAuthoritative.mockResolvedValue(true);
        allocateSharingItemViaLoadBrain.mockRejectedValue(new LbAllocError("NO_LB_ACCOUNT", "not migrated"));
        const tx = makeTx({
            availableSlots: [{ id: 77, digitalCodeId: 5, slotNumber: 1, status: "DISPONIBLE" }],
            order: { id: ORDER_ID, customerPhone: "+213700112233", client: null },
        });

        const res = await allocateOrderStock(tx, ORDER_ID, {});

        expect(allocateSharingItemViaLoadBrain).toHaveBeenCalledTimes(1);
        // Not centralized → safe to local-pick: the existing UPDATE-to-VENDU ran.
        expect(localVenduUpdateRan(tx)).toBe(true);
        expect(res.hasManualDelivery).toBe(false);
    });

    it("flag ON + orchestrator throws LB_UNAVAILABLE → hasManualDelivery, local pick NOT run", async () => {
        isLbNetflixAuthoritative.mockResolvedValue(true);
        allocateSharingItemViaLoadBrain.mockRejectedValue(new LbAllocError("LB_UNAVAILABLE", "econnrefused"));
        const tx = makeTx({
            availableSlots: [{ id: 77, digitalCodeId: 5, slotNumber: 1, status: "DISPONIBLE" }],
            order: { id: ORDER_ID, customerPhone: null, client: null },
        });

        const res = await allocateOrderStock(tx, ORDER_ID, {});

        expect(localVenduUpdateRan(tx)).toBe(false);
        expect(res.hasManualDelivery).toBe(true);
    });

    it("flag ON falls back to client.telephone/nomComplet when order has no direct customerPhone", async () => {
        isLbNetflixAuthoritative.mockResolvedValue(true);
        allocateSharingItemViaLoadBrain.mockResolvedValue({
            slots: [{ localSlotId: 77, lbSlotId: "lb-slot-0", publicToken: "tok0" }],
        });
        const tx = makeTx({
            availableSlots: [{ id: 77, digitalCodeId: 5, slotNumber: 1, status: "DISPONIBLE" }],
            order: { id: ORDER_ID, customerPhone: null, client: { telephone: "+213555000111", nomComplet: "Karim" } },
        });

        await allocateOrderStock(tx, ORDER_ID, {});

        const [, passedItem] = allocateSharingItemViaLoadBrain.mock.calls[0];
        expect(passedItem.customer).toEqual({ phone: "+213555000111", name: "Karim", email: null });
    });
});
