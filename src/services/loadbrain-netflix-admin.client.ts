/**
 * Boutique → LoadBrain admin client (P3-3).
 *
 * Proxies shared-account admin edits to LoadBrain (system of record). Today it
 * carries the slot device-cap (maxDevices → LoadBrain max_uses) so the
 * authoritative counter (P3-1/P3-2) stays in step with what the operator sets in
 * /admin/comptes-partages.
 *
 * Like the device-quota client, admin proxy calls DEGRADE (return `unavailable`)
 * instead of throwing: a LoadBrain hiccup must never fail an admin save (the
 * local write already committed; the reconciler / a later edit re-aligns). The
 * caller logs and moves on.
 */
import { logger } from "@/lib/logger";

export interface SetSlotQuotaInput {
    siteId: string;
    /** LoadBrain slot id (digital_code_slots.lbSlotId). */
    lbSlotId: string;
    /** Device cap; null = unlimited. Mirrors maxDevices. */
    maxUses: number | null;
}

export type SetSlotQuotaResult =
    | { ok: true; maxUses: number | null }
    | { ok: false; reason: "not_found" | "unavailable" };

export interface AdminClientDeps {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
}

export async function setSlotQuotaRemote(
    input: SetSlotQuotaInput,
    deps: AdminClientDeps = {},
): Promise<SetSlotQuotaResult> {
    const base = process.env.LOADBRAIN_URL;
    if (!base) return { ok: false, reason: "unavailable" };

    const fetchFn = deps.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 5_000);

    try {
        const res = await fetchFn(
            `${base.replace(/\/$/, "")}/internal/slot/${encodeURIComponent(input.lbSlotId)}/quota`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(process.env.LOADBRAIN_INTERNAL_TOKEN
                        ? { "X-Internal-Token": process.env.LOADBRAIN_INTERNAL_TOKEN }
                        : {}),
                    ...(process.env.LOADBRAIN_API_KEY
                        ? { "X-API-Key": process.env.LOADBRAIN_API_KEY }
                        : {}),
                },
                body: JSON.stringify({ siteId: input.siteId, maxUses: input.maxUses }),
                signal: controller.signal,
            },
        );

        if (res.status === 200) {
            const j = (await res.json()) as { maxUses?: number | null };
            return { ok: true, maxUses: j.maxUses ?? null };
        }
        if (res.status === 404) return { ok: false, reason: "not_found" };

        logger.warn("[lb-admin] set-quota unexpected status — degrading", {
            action: "loadbrain.admin.set_quota.unexpected",
            metadata: { status: res.status },
        });
        return { ok: false, reason: "unavailable" };
    } catch (err: unknown) {
        logger.warn("[lb-admin] set-quota failed — degrading", {
            action: "loadbrain.admin.set_quota.failed",
            metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        return { ok: false, reason: "unavailable" };
    } finally {
        clearTimeout(timer);
    }
}

export interface DeleteAccountInput {
    siteId: string;
    /** LoadBrain account id (digital_codes.lbAccountId). */
    lbAccountId: string;
}

export type DeleteAccountResult =
    | { ok: true; deletedSlots: number }
    | { ok: false; reason: "not_found" | "has_active_slots" | "unavailable" };

/**
 * Proxy a shared-account deletion to LoadBrain (P3-3). Degrades to `unavailable`
 * instead of throwing — an admin delete already committed locally; a LoadBrain
 * hiccup must not fail it (the reconciler / a manual retry re-aligns). A 409
 * (`has_active_slots`) is surfaced so the operator knows LoadBrain still holds a
 * live customer on that account.
 */
export async function deleteAccountRemote(
    input: DeleteAccountInput,
    deps: AdminClientDeps = {},
): Promise<DeleteAccountResult> {
    const base = process.env.LOADBRAIN_URL;
    if (!base) return { ok: false, reason: "unavailable" };

    const fetchFn = deps.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 5_000);

    try {
        const res = await fetchFn(
            `${base.replace(/\/$/, "")}/internal/account/${encodeURIComponent(input.lbAccountId)}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    ...(process.env.LOADBRAIN_INTERNAL_TOKEN
                        ? { "X-Internal-Token": process.env.LOADBRAIN_INTERNAL_TOKEN }
                        : {}),
                    ...(process.env.LOADBRAIN_API_KEY
                        ? { "X-API-Key": process.env.LOADBRAIN_API_KEY }
                        : {}),
                },
                body: JSON.stringify({ siteId: input.siteId }),
                signal: controller.signal,
            },
        );

        if (res.status === 200) {
            const j = (await res.json()) as { deletedSlots?: number };
            return { ok: true, deletedSlots: j.deletedSlots ?? 0 };
        }
        if (res.status === 404) return { ok: false, reason: "not_found" };
        if (res.status === 409) return { ok: false, reason: "has_active_slots" };

        logger.warn("[lb-admin] delete-account unexpected status — degrading", {
            action: "loadbrain.admin.delete_account.unexpected",
            metadata: { status: res.status },
        });
        return { ok: false, reason: "unavailable" };
    } catch (err: unknown) {
        logger.warn("[lb-admin] delete-account failed — degrading", {
            action: "loadbrain.admin.delete_account.failed",
            metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        return { ok: false, reason: "unavailable" };
    } finally {
        clearTimeout(timer);
    }
}
