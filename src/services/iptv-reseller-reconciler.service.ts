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
import { extractScreen } from "@/lib/iptv-screen";

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
        // Persist the delivered credentials so the lines table can show
        // m3u/password without a live per-row poll (atlaspro/ironmax come
        // back via lb_order_id, which the live read used to skip).
        const screen = extractScreen(inner);
        await markIptvOrderDelivered(db, {
            id: row.id,
            resellerId: row.resellerId,
            upstreamLineId: ids.upstreamLineId,
            providerAccountId: ids.providerAccountId,
            expiresAt: expiry,
            snapshot: payload,
            m3uUrl: screen.m3uUrl,
            epgUrl: screen.epgUrl,
            credentialsPassword: screen.password,
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
