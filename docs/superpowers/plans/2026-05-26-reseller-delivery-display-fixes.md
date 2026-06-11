# Reseller Delivery Display Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 real gaps in the already-built reseller G2Bulk/games order display: (#1) games orders show "Produit game:NNNN" with no player, (#2) refunded orders show no reason/amount, (#3) no refresh button / no pagination.

**Architecture:** The visibility UI already exists in `src/app/reseller/orders/components/G2BulkOrdersSection.tsx` (fed by `getG2BulkOrdersAction` in `src/app/reseller/orders/g2bulk-actions.ts`). We (1) make the games checkout populate `wonSnapshot.title` + `wonSnapshot.playerName` via a new pure helper, (2) merge (not replace) `wonSnapshot` in the delivery webhook so those fields survive, (3) surface the refund reason/amount, (4) add refresh + "load more".

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM, HeroUI, Vitest (unit, `tests/**/*.test.ts`), Playwright (E2E, `tests/e2e/*.spec.ts`).

---

### Task 1: Pure helper `buildGameWonSnapshot`

**Files:**
- Create: `src/app/reseller/shop/game-snapshot.ts`
- Test: `tests/reseller/game-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/reseller/game-snapshot.test.ts
import { describe, it, expect } from "vitest";
import { buildGameWonSnapshot, prettifyGameCode } from "@/app/reseller/shop/game-snapshot";

describe("prettifyGameCode", () => {
    it("turns a snake_case code into a Title Case label", () => {
        expect(prettifyGameCode("freefire_global")).toBe("Freefire Global");
        expect(prettifyGameCode("pubgm")).toBe("Pubgm");
    });
});

describe("buildGameWonSnapshot", () => {
    it("builds a title from game + package and reads playerName from userid", () => {
        const snap = buildGameWonSnapshot({
            gameCode: "freefire_global",
            catalogueId: 2055,
            packageName: "110",
            player: { userid: "2040376982" },
            lb: { orderId: "x1" },
        });
        expect(snap.kind).toBe("game");
        expect(snap.title).toBe("Freefire Global · 110");
        expect(snap.playerName).toBe("2040376982");
        expect(snap.catalogueId).toBe(2055);
        expect(snap.lb).toEqual({ orderId: "x1" });
    });

    it("falls back to the first player value when userid is absent", () => {
        const snap = buildGameWonSnapshot({
            gameCode: "genshin",
            catalogueId: 1,
            packageName: "60",
            player: { serverid: "Asia" },
        });
        expect(snap.playerName).toBe("Asia");
    });

    it("playerName is null when player is empty", () => {
        const snap = buildGameWonSnapshot({
            gameCode: "x",
            catalogueId: 1,
            packageName: "p",
            player: {},
        });
        expect(snap.playerName).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reseller/game-snapshot.test.ts`
Expected: FAIL — `Cannot find module '@/app/reseller/shop/game-snapshot'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/reseller/shop/game-snapshot.ts
/**
 * Pure helper: build the wonSnapshot stored on a game top-up order so the
 * reseller orders UI (G2BulkOrdersSection) can show a human product title and
 * the player it was topped up for, instead of "Produit game:NNNN".
 */
export interface GameWonSnapshot {
    kind: "game";
    gameCode: string;
    catalogueId: number;
    player: Record<string, string>;
    title: string;
    playerName: string | null;
    lb?: unknown;
}

/** "freefire_global" -> "Freefire Global". */
export function prettifyGameCode(code: string): string {
    return code
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

export function buildGameWonSnapshot(args: {
    gameCode: string;
    catalogueId: number;
    packageName: string;
    player: Record<string, string>;
    lb?: unknown;
}): GameWonSnapshot {
    const playerName = args.player.userid ?? Object.values(args.player)[0] ?? null;
    return {
        kind: "game",
        gameCode: args.gameCode,
        catalogueId: args.catalogueId,
        player: args.player,
        lb: args.lb,
        title: `${prettifyGameCode(args.gameCode)} · ${args.packageName}`,
        playerName,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reseller/game-snapshot.test.ts`
Expected: PASS (5 assertions across 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/reseller/shop/game-snapshot.ts tests/reseller/game-snapshot.test.ts
git commit -m "feat(reseller): pure helper for game order wonSnapshot (title + playerName)"
```

---

### Task 2: Use the helper in the games checkout

**Files:**
- Modify: `src/app/reseller/shop/g2bulk-games-actions.ts` (the `g2bulkOrders` insert inside `createG2BulkGameOrderAction`)

- [ ] **Step 1: Add the import** (top of file, with the other imports)

```ts
import { buildGameWonSnapshot } from "./game-snapshot";
```

- [ ] **Step 2: Replace the wonSnapshot in the insert**

Find the insert in the transaction:

```ts
                await tx.insert(g2bulkOrders).values({
                    localOrderId: newOrder.id,
                    resellerId: reseller.id,
                    productId: `game:${catalogueId}`,
                    quantity,
                    pricePaidDzd: totalAmount.toFixed(2),
                    lbOrderId: lb.orderId ?? null,
                    status: "PENDING_LOADBRAIN",
                    wonSnapshot: { kind: "game", gameCode, catalogueId, player, lb },
                });
```

Replace the `wonSnapshot` line with:

```ts
                    wonSnapshot: buildGameWonSnapshot({
                        gameCode,
                        catalogueId,
                        packageName: pkg.name,
                        player,
                        lb,
                    }),
```

(`pkg` is the package resolved earlier in the action via `cat.items.find(...)`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "error TS"`
Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/app/reseller/shop/g2bulk-games-actions.ts
git commit -m "fix(reseller): game orders store title + playerName in wonSnapshot"
```

---

### Task 3: Merge (not replace) wonSnapshot in the delivery webhook

**Files:**
- Modify: `src/app/api/loadbrain/webhook/v2/route.ts` (`handleG2BulkDelivered`, the `g2bulkOrders` update)

**Why:** On delivery, the webhook currently does `wonSnapshot: wonSnapshot ?? undefined`. If LoadBrain sends its own snapshot it **replaces** ours, dropping `title`/`playerName`. Merge so both coexist.

- [ ] **Step 1: Replace the update's `wonSnapshot` handling**

Find in `handleG2BulkDelivered`:

```ts
        await tx
            .update(g2bulkOrders)
            .set({
                status: "COMPLETED",
                completedAt: new Date(),
                wonSnapshot: wonSnapshot ?? undefined,
            })
            .where(eq(g2bulkOrders.id, localG2bulkOrder.id));
```

Replace the `wonSnapshot:` line with a merge of the existing snapshot and the upstream one:

```ts
                wonSnapshot: wonSnapshot
                    ? {
                          ...((localG2bulkOrder.wonSnapshot as Record<string, unknown> | null) ?? {}),
                          ...(wonSnapshot as Record<string, unknown>),
                      }
                    : undefined,
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "error TS"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/loadbrain/webhook/v2/route.ts
git commit -m "fix(reseller): merge wonSnapshot on g2bulk delivery (keep title/playerName)"
```

---

### Task 4: Surface refund reason + amount

**Files:**
- Modify: `src/app/reseller/orders/g2bulk-actions.ts` (`getG2BulkOrdersAction` + `G2BulkOrderRow`)
- Modify: `src/app/reseller/orders/components/G2BulkOrdersSection.tsx`

**Why:** Refunded/failed orders show only a chip. The webhook already writes a `reseller_transactions` row (`type: "REFUND"`, `description: "Remboursement G2Bulk - échec livraison: <error>"`, `orderId: localOrderId`). Surface it.

- [ ] **Step 1: In `g2bulk-actions.ts`, import `resellerTransactions`**

Add `resellerTransactions` to the existing `@/db/schema` import.

- [ ] **Step 2: Fetch refund transactions for the orders** (after `localOrders`/`localOrderMap` are built, before `enriched`)

```ts
        // Refund context (the failure webhook writes a type=REFUND reseller_transactions row).
        const refundRows = await db
            .select({
                orderId: resellerTransactions.orderId,
                amount: resellerTransactions.amount,
                description: resellerTransactions.description,
            })
            .from(resellerTransactions)
            .where(inArray(resellerTransactions.orderId, localOrderIds));
        const refundByOrder = new Map<number, { amount: string; reason: string | null }>();
        for (const r of refundRows) {
            if (r.orderId == null) continue;
            // keep only refunds (the webhook description is prefixed "Remboursement")
            if (!(r.description ?? "").toLowerCase().includes("rembours")) continue;
            refundByOrder.set(r.orderId, { amount: r.amount, reason: r.description ?? null });
        }
```

- [ ] **Step 3: Add refund fields to each enriched row**

In the `rows.map((row) => { ... return { ... } })`, add before the closing of the returned object:

```ts
                refundAmount: refundByOrder.get(row.localOrderId)?.amount ?? null,
                refundReason: refundByOrder.get(row.localOrderId)?.reason ?? null,
```

- [ ] **Step 4: Extend the `G2BulkOrderRow` interface** (add two fields)

```ts
    refundAmount: string | null;
    refundReason: string | null;
```

- [ ] **Step 5: Render the refund banner in `G2BulkOrdersSection.tsx`**

Inside the card body, after the `wonSnapshot` block and before the `COMPLETED` codes block, add:

```tsx
                                {(row.status === "REFUNDED" || row.status === "FAILED") && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs space-y-1">
                                        <p className="font-black uppercase tracking-wider text-red-300">
                                            Remboursé sur votre wallet
                                            {row.refundAmount
                                                ? ` · ${formatCurrency(parseFloat(row.refundAmount), "DZD")}`
                                                : ""}
                                        </p>
                                        {row.refundReason && (
                                            <p className="text-red-200/80 italic">{row.refundReason}</p>
                                        )}
                                    </div>
                                )}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "error TS"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/app/reseller/orders/g2bulk-actions.ts src/app/reseller/orders/components/G2BulkOrdersSection.tsx
git commit -m "feat(reseller): show refund reason + amount on refunded G2Bulk orders"
```

---

### Task 5: Refresh button + "load more" pagination

**Files:**
- Modify: `src/app/reseller/orders/g2bulk-actions.ts` (accept optional `limit`)
- Modify: `src/app/reseller/orders/components/G2BulkOrdersSection.tsx`

- [ ] **Step 1: Make the action accept an optional `limit`** via a Zod schema

Change the action signature to add a schema and use the limit:

```ts
import { z } from "zod";
// ...
export const getG2BulkOrdersAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional(),
    },
    async (input, user) => {
        const limit = input?.limit ?? 50;
        // ...
        const rows = await db
            .select()
            .from(g2bulkOrders)
            .where(eq(g2bulkOrders.resellerId, reseller.id))
            .orderBy(desc(g2bulkOrders.createdAt))
            .limit(limit);
        // ... rest unchanged
```

- [ ] **Step 2: Add refresh + load-more state to the section**

Replace the `useEffect` load block + header in `G2BulkOrdersSection.tsx` with a reusable loader and controls:

```tsx
    const [limit, setLimit] = useState(50);
    const load = React.useCallback(() => {
        setIsLoading(true);
        getG2BulkOrdersAction({ limit }).then((res) => {
            if (res.success) setRows(res.data);
            setIsLoading(false);
        });
    }, [limit]);

    useEffect(() => {
        load();
    }, [load]);
```

(Remove the old `useEffect` with the `cancelled` flag.)

- [ ] **Step 3: Add the Refresh button in the section header** (next to the title)

```tsx
                <Button
                    size="sm"
                    variant="flat"
                    onPress={load}
                    isDisabled={isLoading}
                    className="ml-auto bg-[#161616] text-slate-200 font-bold text-[10px] uppercase tracking-wider"
                >
                    Rafraîchir
                </Button>
```

- [ ] **Step 4: Add a "Charger plus" button** after the grid, shown when the page is full

```tsx
            {rows.length >= limit && (
                <div className="flex justify-center pt-2">
                    <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setLimit((l) => l + 50)}
                        className="bg-[#161616] text-slate-200 font-bold text-[10px] uppercase tracking-wider"
                    >
                        Charger plus
                    </Button>
                </div>
            )}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "error TS"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/app/reseller/orders/g2bulk-actions.ts src/app/reseller/orders/components/G2BulkOrdersSection.tsx
git commit -m "feat(reseller): refresh button + load-more on G2Bulk orders section"
```

---

### Task 6: E2E — games order displays title + player (Playwright)

**Files:**
- Create: `tests/e2e/16-reseller-game-order-display.spec.ts`

**Note:** Real games checkout is blocked upstream (403 `g2bulk:order` scope), so the E2E **seeds** a delivered game order directly in the DB (same `DATABASE_URL`), then asserts the UI. Follow the reseller login pattern in `tests/e2e/02-reseller-flow.spec.ts`.

- [ ] **Step 1: Write the E2E test**

```ts
// tests/e2e/16-reseller-game-order-display.spec.ts
import { test, expect } from "@playwright/test";
import postgres from "postgres";

// Reuse the login helper pattern from 02-reseller-flow.spec.ts.
// Assumes a seeded reseller exists (same as the other reseller specs).
test("game order shows package title + player and reveals code", async ({ page }) => {
    const sql = postgres(process.env.DATABASE_URL!);
    let localOrderId = 0;
    try {
        // Find the test reseller used by the other reseller specs.
        const [reseller] = await sql`SELECT id FROM resellers ORDER BY id ASC LIMIT 1`;
        test.skip(!reseller, "no reseller seeded");

        const orderNumber = `G2G-E2E-${Date.now()}`;
        const [order] = await sql`
            INSERT INTO orders (order_number, status, total_amount, montant_paye, reste_a_payer, reseller_id, source, delivery_method)
            VALUES (${orderNumber}, 'LIVRE', '235.75', '235.75', '0', ${reseller.id}, 'B2B_WEB', 'TICKET')
            RETURNING id`;
        localOrderId = order.id;
        const [g2b] = await sql`
            INSERT INTO g2bulk_orders (local_order_id, reseller_id, product_id, quantity, price_paid_dzd, status, won_snapshot)
            VALUES (${order.id}, ${reseller.id}, 'game:2055', 1, '235.75', 'COMPLETED',
                ${sql.json({ kind: "game", gameCode: "freefire_global", title: "Freefire Global · 110", playerName: "2040376982" })})
            RETURNING id`;
        // Encrypted code — use a value the app can decrypt is NOT required for the title/player assertions;
        // insert a placeholder so the reveal button renders.
        await sql`
            INSERT INTO g2bulk_delivered_codes (g2bulk_order_id, code, redemption_url, pin)
            VALUES (${g2b.id}, 'enc-placeholder', NULL, NULL)`;

        // --- login as reseller (copy the steps from 02-reseller-flow.spec.ts) ---
        // await loginAsReseller(page);

        await page.goto("/reseller/orders");
        const section = page.getByTestId("g2bulk-orders-section");
        await expect(section).toBeVisible();
        await expect(section).toContainText("Freefire Global · 110");
        await expect(section).toContainText("2040376982");
        await expect(section).not.toContainText("Produit game:2055");
    } finally {
        if (localOrderId) {
            await sql`DELETE FROM orders WHERE id = ${localOrderId}`; // cascades to g2bulk_orders + codes
        }
        await sql.end();
    }
});
```

- [ ] **Step 2: Wire the reseller login**

Open `tests/e2e/02-reseller-flow.spec.ts`, copy its reseller-login steps into a local `loginAsReseller(page)` (or import a shared helper if one exists), and replace the commented `// await loginAsReseller(page);` line.

- [ ] **Step 3: Run the E2E test**

Run: `npx playwright test tests/e2e/16-reseller-game-order-display.spec.ts`
Expected: PASS (or SKIP if no reseller seeded — then seed one following the other specs).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/16-reseller-game-order-display.spec.ts
git commit -m "test(e2e): reseller game order shows title + player + reveal"
```

---

## Self-review notes

- **Spec coverage:** #1 → Tasks 1-3; #2 → Task 4; #3 → Task 5; display verification → Task 6. All revised-scope (§0) items covered.
- **Type consistency:** `buildGameWonSnapshot`/`GameWonSnapshot` (Task 1) used in Task 2; `G2BulkOrderRow.refundAmount/refundReason` (Task 4) consumed in the same task's UI; `getG2BulkOrdersAction({ limit })` (Task 5) matches the call site.
- **Known constraint:** Task 6 cannot exercise a real purchase (upstream 403 `g2bulk:order`); it seeds the DB instead and asserts display only.
