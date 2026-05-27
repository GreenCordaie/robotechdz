import { describe, it, expect } from "vitest";
import {
  checkDeviceQuota,
  type SlotQuotaInput,
} from "@/services/slot-device-quota.service";

const slot = (over: Partial<SlotQuotaInput> = {}): SlotQuotaInput => ({
  maxDevices: 3,
  devicesActivated: 0,
  lastDeviceAt: null,
  ...over,
});

describe("checkDeviceQuota", () => {
  it("returns ok+bump=true on first ever view of a quota'd slot", () => {
    expect(checkDeviceQuota(slot())).toEqual({
      ok: true,
      bumpUsage: true,
      remaining: 2,
    });
  });

  it("returns ok+bump=false on refresh within 60min debounce", () => {
    const now = new Date("2026-05-27T12:00:00Z");
    const v = checkDeviceQuota(
      slot({ devicesActivated: 1, lastDeviceAt: new Date("2026-05-27T11:30:00Z") }),
      now,
    );
    expect(v).toEqual({ ok: true, bumpUsage: false, remaining: 2 });
  });

  it("returns ok+bump=true when last view is older than 60min (new session)", () => {
    const now = new Date("2026-05-27T12:00:00Z");
    const v = checkDeviceQuota(
      slot({ devicesActivated: 1, lastDeviceAt: new Date("2026-05-27T10:30:00Z") }),
      now,
    );
    expect(v).toEqual({ ok: true, bumpUsage: true, remaining: 1 });
  });

  it("refuses when devicesActivated == maxDevices", () => {
    expect(checkDeviceQuota(slot({ devicesActivated: 3 }))).toEqual({
      ok: false,
      reason: "QUOTA_EXHAUSTED",
      max: 3,
    });
  });

  it("refuses (defensively) when devicesActivated > maxDevices", () => {
    expect(checkDeviceQuota(slot({ devicesActivated: 5 }))).toEqual({
      ok: false,
      reason: "QUOTA_EXHAUSTED",
      max: 3,
    });
  });

  it("treats maxDevices=null as unlimited (legacy slots)", () => {
    expect(
      checkDeviceQuota(slot({ maxDevices: null, devicesActivated: 9999 })),
    ).toEqual({ ok: true, bumpUsage: false, remaining: null });
  });

  it("computes remaining=0 when this view consumes the last slot", () => {
    const v = checkDeviceQuota(slot({ devicesActivated: 2 }));
    expect(v).toEqual({ ok: true, bumpUsage: true, remaining: 0 });
  });
});
