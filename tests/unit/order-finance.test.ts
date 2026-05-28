import { describe, it, expect } from "vitest";
import {
    NON_PAYABLE_STATUSES,
    DELIVERED_STATUSES,
    isPayableStatus,
    isCancellable,
    isRefundable,
    canMarkDelivered,
    orderOutstandingDebt,
} from "@/lib/order-finance";
import { OrderStatus } from "@/lib/constants";

describe("order-finance helpers", () => {
    describe("isPayableStatus", () => {
        it("rejects cancelled orders (terminal)", () => {
            expect(isPayableStatus(OrderStatus.ANNULE)).toBe(false);
        });

        it("rejects refunded orders (terminal)", () => {
            expect(isPayableStatus(OrderStatus.REMBOURSE)).toBe(false);
        });

        it("allows a pending order to be paid", () => {
            expect(isPayableStatus(OrderStatus.EN_ATTENTE)).toBe(true);
        });

        it("allows incremental payment on a partially-paid order", () => {
            expect(isPayableStatus(OrderStatus.PARTIEL)).toBe(true);
            expect(isPayableStatus(OrderStatus.NON_PAYE)).toBe(true);
        });

        it("exposes the canonical non-payable set", () => {
            expect(NON_PAYABLE_STATUSES).toContain(OrderStatus.ANNULE);
            expect(NON_PAYABLE_STATUSES).toContain(OrderStatus.REMBOURSE);
        });

        it("treats unknown/empty status as not payable (fail-closed)", () => {
            expect(isPayableStatus(null)).toBe(false);
            expect(isPayableStatus(undefined)).toBe(false);
            expect(isPayableStatus("")).toBe(false);
        });
    });

    describe("orderOutstandingDebt", () => {
        it("returns the outstanding amount for a client order", () => {
            expect(orderOutstandingDebt({ clientId: 7, resteAPayer: "1500.00" })).toBe(1500);
        });

        it("returns 0 when there is no associated client (anonymous order)", () => {
            expect(orderOutstandingDebt({ clientId: null, resteAPayer: "1500.00" })).toBe(0);
            expect(orderOutstandingDebt({ resteAPayer: "1500.00" })).toBe(0);
        });

        it("returns 0 when the order is fully paid (no debt to reverse)", () => {
            expect(orderOutstandingDebt({ clientId: 7, resteAPayer: "0" })).toBe(0);
            expect(orderOutstandingDebt({ clientId: 7, resteAPayer: null })).toBe(0);
        });

        it("never returns a negative amount", () => {
            expect(orderOutstandingDebt({ clientId: 7, resteAPayer: "-50" })).toBe(0);
        });

        it("clamps float drift to 2 decimals", () => {
            // 13.499999999999998 → 13.5
            expect(orderOutstandingDebt({ clientId: 7, resteAPayer: String(4.5 * 3) })).toBe(13.5);
        });

        it("treats non-numeric resteAPayer as zero", () => {
            expect(orderOutstandingDebt({ clientId: 7, resteAPayer: "abc" })).toBe(0);
        });
    });

    describe("isCancellable", () => {
        it("allows cancelling pre-delivery orders", () => {
            expect(isCancellable(OrderStatus.EN_ATTENTE)).toBe(true);
            expect(isCancellable(OrderStatus.NON_PAYE)).toBe(true);
            expect(isCancellable(OrderStatus.PARTIEL)).toBe(true);
            expect(isCancellable(OrderStatus.PAYE)).toBe(true);
        });
        it("blocks cancelling a delivered order (codes already in customer hands)", () => {
            expect(isCancellable(OrderStatus.TERMINE)).toBe(false);
            expect(isCancellable(OrderStatus.LIVRE)).toBe(false);
        });
        it("blocks cancelling a terminal order (double-cancel/refund)", () => {
            expect(isCancellable(OrderStatus.ANNULE)).toBe(false);
            expect(isCancellable(OrderStatus.REMBOURSE)).toBe(false);
        });
        it("fail-closed on unknown/empty status", () => {
            expect(isCancellable(null)).toBe(false);
            expect(isCancellable(undefined)).toBe(false);
            expect(isCancellable("")).toBe(false);
        });
        it("exposes the delivered set", () => {
            expect(DELIVERED_STATUSES).toContain(OrderStatus.TERMINE);
            expect(DELIVERED_STATUSES).toContain(OrderStatus.LIVRE);
        });
    });

    describe("isRefundable", () => {
        it("allows refunding paid/delivered orders", () => {
            expect(isRefundable(OrderStatus.PARTIEL)).toBe(true);
            expect(isRefundable(OrderStatus.PAYE)).toBe(true);
            expect(isRefundable(OrderStatus.LIVRE)).toBe(true);
            expect(isRefundable(OrderStatus.TERMINE)).toBe(true);
        });
        it("blocks refunding an unpaid order (nothing to refund)", () => {
            expect(isRefundable(OrderStatus.EN_ATTENTE)).toBe(false);
            expect(isRefundable(OrderStatus.NON_PAYE)).toBe(false);
        });
        it("blocks double-refund of a terminal order", () => {
            expect(isRefundable(OrderStatus.ANNULE)).toBe(false);
            expect(isRefundable(OrderStatus.REMBOURSE)).toBe(false);
        });
        it("fail-closed on unknown/empty status", () => {
            expect(isRefundable(null)).toBe(false);
            expect(isRefundable("")).toBe(false);
        });
    });

    describe("canMarkDelivered", () => {
        it("allows marking a paid order delivered", () => {
            expect(canMarkDelivered(OrderStatus.PAYE)).toBe(true);
            expect(canMarkDelivered(OrderStatus.PARTIEL)).toBe(true);
            expect(canMarkDelivered(OrderStatus.LIVRE)).toBe(true);
        });
        it("blocks marking an unpaid order delivered", () => {
            expect(canMarkDelivered(OrderStatus.EN_ATTENTE)).toBe(false);
            expect(canMarkDelivered(OrderStatus.NON_PAYE)).toBe(false);
        });
        it("blocks re-marking a terminal/already-done order", () => {
            expect(canMarkDelivered(OrderStatus.TERMINE)).toBe(false);
            expect(canMarkDelivered(OrderStatus.ANNULE)).toBe(false);
            expect(canMarkDelivered(OrderStatus.REMBOURSE)).toBe(false);
        });
        it("fail-closed on unknown/empty status", () => {
            expect(canMarkDelivered(null)).toBe(false);
        });
    });
});
