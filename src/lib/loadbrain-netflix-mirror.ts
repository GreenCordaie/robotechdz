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
import { eq } from "drizzle-orm";
import { digitalCodeSlots, slotActivationTokens } from "@/db/schema";
import { DigitalCodeSlotStatus } from "@/lib/constants";

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
                await db
                    .update(digitalCodeSlots)
                    .set({ status: DigitalCodeSlotStatus.DISPONIBLE, orderItemId: null })
                    .where(eq(digitalCodeSlots.lbSlotId, lbSlotId));
            }
            return;
        }
        case "slot.expired": {
            const lbSlotId = event.payload.lbSlotId as string | undefined;
            if (lbSlotId) {
                await db
                    .update(digitalCodeSlots)
                    .set({ status: DigitalCodeSlotStatus.EXPIRE })
                    .where(eq(digitalCodeSlots.lbSlotId, lbSlotId));
            }
            return;
        }
        case "code.captured": {
            const publicToken = event.payload.publicToken as string | undefined;
            const type = event.payload.type as "OTP_CODE" | "HOUSEHOLD_LINK";
            const value = String(event.payload.value ?? "");
            const timestamp = String(event.payload.timestamp ?? new Date().toISOString());
            if (!publicToken || !value) return;
            const slotId = await resolveLocalSlotId(db, publicToken);
            if (slotId != null) deps.publish(slotId, { type, value, timestamp });
            return;
        }
        default:
            // slot.allocated / account.* → mirror reconciliation handled by the
            // import/reconcile job in later phases. No-op in P0.
            return;
    }
}
