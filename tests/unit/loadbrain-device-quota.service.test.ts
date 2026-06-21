import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/db", () => ({ db: {} }));

import { enforceDeviceQuota } from "@/services/loadbrain-device-quota.service";
import type { CentralizedSlot } from "@/services/loadbrain-device-quota.service";

beforeEach(() => {
    process.env.LOADBRAIN_SITE_ID = "site-uuid";
});

const slot = (over: Partial<CentralizedSlot> = {}): CentralizedSlot => ({
    id: 1,
    lbSlotId: "lb-1",
    maxDevices: 2,
    devicesActivated: 0,
    lastDeviceAt: null,
    ...over,
});

const db = {} as any;

describe("enforceDeviceQuota (LoadBrain-first, local fallback)", () => {
    it("remote ok + fresh session → mirrors locally, verdict ok (source lb)", async () => {
        const mirrorBumpFn = vi.fn(async () => true);
        const localEnforceFn = vi.fn();
        const bumpRemoteFn = vi.fn(async () => ({ ok: true as const, remaining: 1, debounced: false }));

        const r = await enforceDeviceQuota(db, slot(), {
            siteId: "site-uuid",
            bumpRemoteFn,
            localEnforceFn,
            mirrorBumpFn,
        });

        expect(r).toEqual({ ok: true, max: 2, source: "lb" });
        expect(mirrorBumpFn).toHaveBeenCalledWith(db, 1);
        expect(localEnforceFn).not.toHaveBeenCalled();
    });

    it("remote ok + debounced → no mirror bump, verdict ok", async () => {
        const mirrorBumpFn = vi.fn(async () => true);
        const bumpRemoteFn = vi.fn(async () => ({ ok: true as const, remaining: 4, debounced: true }));

        const r = await enforceDeviceQuota(db, slot(), {
            siteId: "site-uuid",
            bumpRemoteFn,
            mirrorBumpFn,
            localEnforceFn: vi.fn(),
        });

        expect(r).toEqual({ ok: true, max: 2, source: "lb" });
        expect(mirrorBumpFn).not.toHaveBeenCalled();
    });

    it("remote quota_exhausted → blocked (source lb), no local fallback", async () => {
        const localEnforceFn = vi.fn();
        const bumpRemoteFn = vi.fn(async () => ({ ok: false as const, reason: "quota_exhausted" as const }));

        const r = await enforceDeviceQuota(db, slot({ maxDevices: 3 }), {
            siteId: "site-uuid",
            bumpRemoteFn,
            localEnforceFn,
            mirrorBumpFn: vi.fn(),
        });

        expect(r).toEqual({ ok: false, max: 3, source: "lb" });
        expect(localEnforceFn).not.toHaveBeenCalled();
    });

    it("remote unavailable → falls back to the local enforcer", async () => {
        const localEnforceFn = vi.fn(async () => ({ ok: true, max: 2 }));
        const bumpRemoteFn = vi.fn(async () => ({ ok: false as const, reason: "unavailable" as const }));

        const r = await enforceDeviceQuota(db, slot(), {
            siteId: "site-uuid",
            bumpRemoteFn,
            localEnforceFn,
            mirrorBumpFn: vi.fn(),
        });

        expect(r).toEqual({ ok: true, max: 2, source: "local" });
        expect(localEnforceFn).toHaveBeenCalledWith(db, expect.objectContaining({ id: 1 }));
    });

    it("remote not_found → falls back to the local enforcer", async () => {
        const localEnforceFn = vi.fn(async () => ({ ok: false, max: 2 }));
        const bumpRemoteFn = vi.fn(async () => ({ ok: false as const, reason: "not_found" as const }));

        const r = await enforceDeviceQuota(db, slot(), {
            siteId: "site-uuid",
            bumpRemoteFn,
            localEnforceFn,
            mirrorBumpFn: vi.fn(),
        });

        expect(r).toEqual({ ok: false, max: 2, source: "local" });
        expect(localEnforceFn).toHaveBeenCalled();
    });

    it("non-centralized slot (no lbSlotId) → local enforcer, no remote call", async () => {
        const localEnforceFn = vi.fn(async () => ({ ok: true, max: null }));
        const bumpRemoteFn = vi.fn();

        const r = await enforceDeviceQuota(db, slot({ lbSlotId: null }), {
            siteId: "site-uuid",
            bumpRemoteFn,
            localEnforceFn,
            mirrorBumpFn: vi.fn(),
        });

        expect(r).toEqual({ ok: true, max: null, source: "local" });
        expect(bumpRemoteFn).not.toHaveBeenCalled();
    });

    it("no siteId configured → local enforcer, no remote call", async () => {
        delete process.env.LOADBRAIN_SITE_ID;
        const localEnforceFn = vi.fn(async () => ({ ok: true, max: 2 }));
        const bumpRemoteFn = vi.fn();

        const r = await enforceDeviceQuota(db, slot(), {
            bumpRemoteFn,
            localEnforceFn,
            mirrorBumpFn: vi.fn(),
        });

        expect(r.source).toBe("local");
        expect(bumpRemoteFn).not.toHaveBeenCalled();
    });
});
