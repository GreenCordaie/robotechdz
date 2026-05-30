import { describe, it, expect, vi } from "vitest";
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

// --- Mocks for the markIptvDispatchFailed test below ---------------------
// Module-scoped vi.mock() hoists ABOVE imports; safe because the pure-helper
// tests above only touch @/lib/order-finance + @/lib/constants.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/encryption", () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }));
vi.mock("@/lib/orders", () => ({ allocateOrderStock: vi.fn() }));
vi.mock("@/lib/events", () => ({
    eventBus: { publish: vi.fn() },
    SystemEvent: { ORDER_PAID: "ORDER_PAID", ORDER_DELIVERED: "ORDER_DELIVERED", ORDER_PRINTED: "ORDER_PRINTED" },
}));
vi.mock("@/db/schema", () => ({
    orders: { _name: "orders", id: { _c: "id" } },
    clients: { _name: "clients" },
    clientPayments: { _name: "client_payments" },
    digitalCodes: { _name: "digital_codes" },
    orderItems: { _name: "order_items" },
    auditLogs: { _name: "audit_logs" },
}));
vi.mock("drizzle-orm", () => ({
    eq: (...a: unknown[]) => ({ _op: "eq", a }),
    and: (...a: unknown[]) => ({ _op: "and", a }),
    or: (...a: unknown[]) => ({ _op: "or", a }),
    sql: Object.assign(
        (strings: TemplateStringsArray, ...vals: unknown[]) => ({ _op: "sql", strings, vals }),
        { param: (v: unknown) => ({ _op: "param", v }) },
    ),
}));

type Captured = { table: { _name?: string }; v: Record<string, unknown> };

function makeOrderTx(orderRow: { id: number; status: string } | null) {
    const updates: Captured[] = [];
    const inserts: Captured[] = [];
    const tx = {
        select: () => ({
            from: () => ({
                where: () => ({
                    for: async () => (orderRow ? [orderRow] : []),
                }),
            }),
        }),
        update: (table: { _name?: string }) => ({
            set: (v: Record<string, unknown>) => ({
                where: async () => { updates.push({ table, v }); return []; },
            }),
        }),
        insert: (table: { _name?: string }) => ({
            values: async (v: Record<string, unknown>) => { inserts.push({ table, v }); return []; },
        }),
    };
    return { tx, updates, inserts };
}

vi.mock("@/db", () => ({
    db: {
        transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
            // The fixture overrides this per-test by re-mocking; default is a noop tx.
            return await fn({});
        },
    },
}));

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

/**
 * B2 audit fix: fire-and-forget IPTV dispatch in OrderService.payOrder() leaves
 * the order PAYE without credentials when provisioning throws or returns zero.
 * `markIptvDispatchFailed(orderId, reason)` is the compensating action: it
 * flips PAYE/TERMINE → EN_ATTENTE (NOT ANNULE — manual review path) and writes
 * an `auditLogs` row "IPTV_DISPATCH_FAILED".
 */
describe("OrderService.markIptvDispatchFailed", () => {
    it("rolls a PAYE order back to EN_ATTENTE and writes an audit row", async () => {
        const { tx, updates, inserts } = makeOrderTx({ id: 42, status: OrderStatus.PAYE });
        const dbMod = await import("@/db");
        (dbMod.db as unknown as { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> })
            .transaction = async (fn) => await fn(tx);

        const { OrderService } = await import("@/services/order.service");
        const result = await OrderService.markIptvDispatchFailed(42, "Provider 503");

        expect(result).toEqual({ rolledBack: true });

        const orderUpdate = updates.find((u) => u.table._name === "orders");
        expect(orderUpdate?.v.status).toBe(OrderStatus.EN_ATTENTE);

        const audit = inserts.find((i) => i.table._name === "audit_logs");
        expect(audit?.v).toMatchObject({
            action: "IPTV_DISPATCH_FAILED",
            entityType: "ORDER",
            entityId: "42",
        });
        expect((audit?.v.newData as { reason?: string })?.reason).toContain("Provider 503");
    });

    it("is a no-op when the order is already in a non-PAYE/TERMINE state (idempotence)", async () => {
        const { tx, updates, inserts } = makeOrderTx({ id: 42, status: OrderStatus.ANNULE });
        const dbMod = await import("@/db");
        (dbMod.db as unknown as { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> })
            .transaction = async (fn) => await fn(tx);

        const { OrderService } = await import("@/services/order.service");
        const result = await OrderService.markIptvDispatchFailed(42, "Provider 503");

        expect(result).toEqual({ rolledBack: false });
        expect(updates).toHaveLength(0);
        expect(inserts).toHaveLength(0);
    });

    it("is a no-op when the order is not found", async () => {
        const { tx, updates, inserts } = makeOrderTx(null);
        const dbMod = await import("@/db");
        (dbMod.db as unknown as { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> })
            .transaction = async (fn) => await fn(tx);

        const { OrderService } = await import("@/services/order.service");
        const result = await OrderService.markIptvDispatchFailed(999, "Reason");

        expect(result).toEqual({ rolledBack: false });
        expect(updates).toHaveLength(0);
        expect(inserts).toHaveLength(0);
    });
});
