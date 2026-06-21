/**
 * Centralized device-quota enforcement (P3-2).
 *
 * For a slot that was allocated via LoadBrain (carries an lbSlotId), the
 * authoritative anti-link-sharing counter lives in LoadBrain. This orchestrator
 * bumps LoadBrain (P3-1 device-bump) and renders the verdict; on a LoadBrain
 * outage it DEGRADES to the local mirror cap (still strict) rather than denying a
 * paying customer. Security-first: the cap is enforced on both sides; only the
 * counter authority degrades.
 *
 * Policy:
 *   - not centralized (no lbSlotId) or no siteId → local enforcement (unchanged).
 *   - remote ok, fresh session → mirror the bump locally (best-effort) + allow.
 *   - remote ok, debounced     → same session, allow (no local change).
 *   - remote quota_exhausted    → block (LoadBrain is authoritative).
 *   - remote unavailable/not_found → fall back to the local enforcer (cache).
 */
import { db as defaultDb } from "@/db";
import {
    bumpDeviceUsage as defaultMirrorBump,
    enforceLocalDeviceQuota as defaultLocalEnforce,
} from "@/services/slot-device-quota.service";
import { bumpDeviceUsageRemote as defaultBumpRemote } from "@/services/loadbrain-device-quota.client";
import type { DeviceBumpInput, DeviceBumpRemote } from "@/services/loadbrain-device-quota.client";

/** 60-min session collapse, mirrors the boutique's SESSION_DEBOUNCE. */
const DEFAULT_DEBOUNCE_MINUTES = 60;

export interface CentralizedSlot {
    id: number;
    lbSlotId: string | null;
    maxDevices: number | null;
    /** notNull in schema (default 0). */
    devicesActivated: number;
    lastDeviceAt: Date | null;
}

export interface EnforceDeps {
    siteId?: string;
    debounceMinutes?: number;
    bumpRemoteFn?: (input: DeviceBumpInput) => Promise<DeviceBumpRemote>;
    localEnforceFn?: (
        db: any,
        slot: CentralizedSlot,
    ) => Promise<{ ok: boolean; max: number | null }>;
    mirrorBumpFn?: (db: any, slotId: number) => Promise<boolean>;
}

export interface QuotaResult {
    ok: boolean;
    max: number | null;
    source: "lb" | "local";
}

export async function enforceDeviceQuota(
    db: any,
    slot: CentralizedSlot,
    deps: EnforceDeps = {},
): Promise<QuotaResult> {
    const siteId = deps.siteId ?? process.env.LOADBRAIN_SITE_ID;
    const bumpRemoteFn = deps.bumpRemoteFn ?? defaultBumpRemote;
    const localEnforceFn = deps.localEnforceFn ?? defaultLocalEnforce;
    const mirrorBumpFn = deps.mirrorBumpFn ?? defaultMirrorBump;
    const debounceMinutes = deps.debounceMinutes ?? DEFAULT_DEBOUNCE_MINUTES;

    const local = async (): Promise<QuotaResult> => {
        const v = await localEnforceFn(db ?? defaultDb, slot);
        return { ok: v.ok, max: v.max, source: "local" };
    };

    // Not centralized or LoadBrain not configured → local path (unchanged).
    if (!slot.lbSlotId || !siteId) return local();

    const remote = await bumpRemoteFn({
        siteId,
        lbSlotId: slot.lbSlotId,
        debounceMinutes,
    });

    if (remote.ok) {
        // Keep the local mirror counter roughly in step (best-effort, never
        // blocks rendering). Skip on a debounced hit — same session, no change.
        if (!remote.debounced) {
            try {
                await mirrorBumpFn(db ?? defaultDb, slot.id);
            } catch {
                /* mirror drift is healed by the reconciler — never block here */
            }
        }
        return { ok: true, max: slot.maxDevices ?? null, source: "lb" };
    }

    if (remote.reason === "quota_exhausted") {
        return { ok: false, max: slot.maxDevices ?? 0, source: "lb" };
    }

    // unavailable | not_found → degrade to the local mirror cap.
    return local();
}
