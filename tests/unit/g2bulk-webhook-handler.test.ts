import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * G2Bulk webhook handler unit-test (Lot 4).
 *
 * Mirrors tests/unit/bsv-webhook-handler.test.ts. We intercept
 * `createWebhookHandler` from @loadbrain/sdk-v2 to capture the handlers map
 * directly, then drive each g2bulk.* branch and assert on captured DB calls.
 */

vi.mock("server-only", () => ({}));

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

vi.mock("@/lib/encryption", () => ({
    encrypt: (s: string) => `ENC:${s}`,
    decrypt: (s: string) => s.replace(/^ENC:/, ""),
}));

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

const fakeG2BulkOrder = {
    id: 88,
    localOrderId: 13,
    resellerId: 6,
    productId: "g2b_prod_123",
    quantity: 1,
    pricePaidDzd: "422.00",
    lbOrderId: "lb_g2b_abc",
    status: "PENDING_LOADBRAIN",
    wonSnapshot: null,
    completedAt: null,
    createdAt: new Date(),
};

const txApi = {
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
                id: 6,
                companyName: "G2B Co",
                contactPhone: "+213000",
                wallet: { id: 22, balance: "1000.00" },
            }),
        },
    },
};

vi.mock("@/db", () => ({
    db: {
        select: () => ({
            from: () => ({
                where: async () => [fakeG2BulkOrder],
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
                    id: 13,
                    orderNumber: "G2B-1",
                }),
            },
        },
    },
}));

vi.mock("@/db/schema", () => ({
    bsvOrders: { _tableName: "bsv_orders" },
    bsvDeliveredCodes: { _tableName: "bsv_delivered_codes" },
    g2bulkOrders: { _tableName: "g2bulk_orders", lbOrderId: { _col: "lb_order_id" } },
    g2bulkDeliveredCodes: { _tableName: "g2bulk_delivered_codes" },
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

describe("v2 webhook handler — G2Bulk branches", () => {
    beforeEach(async () => {
        captured.inserts = {};
        captured.updates = {};
        // Reset modules so route.ts re-imports cleanly when needed
        await import("@/app/api/loadbrain/webhook/v2/route");
    });

    it("registers the g2bulk.order.delivered handler", () => {
        expect(capturedHandlers["g2bulk.order.delivered"]).toBeTypeOf("function");
    });

    it("registers the g2bulk.order.failed handler", () => {
        expect(capturedHandlers["g2bulk.order.failed"]).toBeTypeOf("function");
    });

    it("registers the g2bulk.order.refunded handler", () => {
        expect(capturedHandlers["g2bulk.order.refunded"]).toBeTypeOf("function");
    });

    it("on delivered: inserts encrypted codes + marks g2bulk_orders COMPLETED + flips local order to LIVRE", async () => {
        await capturedHandlers["g2bulk.order.delivered"]({
            data: {
                orderId: "lb_g2b_abc",
                codes: [
                    { index: 0, code: "GGGG-HHHH-IIII" },
                    { index: 1, code: "JJJJ-KKKK-LLLL", pin: "1234" },
                ],
            },
        });

        const inserted = captured.inserts["g2bulk_delivered_codes"] ?? [];
        expect(inserted).toHaveLength(2);
        expect(inserted[0]).toMatchObject({
            g2bulkOrderId: 88,
            code: "ENC:GGGG-HHHH-IIII",
        });
        expect(inserted[1]).toMatchObject({
            g2bulkOrderId: 88,
            code: "ENC:JJJJ-KKKK-LLLL",
            pin: "ENC:1234",
        });

        const g2bulkUpdate = captured.updates["g2bulk_orders"]?.[0] as {
            status?: string;
        };
        expect(g2bulkUpdate?.status).toBe("COMPLETED");

        const orderUpdate = captured.updates["orders"]?.[0] as {
            status?: string;
            isDelivered?: boolean;
        };
        expect(orderUpdate?.status).toBe("LIVRE");
        expect(orderUpdate?.isDelivered).toBe(true);
    });

    it("on failed: refunds wallet + marks g2bulk_orders REFUNDED + flips local order to ANNULE", async () => {
        await capturedHandlers["g2bulk.order.failed"]({
            data: {
                orderId: "lb_g2b_abc",
                error: "Provider out of stock",
            },
        });

        const g2bulkUpdate = captured.updates["g2bulk_orders"]?.[0] as {
            status?: string;
        };
        expect(g2bulkUpdate?.status).toBe("REFUNDED");

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

    it("on refunded: behaves identically to failed (REFUNDED + wallet refund)", async () => {
        await capturedHandlers["g2bulk.order.refunded"]({
            data: {
                orderId: "lb_g2b_abc",
                error: "Provider issued refund",
            },
        });

        const g2bulkUpdate = captured.updates["g2bulk_orders"]?.[0] as {
            status?: string;
        };
        expect(g2bulkUpdate?.status).toBe("REFUNDED");

        const txInsert = captured.inserts["reseller_transactions"]?.[0] as {
            type?: string;
        };
        expect(txInsert?.type).toBe("REFUND");
    });

    it("ignores unknown lbOrderId gracefully", async () => {
        // Replace db.select to return empty
        const { db } = await import("@/db");
        (db as unknown as { select: () => unknown }).select = () => ({
            from: () => ({ where: async () => [] }),
        });

        await expect(
            capturedHandlers["g2bulk.order.delivered"]({
                data: { orderId: "lb_unknown", codes: [] },
            })
        ).resolves.toBeUndefined();
    });
});
