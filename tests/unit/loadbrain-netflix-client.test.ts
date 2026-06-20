import { describe, it, expect, beforeEach, vi } from "vitest";
// The client imports @/lib/logger -> @/db, whose module throws
// "DATABASE_URL must be set" at import time. Stub @/db so this pure
// HTTP-client test loads without a real database (matches the pattern
// used by loadbrain-auto-approve.test.ts).
vi.mock("@/db", () => ({ db: {} }));
import { allocateSlot, releaseSlot } from "@/services/loadbrain-netflix.client";

beforeEach(() => {
    process.env.LOADBRAIN_URL = "https://lb.test";
    process.env.LOADBRAIN_INTERNAL_TOKEN = "tok";
    delete process.env.LOADBRAIN_API_KEY;
});

const ALLOCATE_INPUT = {
    siteId: "site",
    accountId: "acc",
    externalOrderRef: "ord-1",
    customerPhone: "+213700000000",
};

describe("loadbrain-netflix.client", () => {
    it("allocateSlot posts to /internal/slot/allocate with X-Internal-Token and returns parsed slot", async () => {
        const fetchFn = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({ slotId: "s1", publicToken: "abc", magicLink: "https://lb.test/n/abc", reused: false }),
                { status: 201 },
            ),
        );
        const res = await allocateSlot(ALLOCATE_INPUT, { fetchFn });
        expect(fetchFn).toHaveBeenCalledWith(
            "https://lb.test/internal/slot/allocate",
            expect.objectContaining({ method: "POST" }),
        );
        const init = fetchFn.mock.calls[0]![1] as RequestInit;
        const headers = init.headers as Record<string, string>;
        expect(headers["X-Internal-Token"]).toBe("tok");
        expect(init.body).toBe(JSON.stringify(ALLOCATE_INPUT));
        expect(res).toMatchObject({ slotId: "s1", publicToken: "abc", reused: false });
    });

    it("allocateSlot throws LB_UNAVAILABLE on network error (no double-sell, caller fails closed)", async () => {
        const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
        await expect(allocateSlot(ALLOCATE_INPUT, { fetchFn })).rejects.toMatchObject({ code: "LB_UNAVAILABLE" });
    });

    it("allocateSlot throws LB_UNAVAILABLE when LOADBRAIN_URL is unset", async () => {
        delete process.env.LOADBRAIN_URL;
        const fetchFn = vi.fn();
        await expect(allocateSlot(ALLOCATE_INPUT, { fetchFn })).rejects.toMatchObject({ code: "LB_UNAVAILABLE" });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("allocateSlot throws OUT_OF_STOCK on 409", async () => {
        const fetchFn = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: "out_of_stock" }), { status: 409 }),
        );
        await expect(allocateSlot(ALLOCATE_INPUT, { fetchFn })).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    });

    it("releaseSlot posts to /internal/slot/release and returns released", async () => {
        const fetchFn = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ released: true, slotId: "s1" }), { status: 200 }),
        );
        const res = await releaseSlot({ siteId: "site", externalOrderRef: "ord-1", reason: "refund" }, { fetchFn });
        expect(fetchFn).toHaveBeenCalledWith(
            "https://lb.test/internal/slot/release",
            expect.objectContaining({ method: "POST" }),
        );
        expect(res.released).toBe(true);
    });
});
