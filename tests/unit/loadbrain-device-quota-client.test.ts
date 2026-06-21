import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/db", () => ({ db: {} }));

import { bumpDeviceUsageRemote } from "@/services/loadbrain-device-quota.client";

const OK = (body: any, status = 200) =>
    ({ status, json: async () => body }) as unknown as Response;

beforeEach(() => {
    process.env.LOADBRAIN_URL = "http://lb.local";
});
afterEach(() => {
    delete process.env.LOADBRAIN_URL;
});

describe("bumpDeviceUsageRemote", () => {
    it("maps 200 → ok with remaining + debounced", async () => {
        const fetchFn = vi.fn(async (_url: string, _init?: any) => OK({ ok: true, remaining: 1, debounced: false }));
        const r = await bumpDeviceUsageRemote(
            { siteId: "s", lbSlotId: "lb-1", debounceMinutes: 60 },
            { fetchFn: fetchFn as any },
        );
        expect(r).toEqual({ ok: true, remaining: 1, debounced: false });
        // hits the device-bump path for the slot id
        expect((fetchFn.mock.calls[0][0] as string)).toContain("/internal/slot/lb-1/device-bump");
    });

    it("maps 200 debounced:true through", async () => {
        const fetchFn = vi.fn(async () => OK({ ok: true, remaining: 4, debounced: true }));
        const r = await bumpDeviceUsageRemote({ siteId: "s", lbSlotId: "lb-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: true, remaining: 4, debounced: true });
    });

    it("maps 409 → quota_exhausted", async () => {
        const fetchFn = vi.fn(async () => OK({ ok: false, reason: "quota_exhausted" }, 409));
        const r = await bumpDeviceUsageRemote({ siteId: "s", lbSlotId: "lb-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "quota_exhausted" });
    });

    it("maps 404 → not_found", async () => {
        const fetchFn = vi.fn(async () => OK({ ok: false, reason: "not_found" }, 404));
        const r = await bumpDeviceUsageRemote({ siteId: "s", lbSlotId: "lb-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "not_found" });
    });

    it("degrades to unavailable (NOT throw) on a network error", async () => {
        const fetchFn = vi.fn(async () => {
            throw new Error("ECONNREFUSED");
        });
        const r = await bumpDeviceUsageRemote({ siteId: "s", lbSlotId: "lb-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "unavailable" });
    });

    it("degrades to unavailable on an unexpected status (500)", async () => {
        const fetchFn = vi.fn(async () => OK({ error: "boom" }, 500));
        const r = await bumpDeviceUsageRemote({ siteId: "s", lbSlotId: "lb-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "unavailable" });
    });

    it("is unavailable (no fetch) when LOADBRAIN_URL is unset", async () => {
        delete process.env.LOADBRAIN_URL;
        const fetchFn = vi.fn();
        const r = await bumpDeviceUsageRemote({ siteId: "s", lbSlotId: "lb-1" }, { fetchFn: fetchFn as any });
        expect(r).toEqual({ ok: false, reason: "unavailable" });
        expect(fetchFn).not.toHaveBeenCalled();
    });
});
