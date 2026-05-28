import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Webhook handler unit-test (Lot 3).
 *
 * The handler in `src/app/api/loadbrain/webhook/v2/route.ts` is wired through
 * `@loadbrain/sdk-v2`'s `createWebhookHandler`. To exercise the BSV branches
 * without standing up a real HTTP roundtrip + DB, we intercept the SDK and
 * capture the handler map directly.
 */

vi.mock("server-only", () => ({}));

// Set env BEFORE any module under test loads
process.env.ENCRYPTION_KEY ||= "test_encryption_key_32_bytes_xxxxxxxxxx";
process.env.LOADBRAIN_WEBHOOK_SECRET ||= "test_secret";

// Capture handlers passed to createWebhookHandler
let capturedHandlers: Record<string, (event: { data: unknown }) => Promise<void>> = {};

vi.mock("@loadbrain/sdk-v2", () => ({
    createWebhookHandler: (cfg: { handlers: Record<string, (event: { data: unknown }) => Promise<void>> }) => {
        capturedHandlers = cfg.handlers;
        return async () => new Response("ok");
    },
}));

// Mock encryption to a deterministic transform so we can assert on stored values
vi.mock("@/lib/encryption", () => ({
    encrypt: (s: string) => `ENC:${s}`,
    decrypt: (s: string) => s.replace(/^ENC:/, ""),
}));

// Mock IPTV processor (irrelevant to BSV branches)
vi.mock("@/lib/iptv-webhook-processor", () => ({
    processCompletedTask: vi.fn(),
    processFailedTask: vi.fn(),
}));

// DB mock — tracks all inserts/updates so we can assert
type Captured = {
    inserts: Record<string, unknown[]>;
    updates: Record<string, unknown[]>;
};
const captured: Captured = { inserts: {}, updates: {} };

const fakeBsvOrder = {
    id: 77,
    localOrderId: 12,
    resellerId: 5,
    listingId: "lst_000001",
    quantity: 1,
    pricePaidDzd: "311.00",
    lbOrderId: "lb_abc",
    status: "PENDING_LOADBRAIN",
    wonSnapshot: null,
    completedAt: null,
    createdAt: new Date(),
};

// Row returned by the in-transaction `SELECT ... FOR UPDATE` idempotency guard.
// Tests mutate this to simulate a replayed webhook (already COMPLETED/REFUNDED).
let txFreshOrder: { status: string; [k: string]: unknown } = fakeBsvOrder;

const txApi = {
    select: () => ({
        from: () => ({
            where: () => ({
                for: async () => [txFreshOrder],
            }),
        }),
    }),
    insert: (table: { _tableName?: string }) => ({
        values: async (v: unknown) => {
            const key = table._tableName ?? "unknown";
            captured.inserts[key] ??= [];
            captured.inserts[key].push(v);
            return [{ id: 999 }];
        },
    }),
    update: (table: { _tableName?: string }) => ({
        set: (v: unknown) => ({
            where: async () => {
                const key = table._tableName ?? "unknown";
                captured.updates[key] ??= [];
                captured.updates[key].push(v);
                return [];
            },
        }),
    }),
    query: {
        resellers: {
            findFirst: async () => ({
                id: 5,
                companyName: "Test Co",
                contactPhone: "+213000",
                wallet: { id: 11, balance: "1000.00" },
            }),
        },
    },
};

vi.mock("@/db", () => ({
    db: {
        select: () => ({
            from: () => ({
                where: async () => [fakeBsvOrder],
            }),
        }),
        transaction: async (fn: (tx: typeof txApi) => Promise<unknown>) => {
            return fn(txApi);
        },
        update: (table: { _tableName?: string }) => ({
            set: (v: unknown) => ({
                where: async () => {
                    const key = table._tableName ?? "unknown";
                    captured.updates[key] ??= [];
                    captured.updates[key].push(v);
                    return [];
                },
            }),
        }),
        query: {
            resellers: {
                findFirst: async () => null,
            },
            orders: {
                findFirst: async () => ({
                    id: 12,
                    orderNumber: "BSV-1",
                }),
            },
        },
    },
}));

vi.mock("@/db/schema", () => ({
    bsvOrders: { _tableName: "bsv_orders" },
    bsvDeliveredCodes: { _tableName: "bsv_delivered_codes" },
    orders: { _tableName: "orders" },
    resellerWallets: { _tableName: "reseller_wallets" },
    resellerTransactions: { _tableName: "reseller_transactions" },
    resellers: { _tableName: "resellers" },
}));

vi.mock("drizzle-orm", () => ({
    eq: (col: unknown, val: unknown) => ({ _op: "eq", col, val }),
    sql: Object.assign(
        (strings: TemplateStringsArray, ...vals: unknown[]) => ({
            _op: "sql",
            strings,
            vals,
        }),
        {}
    ),
}));

describe("v2 webhook handler — BSV branches", () => {
    beforeEach(async () => {
        captured.inserts = {};
        captured.updates = {};
        txFreshOrder = fakeBsvOrder;
        // Import once so capturedHandlers is populated
        await import("@/app/api/loadbrain/webhook/v2/route");
    });

    it("registers the giftcards.order.delivered handler", () => {
        expect(capturedHandlers["giftcards.order.delivered"]).toBeTypeOf(
            "function"
        );
    });

    it("registers the giftcards.order.failed handler", () => {
        expect(capturedHandlers["giftcards.order.failed"]).toBeTypeOf("function");
    });

    it("on delivered: inserts encrypted codes + marks bsv_orders COMPLETED + flips local order to LIVRE", async () => {
        await capturedHandlers["giftcards.order.delivered"]({
            data: {
                orderId: "lb_abc",
                codes: [
                    { index: 0, code: "AAAA-BBBB-CCCC" },
                    { index: 1, code: "DDDD-EEEE-FFFF" },
                ],
            },
        });

        const inserted = captured.inserts["bsv_delivered_codes"] ?? [];
        expect(inserted).toHaveLength(2);
        expect(inserted[0]).toMatchObject({
            bsvOrderId: 77,
            code: "ENC:AAAA-BBBB-CCCC",
        });

        const bsvUpdate = captured.updates["bsv_orders"]?.[0] as {
            status?: string;
        };
        expect(bsvUpdate?.status).toBe("COMPLETED");

        const orderUpdate = captured.updates["orders"]?.[0] as {
            status?: string;
            isDelivered?: boolean;
        };
        expect(orderUpdate?.status).toBe("LIVRE");
        expect(orderUpdate?.isDelivered).toBe(true);
    });

    it("on failed: refunds wallet + marks bsv_orders REFUNDED + flips local order to ANNULE", async () => {
        await capturedHandlers["giftcards.order.failed"]({
            data: {
                orderId: "lb_abc",
                error: "Out of stock",
            },
        });

        const bsvUpdate = captured.updates["bsv_orders"]?.[0] as {
            status?: string;
        };
        expect(bsvUpdate?.status).toBe("REFUNDED");

        const walletUpdate = captured.updates["reseller_wallets"]?.[0];
        expect(walletUpdate).toBeTruthy();

        const txInsert = captured.inserts["reseller_transactions"]?.[0] as {
            type?: string;
        };
        expect(txInsert?.type).toBe("REFUND");

        const orderUpdate = captured.updates["orders"]?.[0] as {
            status?: string;
        };
        expect(orderUpdate?.status).toBe("ANNULE");
    });

    it("on replayed delivered (order already COMPLETED): no duplicate codes, no status flip", async () => {
        txFreshOrder = { ...fakeBsvOrder, status: "COMPLETED" };
        await capturedHandlers["giftcards.order.delivered"]({
            data: {
                orderId: "lb_abc",
                codes: [{ index: 0, code: "DUP-DUP-DUP" }],
            },
        });
        expect(captured.inserts["bsv_delivered_codes"]).toBeUndefined();
        expect(captured.updates["bsv_orders"]).toBeUndefined();
        expect(captured.updates["orders"]).toBeUndefined();
    });

    it("on replayed failed (order already REFUNDED): no double wallet refund", async () => {
        txFreshOrder = { ...fakeBsvOrder, status: "REFUNDED" };
        await capturedHandlers["giftcards.order.failed"]({
            data: { orderId: "lb_abc", error: "retry" },
        });
        expect(captured.updates["reseller_wallets"]).toBeUndefined();
        expect(captured.inserts["reseller_transactions"]).toBeUndefined();
        expect(captured.updates["bsv_orders"]).toBeUndefined();
    });

    it("ignores unknown lbOrderId gracefully", async () => {
        // Replace db.select to return empty
        const { db } = await import("@/db");
        (db as unknown as { select: () => unknown }).select = () => ({
            from: () => ({ where: async () => [] }),
        });

        await expect(
            capturedHandlers["giftcards.order.delivered"]({
                data: { orderId: "lb_unknown", codes: [] },
            })
        ).resolves.toBeUndefined();
    });
});
