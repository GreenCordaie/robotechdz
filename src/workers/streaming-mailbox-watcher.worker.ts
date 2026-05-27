import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
    digitalCodes,
    digitalCodeSlots,
    slotActivationTokens,
    slotEvents,
    slotLifecycle,
} from "@/db/schema";
import { NetflixResolverService } from "@/services/netflix-resolver.service";
import { encrypt } from "@/lib/encryption";

/**
 * Streaming Mailbox Watcher — polls connected master accounts via MS Graph,
 * extracts OTP / household links from Netflix emails, routes events to the
 * right customer session, and proactively pushes household links to all 5
 * holders of the same account.
 *
 * Guarded by env `STREAMING_DEEPLINK_MODE=true` — flip to disable in prod.
 */

export type MonitoringIntensity = "HIGH" | "NORMAL" | "LOW";

const TEN_MIN_MS = 10 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const TWENTY_EIGHT_DAYS_MS = 28 * 24 * 60 * 60 * 1000;
const POLL_INTERVAL_HIGH_MS = 30 * 1000;
const POLL_INTERVAL_NORMAL_MS = 5 * 60 * 1000;
const POLL_INTERVAL_LOW_MS = 30 * 60 * 1000;

export interface SlotContext {
    id: number;
    activeTokenLastSeenAt: Date | null;
    soldAt: Date | null;
    lifecycle: { nextHouseholdExpectedAt: Date | null } | null;
}

export interface AccountContext {
    id: number;
    lastPolledAt: Date | null;
}

/**
 * Decides the polling intensity for an account based on current slot signals.
 *  - HIGH if any slot has been "seen" in the last 10 minutes (page open)
 *  - HIGH if a household update is expected in ±7 days
 *  - NORMAL if any slot was sold in the last 24 hours
 *  - LOW otherwise
 */
export function computeIntensity(
    now: Date,
    slots: SlotContext[]
): MonitoringIntensity {
    const nowMs = now.getTime();
    for (const s of slots) {
        if (s.activeTokenLastSeenAt && nowMs - s.activeTokenLastSeenAt.getTime() < TEN_MIN_MS) {
            return "HIGH";
        }
        const next = s.lifecycle?.nextHouseholdExpectedAt;
        if (next) {
            const diff = next.getTime() - nowMs;
            if (Math.abs(diff) < SEVEN_DAYS_MS) return "HIGH";
        }
    }
    for (const s of slots) {
        if (s.soldAt && nowMs - s.soldAt.getTime() < TWENTY_FOUR_H_MS) {
            return "NORMAL";
        }
    }
    return "LOW";
}

export function shouldPoll(
    intensity: MonitoringIntensity,
    lastPolledAt: Date | null,
    now: Date
): boolean {
    if (!lastPolledAt) return true;
    const elapsed = now.getTime() - lastPolledAt.getTime();
    if (intensity === "HIGH") return elapsed >= POLL_INTERVAL_HIGH_MS;
    if (intensity === "NORMAL") return elapsed >= POLL_INTERVAL_NORMAL_MS;
    return elapsed >= POLL_INTERVAL_LOW_MS;
}

/**
 * Routing decision for a captured Netflix email.
 *  - OTP_CODE → push to the slot with the most recent page view (single target)
 *  - HOUSEHOLD_LINK → broadcast to ALL active slots of the account
 */
export interface RouteTarget {
    slotIds: number[];
    eventType: "OTP_CODE" | "HOUSEHOLD_LINK";
}

export function routeEvent(
    eventType: "OTP_CODE" | "HOUSEHOLD_LINK",
    now: Date,
    slots: SlotContext[]
): RouteTarget {
    if (eventType === "HOUSEHOLD_LINK") {
        return { eventType, slotIds: slots.map((s) => s.id) };
    }
    // OTP_CODE → pick the slot most recently active on the page
    const recent = slots
        .filter((s) => s.activeTokenLastSeenAt && now.getTime() - s.activeTokenLastSeenAt.getTime() < TEN_MIN_MS)
        .sort((a, b) => (b.activeTokenLastSeenAt!.getTime() - a.activeTokenLastSeenAt!.getTime()));
    if (recent.length === 0) return { eventType, slotIds: [] };
    return { eventType, slotIds: [recent[0].id] };
}

/**
 * Persists a slot_event row with dedup on (digital_code_id, source_email_id).
 * Returns true if the event was newly inserted.
 */
export async function persistEvent(
    db: any,
    params: {
        digitalCodeId: number;
        slotId: number | null;
        eventType: "OTP_CODE" | "HOUSEHOLD_LINK";
        value: string;
        sourceEmailId: string | null;
    }
): Promise<{ inserted: boolean; id?: number }> {
    if (params.sourceEmailId) {
        const existing = await db.query.slotEvents.findFirst({
            where: and(
                eq(slotEvents.digitalCodeId, params.digitalCodeId),
                eq(slotEvents.sourceEmailId, params.sourceEmailId)
            ),
        });
        if (existing) return { inserted: false, id: existing.id };
    }
    try {
        const [row] = await db
            .insert(slotEvents)
            .values({
                digitalCodeId: params.digitalCodeId,
                slotId: params.slotId,
                eventType: params.eventType,
                valueEncrypted: encrypt(params.value),
                sourceEmailId: params.sourceEmailId,
            })
            .returning({ id: slotEvents.id });
        return { inserted: true, id: row?.id };
    } catch (err) {
        // A concurrent poll won the race against our findFirst check above; the
        // partial UNIQUE index se_dedup_idx (digital_code_id, source_email_id)
        // rejected this insert. Treat it as a dedup hit, not a failure — so the
        // same OTP/household email is never delivered twice.
        if (params.sourceEmailId && (err as { code?: string })?.code === "23505") {
            const existing = await db.query.slotEvents.findFirst({
                where: and(
                    eq(slotEvents.digitalCodeId, params.digitalCodeId),
                    eq(slotEvents.sourceEmailId, params.sourceEmailId)
                ),
            });
            return { inserted: false, id: existing?.id };
        }
        throw err;
    }
}

interface PollDeps {
    resolveEmail?: (
        email: string,
        token: string | null,
        clientId: string | null,
        codeId: number
    ) => Promise<{ type: string; value?: string; sourceEmailId?: string }>;
    broadcast?: (digitalCodeId: number, slotIds: number[], event: any) => void;
    /** Optional override for the proactive WhatsApp push on HOUSEHOLD_LINK.
     * Tests inject a stub; prod uses the default that talks to lib/whatsapp. */
    pushHouseholdWhatsapp?: (recipients: Array<{ phone: string; activationUrl: string; accountEmail: string; brandName: string }>) => Promise<void>;
}

/**
 * Polls one account, persists events, returns dispatch decisions. Pure-ish:
 * accepts a db handle + optional dep overrides for testing.
 */
export async function pollAccount(
    db: any,
    accountId: number,
    deps: PollDeps = {}
): Promise<{ polled: boolean; eventsCreated: number; dispatched: RouteTarget[] }> {
    const account = await db.query.digitalCodes.findFirst({
        where: eq(digitalCodes.id, accountId),
    });
    if (!account || account.msStatus !== "CONNECTED" || !account.msRefreshToken) {
        return { polled: false, eventsCreated: 0, dispatched: [] };
    }

    const slotRows = await db.query.digitalCodeSlots.findMany({
        where: eq(digitalCodeSlots.digitalCodeId, accountId),
    });
    const tokenRows = await db.query.slotActivationTokens.findMany({
        where: inArray(
            slotActivationTokens.slotId,
            slotRows.map((s: any) => s.id)
        ),
    });
    const lifecycleRows = await db.query.slotLifecycle.findMany({
        where: inArray(
            slotLifecycle.slotId,
            slotRows.map((s: any) => s.id)
        ),
    });

    const slots: SlotContext[] = slotRows.map((s: any) => ({
        id: s.id,
        activeTokenLastSeenAt: tokenRows.find((t: any) => t.slotId === s.id)?.lastSeenAt ?? null,
        soldAt: s.status === "VENDU" ? s.createdAt ?? null : null,
        lifecycle: lifecycleRows.find((l: any) => l.slotId === s.id) ?? null,
    }));

    const now = new Date();
    const intensity = computeIntensity(now, slots);
    if (!shouldPoll(intensity, account.msLastSync ?? null, now)) {
        return { polled: false, eventsCreated: 0, dispatched: [] };
    }

    const resolver =
        deps.resolveEmail ??
        (async (email, token, clientId, codeId) => {
            const r = await NetflixResolverService.resolve(email, token, clientId, codeId);
            // sourceEmailId is now plumbed through the resolver → enables the
            // (digital_code_id, source_email_id) dedup index to drop repeats
            // on re-poll instead of re-pushing the same code to the customer.
            return { type: r.type, value: r.value, sourceEmailId: r.sourceEmailId };
        });

    const result = await resolver(
        account.msAccountEmail!,
        account.msRefreshToken,
        account.msClientId,
        account.id
    );

    // Update last poll timestamp
    await db
        .update(digitalCodes)
        .set({ msLastSync: now })
        .where(eq(digitalCodes.id, account.id));

    if (result.type !== "CODE" && result.type !== "LINK") {
        return { polled: true, eventsCreated: 0, dispatched: [] };
    }

    const eventType: "OTP_CODE" | "HOUSEHOLD_LINK" =
        result.type === "CODE" ? "OTP_CODE" : "HOUSEHOLD_LINK";
    const route = routeEvent(eventType, now, slots);

    const dispatched: RouteTarget[] = [];
    let created = 0;

    if (route.slotIds.length === 0 && eventType === "OTP_CODE") {
        // No active session — persist with slotId=null so it can be replayed on open
        const persisted = await persistEvent(db, {
            digitalCodeId: account.id,
            slotId: null,
            eventType,
            value: result.value!,
            sourceEmailId: result.sourceEmailId ?? null,
        });
        if (persisted.inserted) created++;
    } else {
        for (const slotId of route.slotIds) {
            const persisted = await persistEvent(db, {
                digitalCodeId: account.id,
                slotId,
                eventType,
                value: result.value!,
                sourceEmailId: result.sourceEmailId ?? null,
            });
            if (persisted.inserted) created++;
        }
        if (created > 0) {
            dispatched.push(route);
            deps.broadcast?.(account.id, route.slotIds, {
                type: eventType,
                value: result.value,
                timestamp: now.toISOString(),
            });
            if (eventType === "HOUSEHOLD_LINK") {
                for (const slotId of route.slotIds) {
                    await upsertHouseholdLifecycle(db, slotId, now);
                }
                // Proactive WhatsApp fan-out: alert every customer of this
                // account that Netflix asked for a household update. The
                // first to click resolves it for everyone. Failures are
                // best-effort — page SSE still works as fallback.
                try {
                    await pushHouseholdWhatsAppNotifications(
                        db,
                        account.id,
                        route.slotIds,
                        result.value!,
                        deps,
                    );
                } catch (err: any) {
                    console.error(
                        "[StreamingWatcher] household whatsapp fan-out failed:",
                        err?.message,
                    );
                }
            }
        }
    }

    return { polled: true, eventsCreated: created, dispatched };
}

async function upsertHouseholdLifecycle(db: any, slotId: number, when: Date) {
    const existing = await db.query.slotLifecycle.findFirst({
        where: eq(slotLifecycle.slotId, slotId),
    });
    const next = new Date(when.getTime() + TWENTY_EIGHT_DAYS_MS);
    if (existing) {
        await db
            .update(slotLifecycle)
            .set({ lastHouseholdAt: when, nextHouseholdExpectedAt: next, updatedAt: when })
            .where(eq(slotLifecycle.slotId, slotId));
    } else {
        await db.insert(slotLifecycle).values({
            slotId,
            lastHouseholdAt: when,
            nextHouseholdExpectedAt: next,
            monitoringIntensity: "NORMAL",
        });
    }
}

/**
 * Top-level loop — iterates over all connected accounts every 30s.
 */
export async function runOnePass(db: any, deps: PollDeps = {}): Promise<{
    accountsScanned: number;
    eventsCreated: number;
}> {
    const accounts = await db.query.digitalCodes.findMany({
        where: and(eq(digitalCodes.msStatus, "CONNECTED"), isNotNull(digitalCodes.msRefreshToken)),
    });
    let total = 0;
    for (const a of accounts) {
        try {
            const res = await pollAccount(db, a.id, deps);
            total += res.eventsCreated;
        } catch (err: any) {
            console.error(`[StreamingWatcher] pollAccount(${a.id}) failed:`, err?.message);
        }
    }
    return { accountsScanned: accounts.length, eventsCreated: total };
}

let _interval: NodeJS.Timeout | null = null;

export function initStreamingMailboxWatcher() {
    if (process.env.STREAMING_DEEPLINK_MODE !== "true") {
        console.log("[StreamingWatcher] disabled (STREAMING_DEEPLINK_MODE != true)");
        return;
    }
    if (_interval) return;
    const tick = async () => {
        try {
            const { db } = await import("@/db");
            const { streamingEventBus } = await import("@/lib/streaming-event-bus");
            const res = await runOnePass(db as any, {
                broadcast: (digitalCodeId, slotIds, evt) => {
                    for (const slotId of slotIds) {
                        streamingEventBus.publish(slotId, evt);
                    }
                },
            });
            if (res.eventsCreated > 0) {
                console.log(
                    `[StreamingWatcher] pass: accounts=${res.accountsScanned} events=${res.eventsCreated}`
                );
            }
        } catch (err: any) {
            console.error("[StreamingWatcher] tick error:", err?.message);
        }
    };
    setTimeout(tick, 15_000); // initial delay so boot completes
    _interval = setInterval(tick, POLL_INTERVAL_HIGH_MS);
    console.log("[StreamingWatcher] scheduled every 30s");
}

/**
 * Build the per-recipient WhatsApp push list for a HOUSEHOLD_LINK event,
 * then either invoke the injected `pushHouseholdWhatsapp` dep (tests) or
 * the real WhatsApp + template stack (prod).
 *
 * Best-effort: silently skips slots without a phone or without an
 * activation URL. Returns the count of messages dispatched.
 */
export async function pushHouseholdWhatsAppNotifications(
    db: any,
    accountId: number,
    slotIds: number[],
    _householdLink: string,
    deps: PollDeps,
): Promise<{ sent: number; skipped: number }> {
    if (slotIds.length === 0) return { sent: 0, skipped: 0 };

    const account = await db.query.digitalCodes.findFirst({
        where: eq(digitalCodes.id, accountId),
    });
    const accountEmail = account?.msAccountEmail ?? "Netflix";

    const slotsWithCtx = await db.query.digitalCodeSlots.findMany({
        where: inArray(digitalCodeSlots.id, slotIds),
        with: {
            orderItem: {
                with: {
                    order: { with: { client: true } },
                },
            },
        },
    });

    const recipients: Array<{
        phone: string;
        activationUrl: string;
        accountEmail: string;
        brandName: string;
    }> = [];

    for (const s of slotsWithCtx as any[]) {
        const phone =
            s.orderItem?.order?.customerPhone ||
            s.orderItem?.order?.client?.telephone;
        if (!phone || !s.activationUrl) continue;
        recipients.push({
            phone,
            activationUrl: s.activationUrl,
            accountEmail,
            brandName: "Netflix",
        });
    }

    if (recipients.length === 0) {
        return { sent: 0, skipped: slotIds.length };
    }

    if (deps.pushHouseholdWhatsapp) {
        await deps.pushHouseholdWhatsapp(recipients);
        return { sent: recipients.length, skipped: slotIds.length - recipients.length };
    }

    // Default prod path — lazy-import to keep tests fast.
    const { loadAndRender } = await import("@/services/notification-templates.service");
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp");
    const { db: dbModule } = await import("@/db");
    const { shopSettings } = await import("@/db/schema");

    const settings = await (dbModule as any).query.shopSettings.findFirst();
    const waSettings = {
        whatsappApiUrl: settings?.whatsappApiUrl ?? undefined,
        whatsappApiKey: settings?.whatsappApiKey ?? undefined,
        whatsappInstanceName: settings?.whatsappInstanceName ?? undefined,
    };
    const shopName = settings?.shopName || "Ma Boutique";

    let sent = 0;
    for (const r of recipients) {
        try {
            const body = await loadAndRender("streaming.household.update_required", {
                companyName: shopName,
                brandName: r.brandName,
                accountEmail: r.accountEmail,
                activationUrl: r.activationUrl,
            });
            const phoneJid =
                r.phone.replace(/\D/g, "") + (r.phone.includes("@") ? "" : "@c.us");
            await sendWhatsAppMessage(phoneJid, body, waSettings);
            sent++;
        } catch (err: any) {
            console.error(
                `[StreamingWatcher] household whatsapp send failed (phone ${r.phone}):`,
                err?.message,
            );
        }
    }
    void shopSettings; // satisfy unused import (used via dbModule.query)
    return { sent, skipped: slotIds.length - sent };
}

export const __forTests = {
    TEN_MIN_MS,
    SEVEN_DAYS_MS,
    TWENTY_FOUR_H_MS,
    POLL_INTERVAL_HIGH_MS,
    POLL_INTERVAL_NORMAL_MS,
    POLL_INTERVAL_LOW_MS,
};
