# P0 — Fondations centralisation streaming LoadBrain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations additives qui font de LoadBrain `modules/netflix` la source de vérité du module « compte partagé », **sans changer le comportement de vente de la boutique** : routes d'allocation autoritatives + émetteur de webhooks (LoadBrain), client + récepteur de webhooks + colonnes de mapping + miroir (boutique), et import initial des données existantes.

**Architecture:** LoadBrain expose des routes internes d'allocation/libération atomiques (FOR UPDATE SKIP LOCKED, idempotentes sur `(site_id, external_order_ref)`) et émet des webhooks signés HMAC. La boutique reçoit ces webhooks pour tenir un miroir local et republier les événements OTP/household sur son event-bus existant ; un client mince (non câblé à la vente en P0) est prêt pour P2. Tout est additif et derrière des flags — la vente boutique reste 100 % inchangée.

**Tech Stack:** TypeScript 5, Next.js 14 (boutique), Fastify + Drizzle ORM + BullMQ + ioredis (LoadBrain `modules/netflix`), Postgres, Vitest, crypto HMAC-SHA256.

**Repos & branches :** Partie A → `C:\Users\PC\Desktop\LoadBrain` branche `feat/bsv-bulletproof-and-listings` (zone chef / A*). Partie B → `c:\Users\PC\Desktop\100-pc-IA` branche `feat/bsv-mirror-integrated` (zone B*). Commits **path-scopés** (`git commit -- <paths>`), jamais `git add .`. Toute touche schéma partagé → ligne `[SYNC-LOADBRAIN]` dans `STATUS.md`.

**Décisions de planification résolues (vérifiées contre le code réel — A0, 2026-06-20) :**
1. **public_token** : `netflix.slots.public_token` = `varchar(40)` unique → accepte le token boutique `varchar(16)`. MAIS le lookup `/n/:token` (`routes/magic-link.ts`) appelle `isValidPublicToken` (`/^[a-f0-9]{30}$/`) AVANT le DB lookup → les tokens boutique (16 char **base64url**, pas hex) seraient rejetés. **Action (Task A1b)** : relâcher `isValidPublicToken` à `/^[A-Za-z0-9_-]{16,40}$/` (accepte les 30-hex LoadBrain existants + les 16-base64url importés).
2. **Pool d'allocation** : pas de colonne variant→compte côté LoadBrain. La boutique résout le compte (`digital_codes` ↔ `lb_account_id`) et passe `accountId` ; LoadBrain reste autorité sur le claim atomique du slot dans ce compte.
3. **Modèle de slot** : `netflix.slots.status` = `varchar(20)` LIBRE (pas de pgEnum, pas de CHECK existant — vérifié A0). Ajouter la valeur `AVAILABLE` ne nécessite **aucune migration de contrainte** : seulement (a) l'index partiel du pool, (b) étendre l'enum Zod du patch dans `routes/internal/slot.ts`, (c) autoriser les transitions `AVAILABLE` dans `slot-lifecycle.service.ts`. Nouvelle fonction `allocateAvailableSlot` qui claim un `AVAILABLE` (≠ `claimOrCreateSlot` qui crée à la vente).

---

## File Structure

### Partie A — LoadBrain (`modules/netflix`)
- **Create** `modules/netflix/src/services/slot-allocation.service.ts` — `allocateAvailableSlot` + `releaseSlot` (claim/release atomiques, idempotents).
- **Modify** `modules/netflix/src/db/schema.ts` — ajout valeur `AVAILABLE` au statut slot (+ index partiel pool).
- **Create** `modules/netflix/src/db/migrations/0007_available_status.sql` — additive.
- **Create** `modules/netflix/src/routes/internal/slot-allocate.ts` — `POST /internal/slot/allocate`, `POST /internal/slot/release`.
- **Modify** `modules/netflix/src/index.ts` — register la nouvelle route + démarre le webhook emitter worker.
- **Create** `modules/netflix/src/workers/webhook-emitter.ts` — queue + worker BullMQ + signature HMAC + log `netflix_webhook_deliveries` (pattern atlaspro/ironmax).
- **Create** `modules/netflix/src/services/emit-webhook.ts` — `emitNetflixWebhook(event, payload, siteId)` (enqueue).
- **Modify** `modules/netflix/scripts/migrate-from-100pcia.ts` — étend l'import aux slots, tokens d'activation, lifecycle.
- **Tests** `modules/netflix/tests/unit/slot-allocation.test.ts`, `modules/netflix/tests/unit/webhook-emitter.test.ts`.

### Partie B — Boutique (`100-pc-IA`)
- **Create** `drizzle/0034_loadbrain_mapping_ids.sql` — additive `lb_account_id` / `lb_slot_id`.
- **Modify** `src/db/schema.ts` — déclare `lbAccountId` / `lbSlotId` (drift drizzle-kit).
- **Create** `src/services/loadbrain-netflix.client.ts` — `allocateSlot` / `releaseSlot` / `getSlot` (mirror du pattern auto-approve, deps-injectable).
- **Create** `src/app/api/loadbrain/netflix/webhook/route.ts` — récepteur signé HMAC + replay + idempotence → miroir + event-bus.
- **Create** `src/lib/loadbrain-netflix-mirror.ts` — `applyNetflixWebhook(db, event)` (logique pure de mise à jour du miroir, testable).
- **Tests** `tests/unit/loadbrain-netflix-client.test.ts`, `tests/unit/loadbrain-netflix-mirror.test.ts`, `tests/unit/loadbrain-netflix-webhook.test.ts`.

---

## PARTIE A — LoadBrain (`modules/netflix`, branche `feat/bsv-bulletproof-and-listings`)

### Task A0: Confirmer les symboles réels (lecture, pas d'édition)

**Files:** lecture seule.

- [ ] **Step 1: Lire les fichiers d'ancrage pour confirmer imports/symboles exacts**

Lire et noter les symboles exacts (le plan ci-dessous suppose ces noms ; corriger si divergent) :
- `modules/netflix/src/db/schema.ts` → l'objet table `netflixSlots`, le nom de l'enum/contrainte de statut, les colonnes `status`, `accountId`, `siteId`, `netflixProfileName`, `externalOrderRef`, `publicToken`, `expiresAt`, `usageCount`.
- `modules/netflix/src/db/client.ts` → la signature de `getDb()`.
- `modules/netflix/src/services/slot-provision.service.ts` → `firstRow()` helper + import de `sql`.
- `modules/netflix/src/routes/internal/slot.ts` → comment `registerInternalSlotRoutes` est exporté + le helper `getPublicBase()`.
- `modules/netflix/src/index.ts` → liste des `register*Routes(app)` + `startAutoApproveWorker` (point d'insertion).
- `modules/netflix/src/db/schema.ts` → colonnes exactes de `netflixWebhookDeliveries` (`siteId`, `event`, `payload`, `signatureSha256`, `deliveryId`, `attempt`, `statusCode`, `responseBody`, `deliveredAt`).
- `modules/atlaspro/src/provision/webhook.queue.ts` + `modules/ironmax/src/provision/provision.webhook.ts` → pattern queue/worker/`signPayload`.
- `modules/netflix/src/routes/magic-link.ts` → confirmer que le lookup `/n/:token` ne passe PAS par `isValidPublicToken` (sinon prévoir relâchement pour tokens importés — décision #1).

Expected: une note de confirmation des symboles. Aucune édition.

---

### Task A1: Statut `AVAILABLE` sur netflix.slots (index + enum app — PAS de contrainte)

**Contexte A0 :** `netflix.slots.status` est un `varchar(20)` LIBRE (pas de pgEnum, pas de CHECK). La colonne accepte déjà `AVAILABLE` sans migration de type. On ajoute seulement l'index partiel du pool + on déclare la valeur côté app (Zod patch enum + transitions lifecycle).

**Files:**
- Create: `modules/netflix/src/db/migrations/0007_slots_pool_index.sql`
- Modify: `modules/netflix/src/db/schema.ts` (déclarer l'index pour drizzle-kit)
- Modify: `modules/netflix/src/routes/internal/slot.ts` (Zod patch enum — autoriser `AVAILABLE` si pertinent pour les transitions release)
- Modify: `modules/netflix/src/services/slot-lifecycle.service.ts` (autoriser transitions vers/depuis `AVAILABLE`)

- [ ] **Step 1: Écrire la migration index-only**

Create `modules/netflix/src/db/migrations/0007_slots_pool_index.sql` :
```sql
-- 0007 — Partial pool index for pre-existing imported AVAILABLE slots.
--
-- The 100-pc-IA boutique pre-creates profile slots (Profil 1..N) in a
-- DISPONIBLE state and allocates one at sale. To mirror that inventory and
-- let LoadBrain be the allocation authority, imported slots live in an
-- AVAILABLE state. `status` is a free varchar(20) (no enum/CHECK), so no
-- type change is needed — only this partial index to make the atomic pool
-- pick (FOR UPDATE SKIP LOCKED WHERE status='AVAILABLE') fast.
--
-- Idempotent: safe to re-apply.

CREATE INDEX IF NOT EXISTS netflix_slots_pool_idx
    ON netflix.slots (account_id, site_id, created_at)
    WHERE status = 'AVAILABLE';
```

- [ ] **Step 2: Déclarer l'index + la valeur AVAILABLE côté app**

Dans `modules/netflix/src/db/schema.ts`, déclarer `netflix_slots_pool_idx` dans le bloc d'index de `netflixSlots` (pour que drizzle-kit ne le drop pas). Si une union TS / liste de statuts existe pour `status`, y ajouter `"AVAILABLE"`. Dans `modules/netflix/src/routes/internal/slot.ts`, si le `patchBodySchema.status` enum (`z.enum(["CANCELLED","REFUNDED","RECLAIMED"])`) doit accepter un retour explicite à `AVAILABLE` (release), l'ajouter ; sinon laisser tel quel (la release passe par `releaseSlot` en A2, pas par ce patch). Dans `slot-lifecycle.service.ts`, autoriser la transition `ACTIVE → AVAILABLE` si la machine d'états la valide explicitement.

- [ ] **Step 3: Appliquer la migration sur la DB locale LoadBrain**

Run: `psql "$DATABASE_URL" -f modules/netflix/src/db/migrations/0007_slots_pool_index.sql`
Expected: `CREATE INDEX` sans erreur ; re-run = no-op (idempotent).

- [ ] **Step 4: Type-check + commit**

Run: `cd modules/netflix && pnpm exec tsc --noEmit` (0 erreur), puis :
```bash
git commit -- modules/netflix/src/db/schema.ts modules/netflix/src/db/migrations/0007_slots_pool_index.sql modules/netflix/src/routes/internal/slot.ts modules/netflix/src/services/slot-lifecycle.service.ts -m "feat(netflix): AVAILABLE pool index + app status value (no type migration — status is free varchar)"
```

---

### Task A1b: Relâcher `isValidPublicToken` pour les tokens importés (base64url)

**Contexte A0 :** `routes/magic-link.ts` rejette tout token ≠ `/^[a-f0-9]{30}$/` avant le DB lookup. Les tokens boutique sont 16-char base64url → rejetés. On relâche le validateur.

**Files:**
- Modify: `modules/netflix/src/lib/token.ts`
- Test: `modules/netflix/tests/unit/token.test.ts`

- [ ] **Step 1: Test (échoue)**

Create/append `modules/netflix/tests/unit/token.test.ts` :
```typescript
import { describe, it, expect } from "vitest";
import { isValidPublicToken, generatePublicToken } from "../../src/lib/token";

describe("isValidPublicToken", () => {
  it("accepts native 30-hex tokens", () => {
    expect(isValidPublicToken(generatePublicToken())).toBe(true);
  });
  it("accepts imported 16-char base64url boutique tokens", () => {
    expect(isValidPublicToken("aB3-_xY9zQ1w2E4r")).toBe(true); // 16 chars, base64url alphabet
  });
  it("rejects too-short / illegal chars", () => {
    expect(isValidPublicToken("short")).toBe(false);
    expect(isValidPublicToken("has space here!!")).toBe(false);
    expect(isValidPublicToken(123 as unknown as string)).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer → échoue** (la regex hex rejette le base64url)

Run: `cd modules/netflix && pnpm vitest run tests/unit/token.test.ts`
Expected: FAIL sur le cas base64url.

- [ ] **Step 3: Relâcher la regex**

Dans `modules/netflix/src/lib/token.ts`, remplacer la ligne du validateur :
```typescript
// avant: return typeof value === "string" && /^[a-f0-9]{30}$/.test(value);
return typeof value === "string" && /^[A-Za-z0-9_-]{16,40}$/.test(value);
```
(`generatePublicToken` reste inchangé : 30-hex.)

- [ ] **Step 4: Lancer → passe**

Run: `cd modules/netflix && pnpm vitest run tests/unit/token.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git commit -- modules/netflix/src/lib/token.ts modules/netflix/tests/unit/token.test.ts -m "fix(netflix): accept imported 16-char base64url tokens in isValidPublicToken"
```

---

### Task A2: Service d'allocation/libération atomique

**Files:**
- Create: `modules/netflix/src/services/slot-allocation.service.ts`
- Test: `modules/netflix/tests/unit/slot-allocation.test.ts`

- [ ] **Step 1: Écrire le test d'idempotence + anti-double-vente (échoue)**

Create `modules/netflix/tests/unit/slot-allocation.test.ts` :
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { allocateAvailableSlot, releaseSlot } from "../../src/services/slot-allocation.service";
import { makeTestDb, seedAccountWithSlots } from "../helpers/db"; // helper existant ou à créer (voir Step 3)

describe("slot-allocation", () => {
  let db: any;
  let accountId: string;
  const siteId = "11111111-1111-1111-1111-111111111111";

  beforeEach(async () => {
    db = await makeTestDb();
    accountId = await seedAccountWithSlots(db, { siteId, available: 1 }); // 1 seul slot AVAILABLE
  });

  it("idempotent: same (siteId, externalOrderRef) returns the SAME slot", async () => {
    const a = await allocateAvailableSlot(db, { siteId, accountId, externalOrderRef: "ord-1", customerPhone: "+213700000000", expiresAt: new Date(Date.now() + 86400000) });
    const b = await allocateAvailableSlot(db, { siteId, accountId, externalOrderRef: "ord-1", customerPhone: "+213700000000", expiresAt: new Date(Date.now() + 86400000) });
    expect(b.slotId).toBe(a.slotId);
    expect(b.reused).toBe(true);
  });

  it("anti-double-sell: concurrent allocations on the LAST slot → exactly one succeeds", async () => {
    const results = await Promise.allSettled([
      allocateAvailableSlot(db, { siteId, accountId, externalOrderRef: "ord-A", customerPhone: "+213700000001", expiresAt: new Date(Date.now() + 86400000) }),
      allocateAvailableSlot(db, { siteId, accountId, externalOrderRef: "ord-B", customerPhone: "+213700000002", expiresAt: new Date(Date.now() + 86400000) }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason.code).toBe("OUT_OF_STOCK");
  });

  it("release returns the slot to AVAILABLE (idempotent)", async () => {
    const a = await allocateAvailableSlot(db, { siteId, accountId, externalOrderRef: "ord-1", customerPhone: "+213700000000", expiresAt: new Date(Date.now() + 86400000) });
    const r1 = await releaseSlot(db, { siteId, externalOrderRef: "ord-1", reason: "refund" });
    const r2 = await releaseSlot(db, { siteId, externalOrderRef: "ord-1", reason: "refund" });
    expect(r1.released).toBe(true);
    expect(r2.released).toBe(false); // already released = no-op
  });
});
```

- [ ] **Step 2: Lancer le test → échoue (module introuvable)**

Run: `cd modules/netflix && pnpm vitest run tests/unit/slot-allocation.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/slot-allocation.service'`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Create `modules/netflix/src/services/slot-allocation.service.ts` :
```typescript
import { sql } from "drizzle-orm";
import type { getDb } from "../db/client";

export interface AllocateInput {
  siteId: string;
  accountId: string;
  externalOrderRef: string;
  customerPhone: string;
  customerName?: string | null;
  customerEmail?: string | null;
  expiresAt: Date;
  maxUses?: number | null;
}
export interface AllocateResult {
  slotId: string;
  publicToken: string;
  netflixProfileName: string;
  expiresAt: Date;
  reused: boolean;
}
export class AllocationError extends Error {
  constructor(public code: "OUT_OF_STOCK" | "ACCOUNT_NOT_FOUND", message: string) {
    super(message);
  }
}

type Db = ReturnType<typeof getDb>;

/** Claim one AVAILABLE slot in `accountId` atomically. Idempotent on (site_id, external_order_ref). */
export async function allocateAvailableSlot(db: Db, input: AllocateInput): Promise<AllocateResult> {
  return db.transaction(async (tx: any) => {
    // 1) Idempotency: a slot already allocated for this order ref?
    const existing = await tx.execute(sql`
      SELECT id, public_token, netflix_profile_name, expires_at
        FROM netflix.slots
       WHERE site_id = ${input.siteId}
         AND external_order_ref = ${input.externalOrderRef}
       LIMIT 1
    `);
    const ex = firstRow(existing);
    if (ex) {
      return { slotId: ex.id, publicToken: ex.public_token, netflixProfileName: ex.netflix_profile_name, expiresAt: ex.expires_at, reused: true };
    }

    // 2) Atomically claim one AVAILABLE slot in the account pool.
    const claimed = await tx.execute(sql`
      WITH picked AS (
        SELECT id FROM netflix.slots
         WHERE account_id = ${input.accountId} AND site_id = ${input.siteId}
           AND status = 'AVAILABLE'
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      UPDATE netflix.slots s
         SET status = 'ACTIVE',
             external_order_ref = ${input.externalOrderRef},
             customer_phone = ${input.customerPhone},
             customer_name = ${input.customerName ?? null},
             customer_email = ${input.customerEmail ?? null},
             expires_at = ${input.expiresAt},
             max_uses = ${input.maxUses ?? null},
             sold_at = now(),
             updated_at = now()
        FROM picked
       WHERE s.id = picked.id
      RETURNING s.id, s.public_token, s.netflix_profile_name, s.expires_at
    `);
    const row = firstRow(claimed);
    if (!row) {
      throw new AllocationError("OUT_OF_STOCK", `No AVAILABLE slot in account ${input.accountId}`);
    }
    return { slotId: row.id, publicToken: row.public_token, netflixProfileName: row.netflix_profile_name, expiresAt: row.expires_at, reused: false };
  });
}

export interface ReleaseInput { siteId: string; externalOrderRef: string; reason?: string }
export async function releaseSlot(db: Db, input: ReleaseInput): Promise<{ released: boolean; slotId?: string }> {
  const res = await db.execute(sql`
    UPDATE netflix.slots
       SET status = 'AVAILABLE',
           external_order_ref = NULL,
           customer_phone = NULL, customer_name = NULL, customer_email = NULL,
           cancellation_reason = ${input.reason ?? "released"},
           reclaimed_at = now(), needs_profile_reset = true, updated_at = now()
     WHERE site_id = ${input.siteId}
       AND external_order_ref = ${input.externalOrderRef}
       AND status = 'ACTIVE'
    RETURNING id
  `);
  const row = firstRow(res);
  return row ? { released: true, slotId: row.id } : { released: false };
}

// Mirror of slot-provision.service.ts firstRow() — confirm exact shape in A0.
function firstRow(result: any): any | null {
  const rows = Array.isArray(result) ? result : result?.rows ?? [];
  return rows.length > 0 ? rows[0] : null;
}
```

Note A0 : si `tests/helpers/db` n'existe pas, créer un helper minimal qui ouvre une transaction sur une DB de test Postgres (suivre `vitest.config.ts` du module) et `seedAccountWithSlots` qui insère 1 `netflix.accounts` + N `netflix.slots` en `AVAILABLE`. Si le module n'a pas de DB de test, encapsuler ces 3 tests derrière une garde `describe.skipIf(!process.env.TEST_DATABASE_URL)` et fournir le helper qui se connecte à `TEST_DATABASE_URL`.

- [ ] **Step 4: Lancer le test → passe**

Run: `cd modules/netflix && TEST_DATABASE_URL=... pnpm vitest run tests/unit/slot-allocation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git commit -- modules/netflix/src/services/slot-allocation.service.ts modules/netflix/tests/unit/slot-allocation.test.ts -m "feat(netflix): atomic allocateAvailableSlot + releaseSlot (idempotent, anti-double-sell)"
```

---

### Task A3: Routes internes allocate/release

**Files:**
- Create: `modules/netflix/src/routes/internal/slot-allocate.ts`
- Modify: `modules/netflix/src/index.ts`

- [ ] **Step 1: Écrire la route**

Create `modules/netflix/src/routes/internal/slot-allocate.ts` (calque la structure de `routes/internal/slot.ts` confirmée en A0) :
```typescript
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client";
import { allocateAvailableSlot, releaseSlot, AllocationError } from "../../services/slot-allocation.service";

// A0: getPublicBase() is a PRIVATE helper in routes/internal/slot.ts (not exported).
// Inline the same logic instead of importing it.
const getPublicBase = (): string => process.env.NETFLIX_PUBLIC_BASE ?? "http://localhost:3012";

const allocateSchema = z.object({
  siteId: z.string().uuid(),
  accountId: z.string().uuid(),
  externalOrderRef: z.string().min(1).max(255),
  customerPhone: z.string().regex(/^\+?\d{8,20}$/),
  customerName: z.string().max(200).optional(),
  customerEmail: z.string().email().max(320).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
  maxUses: z.number().int().positive().optional(),
});
const releaseSchema = z.object({
  siteId: z.string().uuid(),
  externalOrderRef: z.string().min(1).max(255),
  reason: z.string().max(1000).optional(),
});

export async function registerInternalSlotAllocateRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.post("/internal/slot/allocate", async (req, reply) => {
    const parsed = allocateSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: "validation", issues: parsed.error.flatten() }; }
    const b = parsed.data;
    try {
      const result = await allocateAvailableSlot(db, {
        siteId: b.siteId, accountId: b.accountId, externalOrderRef: b.externalOrderRef,
        customerPhone: b.customerPhone, customerName: b.customerName ?? null, customerEmail: b.customerEmail ?? null,
        expiresAt: new Date(Date.now() + (b.expiresInDays ?? 45) * 86400000), maxUses: b.maxUses ?? null,
      });
      reply.code(result.reused ? 200 : 201);
      return {
        slotId: result.slotId, publicToken: result.publicToken,
        magicLink: `${getPublicBase()}/n/${result.publicToken}`,
        netflixProfileName: result.netflixProfileName, expiresAt: result.expiresAt, reused: result.reused,
      };
    } catch (err) {
      if (err instanceof AllocationError && err.code === "OUT_OF_STOCK") { reply.code(409); return { error: "out_of_stock" }; }
      throw err;
    }
  });

  app.post("/internal/slot/release", async (req, reply) => {
    const parsed = releaseSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: "validation", issues: parsed.error.flatten() }; }
    const r = await releaseSlot(db, parsed.data);
    reply.code(200);
    return { released: r.released, slotId: r.slotId ?? null };
  });
}
```

- [ ] **Step 2: Enregistrer la route dans index.ts**

Dans `modules/netflix/src/index.ts`, à côté de `await registerInternalSlotRoutes(app);`, ajouter :
```typescript
import { registerInternalSlotAllocateRoutes } from "./routes/internal/slot-allocate";
// ... dans main(), après registerInternalSlotRoutes(app):
await registerInternalSlotAllocateRoutes(app);
```

- [ ] **Step 3: Type-check**

Run: `cd modules/netflix && pnpm exec tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Smoke local (route répond)**

Run le module (`pnpm dev` ou équivalent), puis :
```bash
curl -s -XPOST localhost:3015/internal/slot/allocate -H "Content-Type: application/json" \
  -d '{"siteId":"<uuid>","accountId":"<uuid>","externalOrderRef":"smoke-1","customerPhone":"+213700000000"}'
```
Expected: 201 + `{ slotId, publicToken, magicLink, ... }` (ou 409 `out_of_stock` si pool vide).

- [ ] **Step 5: Commit**

```bash
git commit -- modules/netflix/src/routes/internal/slot-allocate.ts modules/netflix/src/index.ts -m "feat(netflix): internal allocate/release slot routes"
```

---

### Task A4: Émetteur de webhooks signés (queue + worker + log)

**Files:**
- Create: `modules/netflix/src/services/emit-webhook.ts`
- Create: `modules/netflix/src/workers/webhook-emitter.ts`
- Modify: `modules/netflix/src/index.ts`
- Test: `modules/netflix/tests/unit/webhook-emitter.test.ts`

- [ ] **Step 1: Test de signature HMAC (échoue)**

Create `modules/netflix/tests/unit/webhook-emitter.test.ts` :
```typescript
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { signNetflixWebhook } from "../../src/workers/webhook-emitter";

describe("netflix webhook signing", () => {
  it("produces sha256=<hmac of `${ts}.${body}`>", () => {
    const secret = "test-secret";
    const ts = 1700000000;
    const body = JSON.stringify({ event: "slot.allocated", slotId: "abc" });
    const sig = signNetflixWebhook(secret, ts, body);
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    expect(sig).toBe(expected);
  });
});
```

- [ ] **Step 2: Lancer → échoue**

Run: `cd modules/netflix && pnpm vitest run tests/unit/webhook-emitter.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter l'émetteur (pattern atlaspro/ironmax confirmé en A0)**

Create `modules/netflix/src/workers/webhook-emitter.ts` :
```typescript
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import crypto from "crypto";
import { getDb } from "../db/client";
import { netflixWebhookDeliveries } from "../db/schema"; // nom confirmé en A0

export const NETFLIX_WEBHOOK_QUEUE = "netflix-webhook";
export interface NetflixWebhookJob {
  deliveryId: string;        // uuid client-side dedup key
  siteId: string;
  event: string;             // slot.allocated | slot.released | slot.expired | account.updated | code.captured
  webhookUrl: string;
  webhookSecret: string;
  payload: Record<string, unknown>;
  attempt: number;           // 1-indexed
  maxAttempts: number;
}

export function signNetflixWebhook(secret: string, timestamp: number, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

const backoffMs = (attempt: number) => (attempt <= 1 ? 0 : 5_000 * Math.pow(3, attempt - 2));

export function createNetflixWebhookQueue(redisUrl: string): Queue<NetflixWebhookJob> {
  return new Queue<NetflixWebhookJob>(NETFLIX_WEBHOOK_QUEUE, { connection: new IORedis(redisUrl, { maxRetriesPerRequest: null }) });
}

export async function enqueueNetflixWebhook(queue: Queue<NetflixWebhookJob>, job: NetflixWebhookJob): Promise<void> {
  const jobId = `${job.deliveryId}:${job.attempt}`;
  try { await queue.remove(jobId); } catch { /* ignore */ }
  await queue.add("deliver", job, { jobId, delay: backoffMs(job.attempt), removeOnComplete: true, removeOnFail: false });
}

async function deliverOnce(job: NetflixWebhookJob): Promise<boolean> {
  const body = JSON.stringify(job.payload);
  const ts = Math.floor(Date.now() / 1000);
  const sig = signNetflixWebhook(job.webhookSecret, ts, body);
  const bodySha = crypto.createHash("sha256").update(body).digest("hex");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let statusCode = 0; let responseBody = ""; let ok = false;
  try {
    const res = await fetch(job.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "LoadBrain-Netflix-Webhook/1.0",
        "X-LoadBrain-Signature": sig,
        "X-LoadBrain-Timestamp": String(ts),
        "X-LoadBrain-Delivery-Id": job.deliveryId,
        "X-LoadBrain-Event": job.event,
        "X-LoadBrain-Body-SHA256": bodySha,
      },
      body, signal: controller.signal,
    });
    statusCode = res.status; responseBody = (await res.text()).slice(0, 2000);
    ok = res.status >= 200 && res.status < 300;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : String(err);
  } finally { clearTimeout(timer); }

  await getDb().insert(netflixWebhookDeliveries).values({
    siteId: job.siteId, event: job.event, payload: job.payload as any,
    signatureSha256: sig, deliveryId: job.deliveryId, attempt: job.attempt,
    statusCode: statusCode || null, responseBody: responseBody || null,
    deliveredAt: ok ? new Date() : null,
  });
  return ok;
}

export function startNetflixWebhookWorker(redisUrl: string, queue: Queue<NetflixWebhookJob>): Worker<NetflixWebhookJob> {
  return new Worker<NetflixWebhookJob>(NETFLIX_WEBHOOK_QUEUE, async (jobWrap) => {
    const job = jobWrap.data;
    const ok = await deliverOnce(job);
    if (ok || job.attempt >= job.maxAttempts) return;
    await enqueueNetflixWebhook(queue, { ...job, attempt: job.attempt + 1 });
  }, { connection: new IORedis(redisUrl, { maxRetriesPerRequest: null }), concurrency: 4 });
}
```

Create `modules/netflix/src/services/emit-webhook.ts` :
```typescript
import { randomUUID } from "crypto";
import { createNetflixWebhookQueue, enqueueNetflixWebhook } from "../workers/webhook-emitter";

let queue: ReturnType<typeof createNetflixWebhookQueue> | null = null;
function getQueue() {
  if (!queue) queue = createNetflixWebhookQueue(process.env.REDIS_URL ?? "redis://localhost:6379");
  return queue;
}

/** Resolve the boutique site's webhook URL+secret. P0: single AGENT007 site from env. */
function resolveSiteWebhook(siteId: string): { url: string; secret: string } | null {
  const url = process.env.NETFLIX_WEBHOOK_URL_AGENT007;       // e.g. https://boutique.../api/loadbrain/netflix/webhook
  const secret = process.env.NETFLIX_WEBHOOK_SECRET_AGENT007; // shared with boutique LOADBRAIN_WEBHOOK_SECRET
  if (!url || !secret) return null;
  return { url, secret };
}

export async function emitNetflixWebhook(event: string, payload: Record<string, unknown>, siteId: string): Promise<void> {
  const wh = resolveSiteWebhook(siteId);
  if (!wh) return; // not configured → no-op (P0 safe)
  await enqueueNetflixWebhook(getQueue(), {
    deliveryId: randomUUID(), siteId, event, webhookUrl: wh.url, webhookSecret: wh.secret,
    payload, attempt: 1, maxAttempts: 4,
  });
}
```

- [ ] **Step 4: Démarrer le worker au boot**

Dans `modules/netflix/src/index.ts`, après `startAutoApproveWorker(...)` :
```typescript
import { createNetflixWebhookQueue, startNetflixWebhookWorker } from "./workers/webhook-emitter";
// ... dans main():
const whQueue = createNetflixWebhookQueue(process.env.REDIS_URL ?? "redis://localhost:6379");
startNetflixWebhookWorker(process.env.REDIS_URL ?? "redis://localhost:6379", whQueue);
```

- [ ] **Step 5: Câbler l'émission sur allocate/release/code (appels emitNetflixWebhook)**

Dans `slot-allocation.service.ts` (après commit de la tx allocate/release) et dans le chemin de capture de code (mailbox worker / persistEvent — repérer en A0), appeler `await emitNetflixWebhook("slot.allocated"|"slot.released"|"code.captured", payload, siteId)`. Garder l'appel **fire-and-forget gardé** (`.catch(() => {})`) pour ne jamais casser l'allocation si Redis est down.

- [ ] **Step 6: Lancer le test signature → passe + type-check**

Run: `cd modules/netflix && pnpm vitest run tests/unit/webhook-emitter.test.ts && pnpm exec tsc --noEmit`
Expected: PASS + 0 erreur.

- [ ] **Step 7: Commit**

```bash
git commit -- modules/netflix/src/workers/webhook-emitter.ts modules/netflix/src/services/emit-webhook.ts modules/netflix/src/services/slot-allocation.service.ts modules/netflix/src/index.ts modules/netflix/tests/unit/webhook-emitter.test.ts -m "feat(netflix): signed outbound webhook emitter (queue+worker+delivery log)"
```

---

### Task A5: Étendre l'import (slots + tokens + lifecycle)

**Files:**
- Modify: `modules/netflix/scripts/migrate-from-100pcia.ts`

- [ ] **Step 1: Ajouter l'import des slots + tokens + lifecycle**

Étendre `main()` après l'import des comptes existant. Pour chaque compte importé (mapping `ms_account_email` → `netflix.accounts.id`), lire les slots boutique liés et les insérer en `AVAILABLE`/`ACTIVE` selon leur statut, en **préservant le token** :
```typescript
// --- SLOTS + TOKENS ---
interface SourceSlot {
  slot_id: number; profile_name: string | null; status: string;
  expires_at: Date | null; token: string | null; valid_until: Date | null;
  ms_account_email: string; // join key back to the account
}
const slotRows = await src<SourceSlot[]>`
  SELECT dcs.id AS slot_id, dcs.profile_name, dcs.status, dcs.expires_at,
         sat.token, sat.valid_until, dc.ms_account_email
    FROM digital_code_slots dcs
    JOIN digital_codes dc ON dc.id = dcs.digital_code_id
    LEFT JOIN slot_activation_tokens sat ON sat.slot_id = dcs.id
   WHERE dc.ms_account_email IS NOT NULL
`;
for (const s of slotRows) {
  const acc = await dst<{ id: string }[]>`
    SELECT id FROM netflix.accounts WHERE site_id = ${args.siteId} AND ms_account_email = ${s.ms_account_email} LIMIT 1`;
  if (acc.length === 0) continue;
  const accountId = acc[0]!.id;
  const status = s.status === "DISPONIBLE" ? "AVAILABLE" : s.status === "VENDU" ? "ACTIVE" : "AVAILABLE";
  const publicToken = s.token ?? null; // 16-char boutique token preserved verbatim (decision #1)
  if (!publicToken) continue; // skip slots without an activation token in P0
  // Idempotent on (site_id, public_token) — re-run = no-op
  const exists = await dst<{ id: string }[]>`SELECT id FROM netflix.slots WHERE public_token = ${publicToken} LIMIT 1`;
  if (exists.length > 0) { skippedSlots++; continue; }
  if (!args.dryRun) {
    await dst`
      INSERT INTO netflix.slots
            (account_id, site_id, netflix_profile_name, netflix_profile_name_normalized,
             public_token, status, expires_at, external_order_ref, created_at, updated_at)
      VALUES (${accountId}, ${args.siteId}, ${s.profile_name ?? "Profil"},
              ${(s.profile_name ?? "profil").toLowerCase().trim()},
              ${publicToken}, ${status}, ${s.valid_until ?? s.expires_at}, ${`100pcia-slot-${s.slot_id}`}, now(), now())`;
  }
  insertedSlots++;
}
console.log(`[migrate] slots inserted=${insertedSlots} skipped=${skippedSlots}`);
```
Note: `external_order_ref = 100pcia-slot-<id>` donne une clé de corrélation stable pour les slots importés (réconciliable côté boutique via `lb_slot_id` en P0/B-side). Ajuster les noms de colonnes exacts après A0 (`netflix_profile_name_normalized` peut exiger la lib `normalize`).

- [ ] **Step 2: Dry-run sur données réelles**

Run: `cd modules/netflix && DATABASE_URL=<loadbrain> tsx scripts/migrate-from-100pcia.ts --site-id <AGENT007-uuid> --source-db <100pcia-db> --dry-run`
Expected: logs `slots inserted=N skipped=0` cohérents avec le nombre de slots boutique ; aucune écriture.

- [ ] **Step 3: Apply + re-run (idempotence)**

Run la même commande sans `--dry-run`, puis une 2ᵉ fois.
Expected: 1ʳᵉ passe insère ; 2ᵉ passe `inserted=0 skipped=N` (idempotent).

- [ ] **Step 4: Commit**

```bash
git commit -- modules/netflix/scripts/migrate-from-100pcia.ts -m "feat(netflix): extend import to slots + activation tokens + lifecycle (idempotent)"
```

---

## PARTIE B — Boutique (`100-pc-IA`, branche `feat/bsv-mirror-integrated`)

### Task B1: Colonnes de mapping LoadBrain (migration additive)

**Files:**
- Create: `drizzle/0034_loadbrain_mapping_ids.sql`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Écrire la migration additive**

Create `drizzle/0034_loadbrain_mapping_ids.sql` :
```sql
-- 0034 — Mirror mapping: LoadBrain account/slot UUIDs on boutique tables.
--
-- Additive only. Lets the boutique correlate its mirror rows with the
-- LoadBrain system-of-record (netflix.accounts / netflix.slots) without
-- changing any existing read/write path. NULL until backfilled by import
-- or set by webhook/allocate (later phases).
--
-- Idempotent: safe to apply on prod.

ALTER TABLE digital_codes
    ADD COLUMN IF NOT EXISTS lb_account_id TEXT;
CREATE INDEX IF NOT EXISTS dc_lb_account_id_idx
    ON digital_codes (lb_account_id) WHERE lb_account_id IS NOT NULL;

ALTER TABLE digital_code_slots
    ADD COLUMN IF NOT EXISTS lb_slot_id TEXT;
CREATE INDEX IF NOT EXISTS dcs_lb_slot_id_idx
    ON digital_code_slots (lb_slot_id) WHERE lb_slot_id IS NOT NULL;
```

- [ ] **Step 2: Déclarer les colonnes dans schema.ts**

Dans `src/db/schema.ts`, ajouter à `digitalCodes` (après `hasExtraMember`) :
```typescript
    lbAccountId: text("lb_account_id"),
```
et à `digitalCodeSlots` (après `lastCodeRequestAt`) :
```typescript
    lbSlotId: text("lb_slot_id"),
```
Ajouter aussi les index correspondants dans les blocs d'index respectifs :
```typescript
        lbAccountIdIdx: index("dc_lb_account_id_idx").on(table.lbAccountId),   // dans digitalCodes
        lbSlotIdIdx: index("dcs_lb_slot_id_idx").on(table.lbSlotId),           // dans digitalCodeSlots
```

- [ ] **Step 3: Appliquer la migration en local + type-check**

Run: `psql "$DATABASE_URL" -f drizzle/0034_loadbrain_mapping_ids.sql && pnpm exec tsc --noEmit`
Expected: colonnes créées (re-run no-op) ; 0 erreur tsc.

- [ ] **Step 4: Commit + SYNC note**

```bash
git commit -- drizzle/0034_loadbrain_mapping_ids.sql src/db/schema.ts -m "feat(streaming): lb_account_id/lb_slot_id mirror mapping columns (additive)"
```
Append dans `STATUS.md` : `[YYYY-MM-DD HH:MM] B-streaming SYNC-LOADBRAIN colonnes mapping lb_account_id/lb_slot_id ajoutées (additif, no behavior change).`

---

### Task B2: Client LoadBrain netflix (allocate/release/getSlot)

**Files:**
- Create: `src/services/loadbrain-netflix.client.ts`
- Test: `tests/unit/loadbrain-netflix-client.test.ts`

- [ ] **Step 1: Test du client (échoue)**

Create `tests/unit/loadbrain-netflix-client.test.ts` :
```typescript
import { describe, it, expect, vi } from "vitest";
import { allocateSlot, releaseSlot } from "@/services/loadbrain-netflix.client";

const env = { LOADBRAIN_URL: "https://lb.test", LOADBRAIN_INTERNAL_TOKEN: "tok" };
beforeEach(() => { Object.assign(process.env, env); });

describe("loadbrain-netflix.client", () => {
  it("allocateSlot posts to /internal/slot/allocate with internal token and returns parsed slot", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slotId: "s1", publicToken: "abc", magicLink: "https://lb.test/n/abc", reused: false }), { status: 201 }));
    const res = await allocateSlot({ siteId: "site", accountId: "acc", externalOrderRef: "ord-1", customerPhone: "+213700000000" }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("https://lb.test/internal/slot/allocate", expect.objectContaining({ method: "POST" }));
    const headers = (fetchFn.mock.calls[0][1] as any).headers;
    expect(headers["X-Internal-Token"]).toBe("tok");
    expect(res).toMatchObject({ slotId: "s1", publicToken: "abc", reused: false });
  });

  it("allocateSlot throws LbUnavailable on network error (no double-sell, caller fails closed)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(allocateSlot({ siteId: "site", accountId: "acc", externalOrderRef: "ord-1", customerPhone: "+213700000000" }, { fetchFn })).rejects.toMatchObject({ code: "LB_UNAVAILABLE" });
  });

  it("allocateSlot throws OutOfStock on 409", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "out_of_stock" }), { status: 409 }));
    await expect(allocateSlot({ siteId: "site", accountId: "acc", externalOrderRef: "ord-1", customerPhone: "+213700000000" }, { fetchFn })).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
  });

  it("releaseSlot posts to /internal/slot/release", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ released: true, slotId: "s1" }), { status: 200 }));
    const res = await releaseSlot({ siteId: "site", externalOrderRef: "ord-1", reason: "refund" }, { fetchFn });
    expect(res.released).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer → échoue**

Run: `pnpm exec vitest run tests/unit/loadbrain-netflix-client.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le client (calque loadbrain-auto-approve.client.ts)**

Create `src/services/loadbrain-netflix.client.ts` :
```typescript
import { logger } from "@/lib/logger";

export interface AllocateSlotInput {
  siteId: string; accountId: string; externalOrderRef: string;
  customerPhone: string; customerName?: string; customerEmail?: string;
  expiresInDays?: number; maxUses?: number;
}
export interface AllocateSlotResult { slotId: string; publicToken: string; magicLink: string; netflixProfileName?: string; expiresAt?: string; reused: boolean }
export interface ReleaseSlotInput { siteId: string; externalOrderRef: string; reason?: string }
export interface LbClientDeps { fetchFn?: typeof fetch; timeoutMs?: number }

export class LbNetflixError extends Error {
  constructor(public code: "LB_UNAVAILABLE" | "OUT_OF_STOCK" | "BAD_REQUEST" | "LB_ERROR", message: string) { super(message); }
}

function headers(): Record<string, string> {
  const apiKey = process.env.LOADBRAIN_API_KEY;
  const internalToken = process.env.LOADBRAIN_INTERNAL_TOKEN;
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
    ...(internalToken ? { "X-Internal-Token": internalToken } : {}),
  };
}

async function call<T>(path: string, body: unknown, deps: LbClientDeps): Promise<T> {
  const base = process.env.LOADBRAIN_URL;
  if (!base) throw new LbNetflixError("LB_UNAVAILABLE", "LOADBRAIN_URL unset");
  const fetchFn = deps.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
  try {
    const res = await fetchFn(`${base}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: controller.signal });
    if (res.status === 409) throw new LbNetflixError("OUT_OF_STOCK", "no available slot");
    if (res.status === 400) throw new LbNetflixError("BAD_REQUEST", "validation");
    if (!res.ok) throw new LbNetflixError("LB_ERROR", `HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof LbNetflixError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[LbNetflix] call failed", { action: "loadbrain.netflix.call_failed", metadata: { path, error: msg } });
    throw new LbNetflixError("LB_UNAVAILABLE", msg);
  } finally { clearTimeout(timer); }
}

export async function allocateSlot(input: AllocateSlotInput, deps: LbClientDeps = {}): Promise<AllocateSlotResult> {
  return call<AllocateSlotResult>("/internal/slot/allocate", input, deps);
}
export async function releaseSlot(input: ReleaseSlotInput, deps: LbClientDeps = {}): Promise<{ released: boolean; slotId?: string }> {
  return call<{ released: boolean; slotId?: string }>("/internal/slot/release", input, deps);
}
```

- [ ] **Step 4: Lancer → passe**

Run: `pnpm exec vitest run tests/unit/loadbrain-netflix-client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git commit -- src/services/loadbrain-netflix.client.ts tests/unit/loadbrain-netflix-client.test.ts -m "feat(streaming): LoadBrain netflix client (allocate/release, fail-closed) — not yet wired to sale"
```

---

### Task B3: Logique pure de mise à jour du miroir

**Files:**
- Create: `src/lib/loadbrain-netflix-mirror.ts`
- Test: `tests/unit/loadbrain-netflix-mirror.test.ts`

- [ ] **Step 1: Test (échoue)**

Create `tests/unit/loadbrain-netflix-mirror.test.ts` :
```typescript
import { describe, it, expect, vi } from "vitest";
import { applyNetflixWebhook } from "@/lib/loadbrain-netflix-mirror";

function fakeDb() {
  const calls: any[] = [];
  const db = {
    calls,
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => { calls.push("update"); return [{ id: 1 }]; }) })) })),
    query: { slotActivationTokens: { findFirst: vi.fn(async () => ({ slotId: 42 })) } },
  };
  return db as any;
}

describe("applyNetflixWebhook", () => {
  it("slot.released flips the mirror slot back to DISPONIBLE", async () => {
    const db = fakeDb();
    const pub = vi.fn();
    await applyNetflixWebhook(db, { event: "slot.released", deliveryId: "d1", payload: { lbSlotId: "s1", externalOrderRef: "100pcia-slot-42" } }, { publish: pub });
    expect(db.update).toHaveBeenCalled();
  });

  it("code.captured publishes OTP onto the event bus for the mapped slot", async () => {
    const db = fakeDb();
    const pub = vi.fn();
    await applyNetflixWebhook(db, { event: "code.captured", deliveryId: "d2", payload: { publicToken: "abc", type: "OTP_CODE", value: "1234", timestamp: "2026-06-19T00:00:00Z" } }, { publish: pub });
    expect(pub).toHaveBeenCalledWith(42, expect.objectContaining({ type: "OTP_CODE", value: "1234" }));
  });
});
```

- [ ] **Step 2: Lancer → échoue**

Run: `pnpm exec vitest run tests/unit/loadbrain-netflix-mirror.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter la logique pure**

Create `src/lib/loadbrain-netflix-mirror.ts` :
```typescript
import { eq } from "drizzle-orm";
import { digitalCodeSlots, slotActivationTokens } from "@/db/schema";
import { DigitalCodeSlotStatus } from "@/lib/constants"; // confirmer le nom du membre DISPONIBLE/VENDU

export interface NetflixWebhookEvent {
  event: "slot.allocated" | "slot.released" | "slot.expired" | "account.updated" | "account.ms_status_changed" | "code.captured";
  deliveryId: string;
  payload: Record<string, any>;
}
export interface MirrorDeps {
  publish: (slotId: number, payload: { type: "OTP_CODE" | "HOUSEHOLD_LINK"; value: string; timestamp: string }) => void;
}

/** Map a LoadBrain public_token back to the local mirror slot id via slot_activation_tokens. */
async function resolveLocalSlotId(db: any, publicToken: string): Promise<number | null> {
  const row = await db.query.slotActivationTokens.findFirst({ where: eq(slotActivationTokens.token, publicToken) });
  return row?.slotId ?? null;
}

export async function applyNetflixWebhook(db: any, event: NetflixWebhookEvent, deps: MirrorDeps): Promise<void> {
  switch (event.event) {
    case "slot.released": {
      const lbSlotId = event.payload.lbSlotId as string | undefined;
      if (lbSlotId) {
        await db.update(digitalCodeSlots).set({ status: DigitalCodeSlotStatus.DISPONIBLE, orderItemId: null }).where(eq(digitalCodeSlots.lbSlotId, lbSlotId));
      }
      return;
    }
    case "slot.expired": {
      const lbSlotId = event.payload.lbSlotId as string | undefined;
      if (lbSlotId) {
        await db.update(digitalCodeSlots).set({ status: DigitalCodeSlotStatus.EXPIRE }).where(eq(digitalCodeSlots.lbSlotId, lbSlotId));
      }
      return;
    }
    case "code.captured": {
      const publicToken = event.payload.publicToken as string | undefined;
      const type = event.payload.type as "OTP_CODE" | "HOUSEHOLD_LINK";
      const value = String(event.payload.value ?? "");
      const timestamp = String(event.payload.timestamp ?? new Date().toISOString());
      if (!publicToken || !value) return;
      const slotId = await resolveLocalSlotId(db, publicToken);
      if (slotId != null) deps.publish(slotId, { type, value, timestamp });
      return;
    }
    default:
      // slot.allocated / account.* → mirror reconciliation handled by import/reconcile job in later phases.
      return;
  }
}
```

Note: confirmer les membres réels de `DigitalCodeSlotStatus` (DISPONIBLE/VENDU/EXPIRE) en lisant `src/lib/constants.ts` ; ajuster si différent.

- [ ] **Step 4: Lancer → passe + tsc**

Run: `pnpm exec vitest run tests/unit/loadbrain-netflix-mirror.test.ts && pnpm exec tsc --noEmit`
Expected: PASS (2 tests) + 0 erreur.

- [ ] **Step 5: Commit**

```bash
git commit -- src/lib/loadbrain-netflix-mirror.ts tests/unit/loadbrain-netflix-mirror.test.ts -m "feat(streaming): pure mirror-update logic for LoadBrain netflix webhooks"
```

---

### Task B4: Récepteur de webhooks signé

**Files:**
- Create: `src/app/api/loadbrain/netflix/webhook/route.ts`
- Test: `tests/unit/loadbrain-netflix-webhook.test.ts`

- [ ] **Step 1: Test du handler (signature + replay + idempotence) — échoue**

Create `tests/unit/loadbrain-netflix-webhook.test.ts` :
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const applyMock = vi.fn();
vi.mock("@/lib/loadbrain-netflix-mirror", () => ({ applyNetflixWebhook: applyMock }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/streaming-event-bus", () => ({ streamingEventBus: { publish: vi.fn() } }));

import { POST } from "@/app/api/loadbrain/netflix/webhook/route";

const SECRET = "wh-secret";
beforeEach(() => { process.env.LOADBRAIN_WEBHOOK_SECRET = SECRET; applyMock.mockClear(); });

function signedRequest(body: string, ts = Math.floor(Date.now() / 1000), secret = SECRET) {
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return new Request("https://b.test/api/loadbrain/netflix/webhook", {
    method: "POST", body,
    headers: { "x-loadbrain-signature": sig, "x-loadbrain-timestamp": String(ts), "x-loadbrain-delivery-id": "d1", "content-type": "application/json" },
  });
}

describe("netflix webhook receiver", () => {
  it("accepts a valid signed payload and calls applyNetflixWebhook", async () => {
    const body = JSON.stringify({ event: "code.captured", payload: { publicToken: "abc", type: "OTP_CODE", value: "1234" } });
    const res = await POST(signedRequest(body) as any);
    expect(res.status).toBe(200);
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a bad signature (400)", async () => {
    const body = JSON.stringify({ event: "code.captured", payload: {} });
    const req = signedRequest(body, undefined, "wrong-secret");
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("rejects an expired timestamp (400)", async () => {
    const body = JSON.stringify({ event: "code.captured", payload: {} });
    const old = Math.floor(Date.now() / 1000) - 1000;
    const res = await POST(signedRequest(body, old) as any);
    expect(res.status).toBe(400);
  });

  it("is idempotent: same delivery-id applied once", async () => {
    const body = JSON.stringify({ event: "code.captured", payload: { publicToken: "abc", type: "OTP_CODE", value: "1" } });
    await POST(signedRequest(body) as any);
    await POST(signedRequest(body) as any);
    expect(applyMock).toHaveBeenCalledTimes(1); // 2nd is deduped
  });
});
```

- [ ] **Step 2: Lancer → échoue**

Run: `pnpm exec vitest run tests/unit/loadbrain-netflix-webhook.test.ts`
Expected: FAIL — route introuvable.

- [ ] **Step 3: Implémenter le récepteur (calque src/app/api/loadbrain/webhook/route.ts)**

Create `src/app/api/loadbrain/netflix/webhook/route.ts` :
```typescript
import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { applyNetflixWebhook } from "@/lib/loadbrain-netflix-mirror";
import { streamingEventBus } from "@/lib/streaming-event-bus";

export const dynamic = "force-dynamic";

// In-process idempotency cache (P0). Survives module reload via globalThis.
const g = globalThis as any;
if (!g.__nfWebhookSeen) g.__nfWebhookSeen = new Set<string>();
const seen: Set<string> = g.__nfWebhookSeen;

function safeEqual(a: string, b: string): boolean {
  try { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); } catch { return false; }
}

export async function POST(request: Request) {
  const secret = process.env.LOADBRAIN_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });

  const raw = await request.text();
  const sig = request.headers.get("x-loadbrain-signature") ?? "";
  const ts = request.headers.get("x-loadbrain-timestamp") ?? "";
  const deliveryId = request.headers.get("x-loadbrain-delivery-id") ?? "";
  if (!sig || !ts) return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 300) return NextResponse.json({ error: "Timestamp expired" }, { status: 400 });

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  if (!safeEqual(sig, expected)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  if (deliveryId && seen.has(deliveryId)) return NextResponse.json({ received: true, deduped: true });
  if (deliveryId) { seen.add(deliveryId); if (seen.size > 5000) seen.clear(); }

  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    await applyNetflixWebhook(db, { event: event.event, deliveryId, payload: event.payload ?? {} }, { publish: (slotId, payload) => streamingEventBus.publish(slotId, payload) });
  } catch (err: any) {
    console.error("[netflix-webhook] apply failed:", err?.message);
    return NextResponse.json({ error: "apply failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 4: Lancer → passe + tsc**

Run: `pnpm exec vitest run tests/unit/loadbrain-netflix-webhook.test.ts && pnpm exec tsc --noEmit`
Expected: PASS (4 tests) + 0 erreur.

- [ ] **Step 5: Commit**

```bash
git commit -- "src/app/api/loadbrain/netflix/webhook/route.ts" tests/unit/loadbrain-netflix-webhook.test.ts -m "feat(streaming): signed LoadBrain netflix webhook receiver (replay+idempotent) → mirror+event-bus"
```

---

## Critères de sortie P0 (gate avant P1)

- [ ] `tsc` 0 des deux côtés ; toutes les suites unitaires P0 vertes.
- [ ] LoadBrain : routes `/internal/slot/allocate` + `/internal/slot/release` répondent ; tests anti-double-vente + idempotence verts ; émetteur de webhooks signe correctement.
- [ ] Import : dry-run cohérent + apply idempotent (re-run = no-op) ; dashboard LoadBrain affiche l'inventaire importé (comptes + slots).
- [ ] Boutique : colonnes `lb_account_id`/`lb_slot_id` en place ; client mince testé (non câblé à la vente) ; récepteur de webhooks rejette signatures invalides/replays et applique une livraison valide une seule fois.
- [ ] **Aucun changement de comportement de vente boutique** (le flag `LB_NETFLIX_AUTHORITATIVE` n'existe pas encore — il arrive en P2).
- [ ] `STATUS.md` mis à jour (`[SYNC-LOADBRAIN]`), commits path-scopés, chef informé.

## Self-Review (planner)

**Spec coverage (sections du spec → tâches) :**
- §A Mapping d'identité → B1 (colonnes) + A5 (import renseigne la corrélation via `external_order_ref`/token). ✅
- §B Autorité d'allocation → A2 (service atomique idempotent anti-double-sell) + A3 (routes) + B2 (client, non câblé). Le **câblage** vente/refund = P2 (hors P0, volontaire). ✅
- §C Synchro bidirectionnelle → A4 (émetteur) + B3/B4 (récepteur+miroir) + A5 (import initial). Réconciliation périodique = P1/P2. ✅
- §D Page d'activation → B3/B4 republient `code.captured` sur l'event-bus existant (SSE inchangée). Device-quota centralisé = P3 (hors P0). ✅
- §E Cerveau (poller) → **P1**, hors P0 (volontaire). ✅
- §Sécurité → A4 signe HMAC ; B4 vérifie HMAC + replay + idempotence ; client envoie X-Internal-Token. ✅
- §Contraintes #1 (public_token), #2/#3 (pool/modèle slot) → résolues en tête de plan + A1/A5/A2. ✅

**Placeholder scan :** les seuls « à confirmer en A0 » concernent des **noms de symboles** à vérifier contre le code réel (firstRow, noms de colonnes drizzle, membres d'enum, getPublicBase) — le code d'implémentation est fourni en entier, pas différé. A0 est une tâche de vérification explicite, pas un TODO ouvert. Acceptable.

**Type consistency :** `allocateAvailableSlot`/`releaseSlot` (A2) ↔ routes (A3) ↔ client `allocateSlot`/`releaseSlot` (B2) : formes de payload alignées (`siteId/accountId/externalOrderRef/customerPhone`). `applyNetflixWebhook(db, event, deps)` (B3) ↔ appel récepteur (B4) : signature identique. `signNetflixWebhook` (A4) ↔ vérification récepteur (B4) : même schéma `sha256=HMAC(`${ts}.${body}`)`. ✅

**Dépendances P0 → phases suivantes :** P1 (poller LoadBrain ON + dual-run) consomme A4 (émetteur `code.captured`) + B4 (récepteur). P2 (vente autoritative) câble B2 dans `src/lib/orders.ts:91` derrière `LB_NETFLIX_AUTHORITATIVE` + refund dans `src/app/admin/refund-requests/actions.ts` derrière le même flag. P3 centralise le device-quota. Chaque phase = plan séparé.
