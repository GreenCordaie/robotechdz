/**
 * Central B2B Wallet service helpers.
 *
 * Pure utility / validation helpers that don't touch the DB — kept here for
 * unit testability. DB transactions live in the server actions.
 *
 * Currency: DZD throughout, stored as numeric(12,2). Never use JS floats for
 * authoritative math — these helpers do string parsing + validation only and
 * leave the actual increment to Postgres (`balance + amount`) for precision.
 */

export const MAX_AMOUNT_DZD = 100_000_000; // 100 millions DZD — hard cap

export type AmountValidation =
    | { ok: true; value: number; normalized: string }
    | { ok: false; error: string };

/**
 * Validates a DZD amount: positive, within bounds, max 2 decimals.
 */
export function validateAmountDzd(input: number | string): AmountValidation {
    const raw = typeof input === "number" ? input.toString() : input.trim();
    if (!raw) return { ok: false, error: "Montant requis" };

    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
        return { ok: false, error: "Montant invalide (2 décimales max)" };
    }

    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return { ok: false, error: "Montant doit être > 0" };
    }
    if (value >= MAX_AMOUNT_DZD) {
        return { ok: false, error: `Montant doit être < ${MAX_AMOUNT_DZD} DZD` };
    }

    // Normalize to fixed 2 decimals for stable DB representation.
    const normalized = value.toFixed(2);
    return { ok: true, value, normalized };
}

/**
 * Checks whether the current central balance is sufficient for a debit.
 */
export function hasSufficientBalance(
    currentBalanceDzd: string | number,
    amountDzd: number
): boolean {
    const current = typeof currentBalanceDzd === "number"
        ? currentBalanceDzd
        : parseFloat(currentBalanceDzd || "0");
    if (!Number.isFinite(current)) return false;
    // Compare on integer minor units (centimes) to avoid float drift.
    const currentCents = Math.round(current * 100);
    const amountCents = Math.round(amountDzd * 100);
    return currentCents >= amountCents;
}

/**
 * Computes the resulting balance after a delta in cents space, returning a
 * fixed-precision string suitable for DB writes.
 */
export function computeBalanceAfter(
    currentBalanceDzd: string | number,
    deltaDzd: number
): string {
    const current = typeof currentBalanceDzd === "number"
        ? currentBalanceDzd
        : parseFloat(currentBalanceDzd || "0");
    const cents = Math.round(current * 100) + Math.round(deltaDzd * 100);
    return (cents / 100).toFixed(2);
}

export type CentralTxType = "admin_topup" | "reseller_credit" | "adjustment";

export function isCentralTxType(value: string): value is CentralTxType {
    return value === "admin_topup" || value === "reseller_credit" || value === "adjustment";
}
