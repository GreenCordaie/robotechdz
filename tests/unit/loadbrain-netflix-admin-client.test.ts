import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/db", () => ({ db: {} }));

import { setSlotQuotaRemote, deleteAccountRemote } from "@/services/loadbrain-netflix-admin.client";

const RES = (body: any, status = 200) =>
    ({ status, json: async () => body }) as unknown as Response;

beforeEach(() => {
    process.env.LOADBRAIN_URL = "http://lb.local";
});
afterEach(() => {
    delete process.env.LOADBRAIN_URL;
});

describe("setSlotQuotaRemote", () => {
    it("PATCHes the slot quota and maps 200 → ok", async () => {
        const fetchFn = vi.fn(async (_url: string, _init?: any) => RES({ ok: true, maxUses: 3 }));
        const r = await setSlotQuotaRemote(
            { siteId: "s", lbSlotId: "lb-1", maxUses: 3 },
            { fetchFn: fetchFn as any },
        );
        expect(r).toEqual({ ok: true, maxUses: 3 });
        expect(fetchFn.mock.calls[0][0]).toContain("/internal/slot/lb-1/quota");
        expect((fetchFn.mock.calls[0][1] as any).method).toBe("PATCH");
    });

    it("maps 404 → not_found", async () => {
        const fetchFn = vi.fn(async () => RES({ ok: false }, 404));
        const r = await setSlotQuotaRemote({ siteId: "s", lbSlotId: "lb-1", maxUses: null }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "not_found" });
    });

    it("degrades to unavailable on a network error (admin op never throws)", async () => {
        const fetchFn = vi.fn(async () => {
            throw new Error("down");
        });
        const r = await setSlotQuotaRemote({ siteId: "s", lbSlotId: "lb-1", maxUses: 2 }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "unavailable" });
    });

    it("degrades to unavailable on an unexpected status", async () => {
        const fetchFn = vi.fn(async () => RES({ error: "boom" }, 500));
        const r = await setSlotQuotaRemote({ siteId: "s", lbSlotId: "lb-1", maxUses: 2 }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "unavailable" });
    });

    it("unavailable (no fetch) when LOADBRAIN_URL is unset", async () => {
        delete process.env.LOADBRAIN_URL;
        const fetchFn = vi.fn();
        const r = await setSlotQuotaRemote({ siteId: "s", lbSlotId: "lb-1", maxUses: 2 }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "unavailable" });
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe("deleteAccountRemote", () => {
    it("DELETEs the account and maps 200 → ok with deletedSlots", async () => {
        const fetchFn = vi.fn(async (_url: string, _init?: any) => RES({ ok: true, deletedSlots: 3 }));
        const r = await deleteAccountRemote({ siteId: "s", lbAccountId: "acc-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: true, deletedSlots: 3 });
        expect(fetchFn.mock.calls[0][0]).toContain("/internal/account/acc-1");
        expect((fetchFn.mock.calls[0][1] as any).method).toBe("DELETE");
    });

    it("maps 404 → not_found", async () => {
        const fetchFn = vi.fn(async () => RES({ ok: false }, 404));
        const r = await deleteAccountRemote({ siteId: "s", lbAccountId: "acc-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "not_found" });
    });

    it("maps 409 → has_active_slots", async () => {
        const fetchFn = vi.fn(async () => RES({ ok: false, reason: "has_active_slots" }, 409));
        const r = await deleteAccountRemote({ siteId: "s", lbAccountId: "acc-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "has_active_slots" });
    });

    it("degrades to unavailable on a network error", async () => {
        const fetchFn = vi.fn(async () => { throw new Error("down"); });
        const r = await deleteAccountRemote({ siteId: "s", lbAccountId: "acc-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "unavailable" });
    });

    it("unavailable (no fetch) when LOADBRAIN_URL is unset", async () => {
        delete process.env.LOADBRAIN_URL;
        const fetchFn = vi.fn();
        const r = await deleteAccountRemote({ siteId: "s", lbAccountId: "acc-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "unavailable" });
        expect(fetchFn).not.toHaveBeenCalled();
    });
});
