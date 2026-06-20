/**
 * Pure mirror-update logic for inbound LoadBrain netflix webhooks.
 *
 * LoadBrain (`modules/netflix`) is the system-of-record. When it allocates,
 * releases, expires a slot, or captures an OTP/household code, it emits a
 * signed webhook. The boutique receiver (src/app/api/loadbrain/netflix/
 * webhook/route.ts) verifies the signature, then hands the parsed event here
 * to keep the local mirror tables consistent and to republish captured codes
 * onto the existing SSE event-bus.
 *
 * This module is intentionally db- and bus-agnostic (deps injected) so it is
 * unit-testable without live infra. It performs NO signature checks — that is
 * the receiver's job.
 */
import { and, eq } from "drizzle-orm";
import { digitalCodeSlots, slotActivationTokens, slotEvents } from "@/db/schema";
import { DigitalCodeSlotStatus } from "@/lib/constants";
import { encrypt } from "@/lib/encryption";

// Validation caps for code.captured payloads (defence at the mirror boundary).
const CAPTURED_TYPES = ["OTP_CODE", "HOUSEHOLD_LINK"] as const;
const MAX_CAPTURED_VALUE_LEN = 2048;

export type NetflixWebhookEventName =
    | "slot.allocated"
    | "slot.released"
    | "slot.expired"
    | "account.updated"
    | "code.captured";

export interface NetflixWebhookEvent {
    event: NetflixWebhookEventName | string;
    deliveryId: string;
    payload: Record<string, unknown>;
}

export interface MirrorDeps {
    publish: (
        slotId: number,
        payload: { type: "OTP_CODE" | "HOUSEHOLD_LINK"; value: string; timestamp: string },
    ) => void;
}

/** Map a LoadBrain public_token back to the local mirror slot id via slot_activation_tokens. */
async function resolveLocalSlotId(db: any, publicToken: string): Promise<number | null> {
    const row = await db.query.slotActivationTokens.findFirst({
        where: eq(slotActivationTokens.token, publicToken),
    });
    return row?.slotId ?? null;
}

/**
 * Resolve the parent digital_code id for a mirror slot. slot_events.digital_code_id
 * is NOT NULL, so we need this before we can persist a captured code for replay.
 */
async function resolveDigitalCodeId(db: any, slotId: number): Promise<number | null> {
    const row = await db.query.digitalCodeSlots.findFirst({
        where: eq(digitalCodeSlots.id, slotId),
        columns: { digitalCodeId: true },
    });
    return row?.digitalCodeId ?? null;
}

/**
 * Persist a captured code into slot_events so the existing SSE replay-on-connect
 * (src/app/api/activer/[token]/events/route.ts) surfaces it even if the customer
 * opens /activer a beat after the webhook arrives. Without this, webhook-delivered
 * codes were live-only and lost on a late page-open (P0 finding).
 *
 * Idempotent via onConflictDoNothing on the same (digital_code_id, source_email_id)
 * key as the partial UNIQUE index se_dedup_idx, so a re-delivered webhook with the
 * same codeId is a DB no-op rather than a duplicate row.
 *
 * Resilient: a persistence hiccup (e.g. encryption error) must NOT block live
 * delivery, so failures are logged and swallowed — the caller still publishes.
 */
async function persistCapturedCode(
    db: any,
    args: {
        slotId: number;
        type: (typeof CAPTURED_TYPES)[number];
        value: string;
        sourceEmailId: string;
        receivedAt: Date;
    },
): Promise<void> {
    try {
        const digitalCodeId = await resolveDigitalCodeId(db, args.slotId);
        if (digitalCodeId == null) {
            // No parent account for this slot — can't satisfy the NOT NULL FK.
            // Skip persistence; the live publish still happens.
            return;
        }
        await db
            .insert(slotEvents)
            .values({
                slotId: args.slotId,
                digitalCodeId,
                eventType: args.type,
                valueEncrypted: encrypt(args.value),
                sourceEmailId: args.sourceEmailId,
                deliveredToSession: false,
                receivedAt: args.receivedAt,
            })
            .onConflictDoNothing({
                target: [slotEvents.digitalCodeId, slotEvents.sourceEmailId],
            });
    } catch (err) {
        // Persistence is best-effort relative to live delivery. Log and move on
        // so a transient DB/encryption failure never blocks the SSE publish.
        console.error(
            "[netflix-mirror] persist code.captured failed:",
            (err as { message?: string })?.message ?? err,
        );
    }
}

/**
 * Apply a verified LoadBrain netflix webhook to the boutique mirror.
 * Unknown events are a safe no-op (forward-compatible).
 */
export async function applyNetflixWebhook(
    db: any,
    event: NetflixWebhookEvent,
    deps: MirrorDeps,
): Promise<void> {
    switch (event.event) {
        case "slot.released": {
            const lbSlotId = event.payload.lbSlotId as string | undefined;
            if (lbSlotId) {
                // Current-state guard: only release a slot that is currently
                // VENDU. A release event targeting a slot that is already
                // DISPONIBLE/EXPIRE/DEFECTUEUX is a no-op — prevents a stray or
                // replayed event from clobbering an unrelated slot state.
                await db
                    .update(digitalCodeSlots)
                    .set({ status: DigitalCodeSlotStatus.DISPONIBLE, orderItemId: null })
                    .where(
                        and(
                            eq(digitalCodeSlots.lbSlotId, lbSlotId),
                            eq(digitalCodeSlots.status, DigitalCodeSlotStatus.VENDU),
                        ),
                    );
            }
            return;
        }
        case "slot.expired": {
            const lbSlotId = event.payload.lbSlotId as string | undefined;
            if (lbSlotId) {
                // Same discipline: only an active (VENDU) slot can expire.
                await db
                    .update(digitalCodeSlots)
                    .set({ status: DigitalCodeSlotStatus.EXPIRE })
                    .where(
                        and(
                            eq(digitalCodeSlots.lbSlotId, lbSlotId),
                            eq(digitalCodeSlots.status, DigitalCodeSlotStatus.VENDU),
                        ),
                    );
            }
            return;
        }
        case "code.captured": {
            const publicToken = event.payload.publicToken as string | undefined;
            const rawType = event.payload.type;
            const value = typeof event.payload.value === "string" ? event.payload.value : "";
            const timestamp = String(event.payload.timestamp ?? new Date().toISOString());
            // Validate at the boundary: type must be a known literal and value a
            // bounded non-empty string. Anything else is dropped (do not publish).
            if (typeof rawType !== "string" || !CAPTURED_TYPES.includes(rawType as (typeof CAPTURED_TYPES)[number])) {
                return;
            }
            const type = rawType as (typeof CAPTURED_TYPES)[number];
            if (!publicToken || value.length === 0 || value.length > MAX_CAPTURED_VALUE_LEN) {
                return;
            }
            const slotId = await resolveLocalSlotId(db, publicToken);
            if (slotId == null) return;
            // Dedup key: prefer the stable per-source-email codeId; fall back to
            // the webhook deliveryId when LoadBrain omits it. Mirrors se_dedup_idx.
            const sourceEmailId =
                (typeof event.payload.codeId === "string" && event.payload.codeId) || event.deliveryId;
            // Persist FIRST (best-effort) so a late /activer open replays this code,
            // THEN publish on the live bus. Persistence never blocks the publish.
            await persistCapturedCode(db, {
                slotId,
                type,
                value,
                sourceEmailId,
                receivedAt: new Date(timestamp),
            });
            deps.publish(slotId, { type, value, timestamp });
            return;
        }
        default:
            // slot.allocated / account.* → mirror reconciliation handled by the
            // import/reconcile job in later phases. No-op in P0.
            return;
    }
}
