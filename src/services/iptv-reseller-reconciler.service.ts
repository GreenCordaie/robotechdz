import "server-only";
/**
 * IPTV reseller reconciler — polls LoadBrain for the state of every
 * PENDING_LOADBRAIN row in `reseller_iptv_orders` and applies the upstream
 * outcome to the local mirror. Mirrors the shape of `g2bulk-reconciler.service`.
 *
 * Why pull on a cron in addition to webhooks: webhook delivery is best-effort
 * (network, signature drift, replay rejections), and `lb_task_id` may be
 * attached AFTER the webhook would have fired in race conditions. The
 * reconciler is the safety net that guarantees eventual consistency.
 */

import { db as defaultDb } from "@/db";
import { resellerIptvOrders } from "@/db/schema";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { lbV2 } from "@/lib/loadbrain-v2";
import {
    markIptvOrderDelivered,
    markIptvOrderFailed,
    type DbLike,
} from "@/services/iptv-reseller.service";

export type IptvReconcileResult = {
    scanned: number;
    delivered: number;
    refunded: number;
    stillPending: number;
    errors: Array<{ iptvOrderId: number; lbTaskId: string | null; reason: string }>;
};

const MAX_SCAN_AGE_DAYS = 7;

type IptvRow = typeof resellerIptvOrders.$inferSelect;

/** Best-effort expiry extraction across the four provider payload shapes. */
function extractExpiry(payload: unknown): Date | null {
    if (!payload || typeof payload !== "object") return null;
    const obj = payload as Record<string, unknown>;

    const tryParse = (v: unknown): Date | null => {
        if (!v) return null;
        if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
        if (typeof v === "number") {
            const d = new Date(v);
            return Number.isFinite(d.getTime()) ? d : null;
        }
        if (typeof v === "string") {
            // ISO first (most upstream events).
            const iso = new Date(v);
            if (Number.isFinite(iso.getTime())) return iso;
            // Panelking/Atlas Xtream format: "DD-MM-YYYY HH:MM" (French style).
            const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(v.trim());
            if (m) {
                const [, dd, mm, yyyy, hh, mi] = m;
                const d = new Date(
                    `${yyyy}-${mm}-${dd}T${hh}:${mi}:00`,
                );
                return Number.isFinite(d.getTime()) ? d : null;
            }
        }
        return null;
    };

    const direct =
        tryParse(obj.expiresAt) ??
        tryParse(obj.expiry) ??
        tryParse(obj.expirationDate) ??
        tryParse((obj.task as Record<string, unknown> | undefined)?.expiresAt) ??
        tryParse((obj.order as Record<string, unknown> | undefined)?.expiresAt);
    if (direct) return direct;

    const creds = obj.credentials as Record<string, unknown> | undefined;
    if (creds) {
        const credDirect =
            tryParse(creds.expiresAt) ??
            tryParse(creds.expiry) ??
            tryParse(creds.expirationDate);
        if (credDirect) return credDirect;
        const screens = creds.screens as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(screens) && screens.length > 0) {
            for (const s of screens) {
                const d = tryParse(s.expiresAt) ?? tryParse(s.expiry);
                if (d) return d;
            }
        }
    }
    return null;
}

/** Pull credentials shape into the mirror's identity fields. */
function extractIdentifiers(payload: unknown): {
    upstreamLineId: string | null;
    providerAccountId: string | null;
} {
    if (!payload || typeof payload !== "object")
        return { upstreamLineId: null, providerAccountId: null };
    const obj = payload as Record<string, unknown>;
    const creds = (obj.credentials ?? {}) as Record<string, unknown>;
    // Panelking/Atlas wrap credentials inside `screens[]` (Xtream multi-line).
    // First screen is the canonical one for single-line accounts.
    const screens = creds.screens as Array<Record<string, unknown>> | undefined;
    const firstScreen = Array.isArray(screens) && screens.length > 0 ? screens[0] : {};

    const pickString = (...candidates: unknown[]): string | null => {
        for (const c of candidates) {
            if (typeof c === "string" && c.trim().length > 0) return c.trim();
            if (typeof c === "number" && Number.isFinite(c)) return String(c);
        }
        return null;
    };

    return {
        upstreamLineId: pickString(
            firstScreen.lineId,
            firstScreen.id,
            creds.lineId,
            creds.id,
            obj.lineId,
            obj.upstreamLineId,
            obj.deviceId,
        ),
        providerAccountId: pickString(
            firstScreen.username,
            creds.username,
            creds.account,
            creds.mac,
            creds.accountId,
            obj.username,
            obj.providerAccountId,
        ),
    };
}

export async function reconcilePendingIptvOrders(
    options: { dbInstance?: DbLike; limit?: number } = {},
): Promise<IptvReconcileResult> {
    const db = options.dbInstance ?? defaultDb;
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const result: IptvReconcileResult = {
        scanned: 0,
        delivered: 0,
        refunded: 0,
        stillPending: 0,
        errors: [],
    };
    if (!lbV2) {
        result.errors.push({
            iptvOrderId: 0,
            lbTaskId: null,
            reason: "LoadBrain SDK not configured (LOADBRAIN_API_KEY missing)",
        });
        return result;
    }

    const pending = await db
        .select()
        .from(resellerIptvOrders)
        .where(
            and(
                eq(resellerIptvOrders.status, "PENDING_LOADBRAIN"),
                or(
                    isNotNull(resellerIptvOrders.lbTaskId),
                    isNotNull(resellerIptvOrders.lbOrderId),
                ),
                sql`${resellerIptvOrders.createdAt} > NOW() - (${MAX_SCAN_AGE_DAYS}::int * INTERVAL '1 day')`,
            ),
        )
        .limit(limit);

    result.scanned = pending.length;

    for (const row of pending) {
        try {
            const outcome = await reconcileOne(db, row);
            if (outcome === "delivered") result.delivered++;
            else if (outcome === "refunded") result.refunded++;
            else result.stillPending++;
        } catch (err) {
            result.errors.push({
                iptvOrderId: row.id,
                lbTaskId: row.lbTaskId ?? null,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return result;
}

async function reconcileOne(
    db: DbLike,
    row: IptvRow,
): Promise<"delivered" | "refunded" | "pending"> {
    if (!lbV2) throw new Error("lbV2 not configured");

    let payload: unknown = null;
    if (row.lbTaskId) {
        payload = await lbV2.provision.tasks.get(row.lbTaskId);
    } else if (row.lbOrderId) {
        payload = await lbV2.provision.orders.get(row.lbOrderId);
    } else {
        return "pending";
    }

    // SDK returns shape variants depending on endpoint:
    //   { task: { status, credentials, ... } }   for provision.tasks.get
    //   { order: { status, ... } }              for provision.orders.get
    //   { status, ... }                          (legacy / occasional)
    // Probe in order so credentials extraction below also sees the right
    // nested object.
    const obj = (payload ?? {}) as Record<string, unknown>;
    const inner =
        (obj.task as Record<string, unknown> | undefined) ??
        (obj.order as Record<string, unknown> | undefined) ??
        obj;
    const upstreamStatus = String(inner.status ?? obj.status ?? "").toLowerCase();

    if (upstreamStatus === "completed" || upstreamStatus === "delivered") {
        // Pass `inner` (the unwrapped task/order object) so the credentials
        // probes hit credentials.* one level up rather than missing them.
        const ids = extractIdentifiers(inner);
        const expiry = extractExpiry(inner);
        await markIptvOrderDelivered(db, {
            id: row.id,
            resellerId: row.resellerId,
            upstreamLineId: ids.upstreamLineId,
            providerAccountId: ids.providerAccountId,
            expiresAt: expiry,
            snapshot: payload,
        });
        return "delivered";
    }
    if (
        upstreamStatus === "failed" ||
        upstreamStatus === "cancelled" ||
        upstreamStatus === "canceled" ||
        upstreamStatus === "refunded"
    ) {
        const errMsg =
            typeof inner.error === "string"
                ? inner.error
                : typeof obj.error === "string"
                  ? obj.error
                  : `upstream ${upstreamStatus}`;
        await markIptvOrderFailed(db, {
            id: row.id,
            resellerId: row.resellerId,
            reason: errMsg,
        });
        return "refunded";
    }

    // Still in-flight (queued/processing/pending). Bump lastSyncedAt.
    await db
        .update(resellerIptvOrders)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(resellerIptvOrders.id, row.id));
    return "pending";
}

/**
 * Bulk-flip ACTIVE / FROZEN rows whose `expiresAt` is in the past to EXPIRED.
 * Display-layer logic (deriveEffectiveStatus) already presents these rows as
 * expired, but listings, exports, and any consumer that reads the raw `status`
 * column should not depend on the display layer. Persisting the terminal state
 * at the mirror keeps the DB as the source of truth.
 *
 * Safe to run on every reconciler tick — bounded by `limit` and a single
 * UPDATE…IN. Idempotent (no-op once a row is already EXPIRED).
 *
 * Authorized by user 2026-05-30 as the documented follow-up to the reseller
 * IPTV bug fix lot (commit a047517).
 */
export type IptvExpireResult = { expired: number };

export async function markExpiredIptvOrders(
    options: { dbInstance?: DbLike; limit?: number } = {},
): Promise<IptvExpireResult> {
    const db = options.dbInstance ?? defaultDb;
    const limit = Math.max(1, Math.min(options.limit ?? 500, 5_000));

    // Two-step: SELECT ids to cap fan-out, then UPDATE WHERE id IN (...). One
    // round-trip per cycle. The ACTIVE / FROZEN gate prevents clobbering any
    // already-terminal state (CANCELLED / FAILED / REFUNDED / EXPIRED) or any
    // still-provisioning state (PENDING_LOADBRAIN — handled by the live
    // reconciler above).
    const candidates = await db
        .select({ id: resellerIptvOrders.id })
        .from(resellerIptvOrders)
        .where(
            and(
                or(
                    eq(resellerIptvOrders.status, "ACTIVE"),
                    eq(resellerIptvOrders.status, "FROZEN"),
                ),
                isNotNull(resellerIptvOrders.expiresAt),
                sql`${resellerIptvOrders.expiresAt} < NOW()`,
            ),
        )
        .limit(limit);

    if (candidates.length === 0) return { expired: 0 };

    const ids = candidates.map((c) => c.id);
    await db
        .update(resellerIptvOrders)
        .set({
            status: "EXPIRED",
            lastStatusAt: new Date(),
            updatedAt: new Date(),
        })
        .where(sql`${resellerIptvOrders.id} IN ${ids}`);

    return { expired: ids.length };
}

export async function reconcileIptvOrderById(
    id: number,
    options: { dbInstance?: DbLike } = {},
): Promise<"delivered" | "refunded" | "pending" | { error: string }> {
    const db = options.dbInstance ?? defaultDb;
    if (!lbV2) return { error: "LoadBrain SDK not configured" };
    const [row] = await db
        .select()
        .from(resellerIptvOrders)
        .where(eq(resellerIptvOrders.id, id));
    if (!row) return { error: "iptv_order not found" };
    if (row.status !== "PENDING_LOADBRAIN") return { error: `already ${row.status}` };
    try {
        return await reconcileOne(db, row);
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
