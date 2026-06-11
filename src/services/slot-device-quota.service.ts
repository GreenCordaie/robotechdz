import "server-only";
import { eq, and, sql, gte, isNull, or } from "drizzle-orm";
import type { db as defaultDb } from "@/db";
import { digitalCodeSlots } from "@/db/schema";

/**
 * Slot device quota — Option C hybrid.
 *
 * Counts distinct page-view "sessions" per slot. A session is collapsed to
 * a single hit per 60 minutes regardless of refreshes, so the customer can
 * reload his /activer page freely on the SAME device without burning the
 * quota.
 *
 * Public API:
 *   - `checkDeviceQuota(slot)` — pure eligibility verdict
 *   - `bumpDeviceUsage(db, slotId)` — atomic SQL bump if a new session
 */

const SESSION_DEBOUNCE_MS = 60 * 60 * 1000;

export type SlotQuotaInput = Pick<
  typeof digitalCodeSlots.$inferSelect,
  "maxDevices" | "devicesActivated" | "lastDeviceAt"
>;

export type QuotaVerdict =
  | { ok: true; bumpUsage: boolean; remaining: number | null }
  | { ok: false; reason: "QUOTA_EXHAUSTED"; max: number };

/**
 * Pure function — given the slot row + current Date, decides whether the
 * activation page should render. No DB write here; the route handler calls
 * `bumpDeviceUsage` separately if `bumpUsage` is true.
 */
export function checkDeviceQuota(
  slot: SlotQuotaInput,
  now: Date = new Date(),
): QuotaVerdict {
  // NULL max_devices = unlimited (legacy slots before this migration).
  if (slot.maxDevices === null || slot.maxDevices === undefined) {
    return { ok: true, bumpUsage: false, remaining: null };
  }

  const used = slot.devicesActivated ?? 0;
  if (used >= slot.maxDevices) {
    return { ok: false, reason: "QUOTA_EXHAUSTED", max: slot.maxDevices };
  }

  const fresh =
    slot.lastDeviceAt === null ||
    slot.lastDeviceAt === undefined ||
    now.getTime() - new Date(slot.lastDeviceAt).getTime() >= SESSION_DEBOUNCE_MS;

  return {
    ok: true,
    bumpUsage: fresh,
    remaining: slot.maxDevices - used - (fresh ? 1 : 0),
  };
}

/**
 * Atomically bumps `devices_activated` ONLY if the last_device_at is older
 * than 60 min (the SQL WHERE clause guards against a concurrent same-device
 * refresh racing into a double-count). Returns true if the bump happened.
 */
export async function bumpDeviceUsage(
  db: typeof defaultDb,
  slotId: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - SESSION_DEBOUNCE_MS);
  const result = await db
    .update(digitalCodeSlots)
    .set({
      devicesActivated: sql`${digitalCodeSlots.devicesActivated} + 1`,
      lastDeviceAt: new Date(),
    })
    .where(
      and(
        eq(digitalCodeSlots.id, slotId),
        // Don't exceed the cap even on race
        sql`(${digitalCodeSlots.maxDevices} IS NULL OR ${digitalCodeSlots.devicesActivated} < ${digitalCodeSlots.maxDevices})`,
        or(
          isNull(digitalCodeSlots.lastDeviceAt),
          sql`${digitalCodeSlots.lastDeviceAt} < ${cutoff}`,
        ),
      ),
    )
    .returning({ id: digitalCodeSlots.id });
  return result.length > 0;
}

export const __forTests = { SESSION_DEBOUNCE_MS };
