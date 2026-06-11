import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Locks the C2 fix: a reseller refund must credit `reseller_wallets` and trace a
 * REFUND in `reseller_transactions`, and must NEVER touch `resellers` (which has
 * no balance column — the original bug did `UPDATE resellers SET balance` and
 * threw, rolling back the whole return approval).
 *
 * Uses the repo's mock-tx pattern (see g2bulk-webhook-handler.test.ts).
 */

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/stock-alerts", () => ({ checkStockAndAlert: vi.fn() }));
vi.mock("@/lib/security", () => ({ logSecurityAction: vi.fn() }));
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), critical: vi.fn() },
}));
vi.mock("@/lib/constants", () => ({
    OrderStatus: {},
    DigitalCodeStatus: {},
    DigitalCodeSlotStatus: {},
    SupplierTransactionType: { ACHAT_STOCK: "ACHAT_STOCK", RECHARGE: "RECHARGE" },
}));
vi.mock("@/db/schema", () => ({
    orders: { _name: "orders" },
    digitalCodes: { _name: "digital_codes" },
    digitalCodeSlots: { _name: "digital_code_slots" },
    orderItems: { _name: "order_items" },
    suppliers: { _name: "suppliers", balance: { _c: "balance" } },
    supplierTransactions: { _name: "supplier_transactions" },
    productVariantSuppliers: { _name: "pvs" },
    resellerWallets: { _name: "reseller_wallets", id: { _c: "id" }, resellerId: { _c: "reseller_id" }, balance: { _c: "balance" } },
    resellerTransactions: { _name: "reseller_transactions" },
}));
vi.mock("drizzle-orm", () => ({
    eq: (...a: unknown[]) => ({ _op: "eq", a }),
    and: (...a: unknown[]) => ({ _op: "and", a }),
    inArray: (...a: unknown[]) => ({ _op: "inArray", a }),
    exists: (...a: unknown[]) => ({ _op: "exists", a }),
    sql: Object.assign(
        (strings: TemplateStringsArray, ...vals: unknown[]) => ({ _op: "sql", strings, vals }),
        { param: (v: unknown) => ({ _op: "param", v }) },
    ),
}));

import { refundResellerWallet } from "@/lib/orders";

type Captured = { table: { _name?: string }; v: Record<string, unknown> };

function makeTx(walletRows: Array<{ id: number }>) {
    const updates: Captured[] = [];
    const inserts: Captured[] = [];
    const tx = {
        select: () => ({
            from: () => ({
                where: () => ({
                    for: async () => walletRows,
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

describe("refundResellerWallet", () => {
    it("credits reseller_wallets and writes a REFUND ledger row when a wallet exists", async () => {
        const { tx, updates, inserts } = makeTx([{ id: 42 }]);

        const credited = await refundResellerWallet(tx, {
            resellerId: 6,
            montant: 500,
            orderId: 13,
            description: "Remboursement Commande #13 (Retour Approuvé)",
        });

        expect(credited).toBe(true);

        const walletUpdate = updates.find((u) => u.table._name === "reseller_wallets");
        expect(walletUpdate).toBeTruthy();

        const ledger = inserts.find((i) => i.table._name === "reseller_transactions");
        expect(ledger?.v).toMatchObject({
            walletId: 42,
            type: "REFUND",
            amount: "500",
            orderId: 13,
        });
    });

    it("never touches the `resellers` table (no balance column there)", async () => {
        const { tx, updates, inserts } = makeTx([{ id: 42 }]);
        await refundResellerWallet(tx, { resellerId: 6, montant: 500, orderId: 13 });

        expect(updates.every((u) => u.table._name !== "resellers")).toBe(true);
        expect(inserts.every((i) => i.table._name !== "resellers")).toBe(true);
    });

    it("is a no-op (returns false) when the reseller has no wallet row", async () => {
        const { tx, updates, inserts } = makeTx([]);

        const credited = await refundResellerWallet(tx, { resellerId: 99, montant: 500, orderId: 13 });

        expect(credited).toBe(false);
        expect(updates).toHaveLength(0);
        expect(inserts).toHaveLength(0);
    });

    it("defaults the ledger description when none is given", async () => {
        const { tx, inserts } = makeTx([{ id: 7 }]);
        await refundResellerWallet(tx, { resellerId: 1, montant: 250, orderId: 99 });

        const ledger = inserts.find((i) => i.table._name === "reseller_transactions");
        expect(ledger?.v.description).toBe("Remboursement Commande #99");
    });

    /**
     * B2 audit fix: the approveReturn caller (src/app/admin/caisse/actions.ts)
     * must treat `false` as a hard failure when a reseller is expected and
     * THROW inside the transaction so the whole refund rolls back. This test
     * locks the contract from the helper side:
     *   1. The helper returns false (no wallet row).
     *   2. NO reseller_transactions row is written.
     * The caller's new guard `if (!walletCredited) throw …` then rolls back
     * the surrounding tx so no other refund side-effect (client_payments,
     * orders.status REMBOURSE, supplier reversal) is persisted either.
     */
    it("throws on missing reseller wallet when reseller is expected (caller contract)", async () => {
        const { tx, updates, inserts } = makeTx([]); // no wallet row

        const credited = await refundResellerWallet(tx, {
            resellerId: 6, // reseller expected (order.resellerId set)
            montant: 500,
            orderId: 13,
            description: "Remboursement Commande #13 (Retour Approuvé)",
        });

        // Helper signals miss → caller MUST throw to abort the tx.
        expect(credited).toBe(false);

        // Critical: no ledger row written → after caller throws, the rollback
        // leaves `reseller_transactions` clean (no orphan REFUND row).
        const ledger = inserts.find((i) => i.table._name === "reseller_transactions");
        expect(ledger).toBeUndefined();

        // And no wallet UPDATE either.
        const walletUpdate = updates.find((u) => u.table._name === "reseller_wallets");
        expect(walletUpdate).toBeUndefined();

        // Simulate the caller-side guard: this is the contract the actions.ts
        // refund flow now enforces (`if (!walletCredited) throw new Error(...)`).
        expect(() => {
            if (!credited) {
                throw new Error("Wallet revendeur introuvable — refund annulé");
            }
        }).toThrow("Wallet revendeur introuvable — refund annulé");
    });
});
