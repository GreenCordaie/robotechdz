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

/** States where codes are already in the customer's hands. */
export const DELIVERED_STATUSES: readonly string[] = [
    OrderStatus.TERMINE,
    OrderStatus.LIVRE,
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
 * Whether an order may be cancelled. Only pre-delivery, non-terminal orders:
 * cancelling frees codes back to sellable stock, so a delivered order
 * (TERMINE/LIVRE) must go through the return workflow instead, and a terminal
 * order (ANNULE/REMBOURSE) must not be touched again. Fail-closed.
 */
export function isCancellable(status: string | null | undefined): boolean {
    if (!status) return false;
    return !NON_PAYABLE_STATUSES.includes(status) && !DELIVERED_STATUSES.includes(status);
}

/**
 * Whether an order may be fully refunded: money must have been taken
 * (PARTIEL/PAYE/LIVRE/TERMINE) and it must not already be terminal. Fail-closed.
 */
export function isRefundable(status: string | null | undefined): boolean {
    return (
        status === OrderStatus.PARTIEL ||
        status === OrderStatus.PAYE ||
        status === OrderStatus.LIVRE ||
        status === OrderStatus.TERMINE
    );
}

/**
 * Whether an order may be marked delivered/done: only from a paid state.
 * Blocks marking an unpaid order delivered or re-marking a terminal one.
 */
export function canMarkDelivered(status: string | null | undefined): boolean {
    return (
        status === OrderStatus.PAYE ||
        status === OrderStatus.PARTIEL ||
        status === OrderStatus.LIVRE
    );
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
