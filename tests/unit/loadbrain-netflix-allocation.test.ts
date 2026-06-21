import { describe, it, expect, vi, beforeEach } from "vitest";
// The orchestrator imports @/db/schema -> (transitively) @/db, whose module
// throws "DATABASE_URL must be set" at import time. Stub @/db so this pure-logic
// test loads without a real database (same pattern as loadbrain-netflix-client).
vi.mock("@/db", () => ({ db: {} }));

import {
    allocateSharingItemViaLoadBrain,
    LbAllocError,
} from "@/lib/loadbrain-netflix-allocation";
import { LbNetflixError } from "@/services/loadbrain-netflix.client";
import { DigitalCodeSlotStatus } from "@/lib/constants";

beforeEach(() => {
    process.env.LOADBRAIN_SITE_ID = "AGENT007";
});

/**
 * Fake drizzle tx. Models exactly the two read paths + one write path the
 * orchestrator uses:
 *   - tx.select({...}).from(...).where(...).limit(1).for('update')
 *       → resolves to `accountRows`
 *   - tx.query.slotActivationTokens.findFirst({...})
 *       → resolves a local slot id from a public_token via `tokenMap`
 *   - tx.update(...).set(payload).where(clause)
 *       → captured into `updates`
 *
 * `tokenMap` maps a publicToken → local slot id (or null to simulate a data gap).
 */
function fakeTx(opts: {
    accountRows: Array<{ id: number; lbAccountId: string | null }>;
    tokenMap: Record<string, number | null>;
}) {
    const updates: Array<{ payload: any; clause: unknown }> = [];
    const tokenLookups: string[] = [];

    const selectChain = {
        from: () => selectChain,
        where: () => selectChain,
        limit: () => selectChain,
        for: async () => opts.accountRows,
    };

    const tx = {
        updates,
        tokenLookups,
        select: vi.fn(() => selectChain),
        update: vi.fn(() => ({
            set: (payload: any) => ({
                where: async (clause: unknown) => {
                    updates.push({ payload, clause });
                    return [{ id: 1 }];
                },
            }),
        })),
        query: {
            slotActivationTokens: {
                findFirst: vi.fn(async ({ where }: any) => {
                    // We can't easily read the eq() value out of the drizzle
                    // clause, so the orchestrator calls findFirst once per unit
                    // in order. Pull the token by walking the recorded calls
                    // against the mock's recorded allocate results instead:
                    // simplest is to resolve via the publicToken captured by the
                    // allocateFn mock. We expose that through a closure variable.
                    void where;
                    const token = pendingTokens.shift();
                    tokenLookups.push(token ?? "<none>");
                    const slotId = token != null ? opts.tokenMap[token] : undefined;
                    return slotId != null ? { slotId } : null;
                }),
            },
        },
    };

    // Queue of public_tokens in the order allocateFn returned them, consumed by
    // findFirst above (orchestrator resolves the token immediately after each
    // allocate, so FIFO ordering holds).
    const pendingTokens: string[] = [];
    (tx as any).__pushToken = (t: string) => pendingTokens.push(t);

    return tx as any;
}

/** allocateFn mock that records inputs and also feeds tokens to the fake tx. */
function makeAllocate(
    tx: any,
    results: Array<{ slotId: string; publicToken: string; profileName?: string }>,
) {
    const calls: any[] = [];
    let i = 0;
    const fn = vi.fn(async (input: any) => {
        calls.push(input);
        const r = results[i++];
        tx.__pushToken(r.publicToken);
        return {
            slotId: r.slotId,
            publicToken: r.publicToken,
            magicLink: `https://lb.test/n/${r.publicToken}`,
            netflixProfileName: r.profileName,
            reused: false,
        };
    });
    return { fn, calls };
}

const ITEM = { id: 500, variantId: 42, quantity: 1 };

describe("allocateSharingItemViaLoadBrain", () => {
    it("happy path qty=1: resolves account, allocates with ref `${id}-0`, marks local slot VENDU + lbSlotId", async () => {
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: { tok0: 77 },
        });
        const { fn, calls } = makeAllocate(tx, [{ slotId: "lb-slot-0", publicToken: "tok0", profileName: "Profil A" }]);

        const res = await allocateSharingItemViaLoadBrain(tx, ITEM, { allocateFn: fn });

        // one allocate call, ref `${id}-0`, account from the resolved row
        expect(fn).toHaveBeenCalledTimes(1);
        expect(calls[0]).toMatchObject({
            siteId: "AGENT007",
            accountId: "lb-acc-1",
            externalOrderRef: "500-0",
        });
        // local slot resolved by token → marked VENDU + lbSlotId + orderItemId
        expect(tx.updates).toHaveLength(1);
        expect(tx.updates[0].payload).toMatchObject({
            status: DigitalCodeSlotStatus.VENDU,
            orderItemId: 500,
            lbSlotId: "lb-slot-0",
        });
        // returned slot
        expect(res.slots).toEqual([
            { localSlotId: 77, lbSlotId: "lb-slot-0", publicToken: "tok0", profileName: "Profil A" },
        ]);
    });

    it("qty=2: two allocate calls with distinct per-unit refs `${id}-0` / `${id}-1`", async () => {
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: { tok0: 77, tok1: 78 },
        });
        const { fn, calls } = makeAllocate(tx, [
            { slotId: "lb-slot-0", publicToken: "tok0" },
            { slotId: "lb-slot-1", publicToken: "tok1" },
        ]);

        const res = await allocateSharingItemViaLoadBrain(tx, { ...ITEM, quantity: 2 }, { allocateFn: fn });

        expect(fn).toHaveBeenCalledTimes(2);
        expect(calls.map((c) => c.externalOrderRef)).toEqual(["500-0", "500-1"]);
        expect(tx.updates).toHaveLength(2);
        expect(res.slots.map((s) => s.localSlotId)).toEqual([77, 78]);
        expect(res.slots.map((s) => s.lbSlotId)).toEqual(["lb-slot-0", "lb-slot-1"]);
    });

    it("threads customer phone/name/email into allocateSlot when present", async () => {
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: { tok0: 77 },
        });
        const { fn, calls } = makeAllocate(tx, [{ slotId: "lb-slot-0", publicToken: "tok0" }]);

        await allocateSharingItemViaLoadBrain(
            tx,
            { ...ITEM, customer: { phone: "+213700112233", name: "Sara", email: "s@x.dz" } },
            { allocateFn: fn },
        );

        expect(calls[0]).toMatchObject({
            customerPhone: "+213700112233",
            customerName: "Sara",
            customerEmail: "s@x.dz",
        });
    });

    it("falls back to a placeholder E.164 when no customer phone is on the item", async () => {
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: { tok0: 77 },
        });
        const { fn, calls } = makeAllocate(tx, [{ slotId: "lb-slot-0", publicToken: "tok0" }]);

        await allocateSharingItemViaLoadBrain(tx, ITEM, { allocateFn: fn });

        expect(calls[0].customerPhone).toMatch(/^\+\d{8,15}$/); // valid-looking E.164 placeholder
    });

    it("OUT_OF_STOCK from client → throws LbAllocError OUT_OF_STOCK (fail-closed, propagates so tx rolls back)", async () => {
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: {},
        });
        const fn = vi.fn(async () => {
            throw new LbNetflixError("OUT_OF_STOCK", "no available slot");
        });

        await expect(
            allocateSharingItemViaLoadBrain(tx, ITEM, { allocateFn: fn }),
        ).rejects.toMatchObject({ name: "LbAllocError", code: "OUT_OF_STOCK" });
        // No local slot was marked VENDU (and since it's all in tx, even a
        // partial success would roll back on the throw).
        expect(tx.updates).toHaveLength(0);
    });

    it("LB_UNAVAILABLE from client → throws LbAllocError LB_UNAVAILABLE (fail-closed, no local fallback)", async () => {
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: {},
        });
        const fn = vi.fn(async () => {
            throw new LbNetflixError("LB_UNAVAILABLE", "ECONNREFUSED");
        });

        await expect(
            allocateSharingItemViaLoadBrain(tx, ITEM, { allocateFn: fn }),
        ).rejects.toMatchObject({ name: "LbAllocError", code: "LB_UNAVAILABLE" });
        expect(tx.updates).toHaveLength(0);
    });

    it("partial multi-unit failure: unit 0 succeeds, unit 1 OUT_OF_STOCK → throws (tx rollback handles unit 0)", async () => {
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: { tok0: 77 },
        });
        let i = 0;
        const fn = vi.fn(async () => {
            if (i++ === 0) {
                tx.__pushToken("tok0");
                return {
                    slotId: "lb-slot-0",
                    publicToken: "tok0",
                    magicLink: "https://lb.test/n/tok0",
                    reused: false,
                };
            }
            throw new LbNetflixError("OUT_OF_STOCK", "no available slot");
        });

        await expect(
            allocateSharingItemViaLoadBrain(tx, { ...ITEM, quantity: 2 }, { allocateFn: fn }),
        ).rejects.toMatchObject({ name: "LbAllocError", code: "OUT_OF_STOCK" });
        // The error propagates out of the function; the caller's tx wrapper is
        // responsible for the rollback. (The unit-0 VENDU write was issued on
        // the tx and would be rolled back with the transaction.)
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("no digital_code with lbAccountId → throws NO_LB_ACCOUNT, never calls allocateSlot", async () => {
        const tx = fakeTx({ accountRows: [], tokenMap: {} });
        const fn = vi.fn();

        await expect(
            allocateSharingItemViaLoadBrain(tx, ITEM, { allocateFn: fn }),
        ).rejects.toMatchObject({ name: "LbAllocError", code: "NO_LB_ACCOUNT" });
        expect(fn).not.toHaveBeenCalled();
        expect(tx.updates).toHaveLength(0);
    });

    it("token does not resolve to a local slot → throws MIRROR_RESOLVE_FAILED (no silent inconsistency)", async () => {
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: { tok0: null }, // public_token has no matching local slot
        });
        const { fn } = makeAllocate(tx, [{ slotId: "lb-slot-0", publicToken: "tok0" }]);

        await expect(
            allocateSharingItemViaLoadBrain(tx, ITEM, { allocateFn: fn }),
        ).rejects.toMatchObject({ name: "LbAllocError", code: "MIRROR_RESOLVE_FAILED" });
        // allocate was called but no VENDU write happened (resolve failed first).
        expect(fn).toHaveBeenCalledTimes(1);
        expect(tx.updates).toHaveLength(0);
    });

    it("missing siteId (no dep, no env) → throws LB_UNAVAILABLE before any allocate", async () => {
        delete process.env.LOADBRAIN_SITE_ID;
        const tx = fakeTx({
            accountRows: [{ id: 1, lbAccountId: "lb-acc-1" }],
            tokenMap: { tok0: 77 },
        });
        const fn = vi.fn();

        await expect(
            allocateSharingItemViaLoadBrain(tx, ITEM, { allocateFn: fn }),
        ).rejects.toMatchObject({ name: "LbAllocError", code: "LB_UNAVAILABLE" });
        expect(fn).not.toHaveBeenCalled();
    });
});
