import { describe, it, expect } from "vitest";
import {
    NON_PAYABLE_STATUSES,
    isPayableStatus,
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
});
