import { OrderStatus } from "@/lib/constants";

/**
 * Pure financial helpers for the order lifecycle.
 *
 * Extracted so the money-critical rules (which states may receive a payment,
 * how much client debt an order carries) are unit-tested in isolation and
 * shared by payOrder, cancelOrderAction and refundFullOrder instead of being
 * re-implemented — and drifting — at each call site.
 */

/** Terminal states that must never accept a new payment. */
export const NON_PAYABLE_STATUSES: readonly string[] = [
    OrderStatus.ANNULE,
    OrderStatus.REMBOURSE,
];

/**
 * Whether an order in the given status may still be paid.
 * Fail-closed: an unknown/empty status is treated as not payable.
 */
export function isPayableStatus(status: string | null | undefined): boolean {
    if (!status) return false;
    return !NON_PAYABLE_STATUSES.includes(status);
}

/**
 * Outstanding client debt carried by an order, clamped to >= 0 and rounded to
 * the centime. Returns 0 when the order has no associated client (anonymous).
 *
 * Used to reverse `clients.total_dette_dzd` when an order with unpaid balance
 * is cancelled or refunded — otherwise the client keeps phantom debt.
 */
export function orderOutstandingDebt(order: {
    clientId?: number | null;
    resteAPayer?: string | null;
}): number {
    if (!order.clientId) return 0;
    const reste = parseFloat(order.resteAPayer ?? "0");
    if (!Number.isFinite(reste) || reste <= 0) return 0;
    return Math.round(reste * 100) / 100;
}
