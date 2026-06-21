/**
 * Boutique → LoadBrain device-quota client (P3-2).
 *
 * Calls LoadBrain's authoritative device-bump (P3-1) so LoadBrain is the single
 * anti-link-sharing counter. UNLIKE the allocation client (which fails CLOSED by
 * throwing), this one DEGRADES: a LoadBrain outage / unexpected status returns
 * `{ ok:false, reason:"unavailable" }` instead of throwing, so the caller can
 * fall back to the LOCAL mirror cap (still strict) rather than hard-denying a
 * paying customer because LoadBrain blinked. The cap itself stays enforced on
 * both sides; only the COUNTER authority degrades.
 */
import { logger } from "@/lib/logger";

export interface DeviceBumpInput {
    siteId: string;
    /** LoadBrain slot id (digital_code_slots.lbSlotId). */
    lbSlotId: string;
    /** Session-collapse window; mirrors the boutique's 60-min debounce. */
    debounceMinutes?: number;
}

export type DeviceBumpRemote =
    | { ok: true; remaining: number | null; debounced: boolean }
    | { ok: false; reason: "quota_exhausted" | "not_found" | "unavailable" };

export interface DeviceQuotaDeps {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
}

export async function bumpDeviceUsageRemote(
    input: DeviceBumpInput,
    deps: DeviceQuotaDeps = {},
): Promise<DeviceBumpRemote> {
    const base = process.env.LOADBRAIN_URL;
    if (!base) return { ok: false, reason: "unavailable" };

    const fetchFn = deps.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 5_000);

    try {
        const res = await fetchFn(
            `${base.replace(/\/$/, "")}/internal/slot/${encodeURIComponent(input.lbSlotId)}/device-bump`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(process.env.LOADBRAIN_INTERNAL_TOKEN
                        ? { "X-Internal-Token": process.env.LOADBRAIN_INTERNAL_TOKEN }
                        : {}),
                    ...(process.env.LOADBRAIN_API_KEY
                        ? { "X-API-Key": process.env.LOADBRAIN_API_KEY }
                        : {}),
                },
                body: JSON.stringify({
                    siteId: input.siteId,
                    ...(input.debounceMinutes !== undefined
                        ? { debounceMinutes: input.debounceMinutes }
                        : {}),
                }),
                signal: controller.signal,
            },
        );

        if (res.status === 200) {
            const j = (await res.json()) as { remaining?: number | null; debounced?: boolean };
            return { ok: true, remaining: j.remaining ?? null, debounced: !!j.debounced };
        }
        if (res.status === 409) return { ok: false, reason: "quota_exhausted" };
        if (res.status === 404) return { ok: false, reason: "not_found" };

        logger.warn("[lb-device-quota] unexpected status — degrading to local", {
            action: "loadbrain.device_bump.unexpected",
            metadata: { status: res.status },
        });
        return { ok: false, reason: "unavailable" };
    } catch (err: unknown) {
        logger.warn("[lb-device-quota] call failed — degrading to local", {
            action: "loadbrain.device_bump.failed",
            metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        return { ok: false, reason: "unavailable" };
    } finally {
        clearTimeout(timer);
    }
}
