# P2 — Autorité de vente (anti-désync) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Faire de LoadBrain l'**autorité d'allocation** au moment de la vente et du refund, derrière le flag `LB_NETFLIX_AUTHORITATIVE` — pour garantir **zéro désynchronisation des ventes** (jamais de double-vente d'un même profil), tout en gardant l'allocation locale comme fallback quand le flag est off. La vente boutique reste fonctionnelle ; seul le **choix du slot** bascule vers LoadBrain.

**Architecture:** À la vente d'un variant `isSharing`, si le flag est on, la boutique résout le compte LoadBrain (`digital_codes.lbAccountId`), appelle `sdk.netflix.allocateSlot` (client P0, idempotent sur `(siteId, orderItemRef)`), puis **écrit le slot retourné dans le miroir** (`digital_code_slots` marqué VENDU + `lbSlotId` + token). Au refund, `releaseSlot`. Si LoadBrain est injoignable : échec propre (fail-closed) + file `PENDING_LB_ALLOC` ré-essayée sans double débit. Un job de réconciliation soigne toute dérive (LoadBrain gagne).

**Tech Stack:** Next.js + Drizzle (boutique), client P0 `src/services/loadbrain-netflix.client.ts`, Vitest, Playwright.

**Pré-requis :** P0 (client `allocateSlot`/`releaseSlot`, colonnes `lb_*`, miroir, webhooks) + P1 (poller live). LoadBrain expose déjà les routes (`31513aa`).

---

## File Structure
- **Modify** `src/lib/orders.ts` — `allocateOrderStock` (branche `isSharing`, ~L57-127) : bascule allocation LoadBrain derrière flag ; fallback local.
- **Modify** flux refund `src/app/admin/refund-requests/actions.ts` + `src/lib/orders.ts` — `releaseSlot` + retour-stock du slot (manquant aujourd'hui, constaté P0).
- **Create** `src/lib/loadbrain-netflix-allocation.ts` — orchestration vente (résoudre compte, allouer, miroir, fail-closed/queue).
- **Create** `src/services/pending-lb-alloc.reconciler.ts` — retry des commandes payées non-allouées.
- **Create** `src/services/netflix-mirror-reconcile.service.ts` — détection/soin de dérive miroir↔LoadBrain.
- **Modify** `src/db/schema.ts` + `drizzle/0035_pending_lb_alloc.sql` — statut/colonne `PENDING_LB_ALLOC` (si besoin) + flag config.
- **Tests** unit + e2e dédiés.

---

### Task P2-0: Vérifier les points d'insertion réels (read-only)
- [ ] **Step 1:** Relire `src/lib/orders.ts` branche `isSharing` (allocation du slot, `tx.update(digitalCodeSlots).set({status:VENDU, orderItemId})`, `createTokenForSlot`, écriture `activationUrl`). Relire `src/app/admin/refund-requests/actions.ts` (où l'order passe REMBOURSE ; confirmer qu'AUCUN retour-stock slot n'existe). Relire `src/services/loadbrain-netflix.client.ts` (signatures `allocateSlot`/`releaseSlot`/`LbNetflixError`). Confirmer comment lire la config flag (table `shop_settings` ou env `LB_NETFLIX_AUTHORITATIVE`). Confirmer la clé `orderItemRef` (probable `order_item.id` ou numéro de commande) et où trouver `lbAccountId` du `digital_code` choisi.

### Task P2-1: Orchestrateur d'allocation LoadBrain (fail-closed)
**Files:** Create `src/lib/loadbrain-netflix-allocation.ts`; Test `tests/unit/loadbrain-netflix-allocation.test.ts`.
- [ ] **Step 1 (test, échoue):** `allocateViaLoadBrain(tx, { variantId, orderItemId, customer })` : (a) sélectionne un `digital_code` DISPONIBLE du variant avec `lbAccountId` non-null ; (b) appelle `allocateSlot({ siteId, accountId: lbAccountId, externalOrderRef: orderItemRef, customerPhone })` (client injecté) ; (c) écrit le miroir (`digital_code_slots` VENDU + `lbSlotId` + `slotActivationTokens.token = publicToken`) ; (d) renvoie le slot. Tests : succès → miroir écrit ; `LB_UNAVAILABLE` → throw (fail-closed, rien marqué vendu) ; `OUT_OF_STOCK` → throw typé ; idempotence (même `orderItemRef` → même slot, pas de double miroir).
- [ ] **Step 2:** Run → échoue.
- [ ] **Step 3:** Implémenter, client deps-injecté, transactionnel (toutes les écritures miroir dans la `tx` de la commande). Mapper `publicToken` (≤16 char base64url accepté côté LB depuis A1b) dans `slotActivationTokens.token` + `digital_code_slots.activationUrl`.
- [ ] **Step 4:** Run → passe ; tsc 0.
- [ ] **Step 5:** Commit `feat(streaming): LoadBrain allocation orchestrator (mirror write, fail-closed, idempotent)`.

### Task P2-2: Brancher la vente derrière `LB_NETFLIX_AUTHORITATIVE`
**Files:** Modify `src/lib/orders.ts` (branche `isSharing`).
- [ ] **Step 1 (test, échoue):** test de `allocateOrderStock` : flag OFF → chemin local inchangé (slot local pické) ; flag ON → `allocateViaLoadBrain` appelé, slot LoadBrain reflété, **pas** de pick local. Injecter le flag + le client.
- [ ] **Step 2:** Run → échoue.
- [ ] **Step 3:** Dans la branche `isSharing`, lire le flag ; si ON, déléguer à `allocateViaLoadBrain` (P2-1) au lieu du SELECT/UPDATE local ; si OFF ou si `allocateViaLoadBrain` jette `LB_UNAVAILABLE` ET le flag tolère le fallback (config), retomber sur le chemin local OU marquer `PENDING_LB_ALLOC` (P2-3). Décision par défaut : flag ON strict = fail-closed (pas de fallback local pour éviter la désync), commande → `PENDING_LB_ALLOC`.
- [ ] **Step 4:** Run → passe ; tsc 0 ; suite verte ; **vérifier que flag OFF = comportement byte-identique à aujourd'hui**.
- [ ] **Step 5:** Commit `feat(streaming): route sharing-variant allocation through LoadBrain behind LB_NETFLIX_AUTHORITATIVE`.

### Task P2-3: File `PENDING_LB_ALLOC` + reconciler (anti double-débit)
**Files:** `drizzle/0035_*.sql` + `src/db/schema.ts` (statut/marqueur), `src/services/pending-lb-alloc.reconciler.ts`; Test.
- [ ] **Step 1:** migration additive : marquer une commande payée dont l'allocation LoadBrain a échoué (`PENDING_LB_ALLOC` — nouveau statut order item ou colonne booléenne `lb_alloc_pending`).
- [ ] **Step 2 (test, échoue):** reconciler : pour chaque item `PENDING_LB_ALLOC`, ré-appeler `allocateViaLoadBrain` (idempotent sur `orderItemRef`) ; succès → reflète + clear pending ; échec → laisse pending. **Jamais** de second débit (le paiement a déjà eu lieu ; on n'alloue que le slot). Test : idempotence + pas de double allocation.
- [ ] **Step 3:** Implémenter + brancher dans `instrumentation.ts` (poll périodique, gardé).
- [ ] **Step 4:** Run → passe ; tsc 0.
- [ ] **Step 5:** Commit `feat(streaming): PENDING_LB_ALLOC retry reconciler (no double debit)`.

### Task P2-4: Refund → `releaseSlot` + retour-stock ✅ DONE (commit 371fccc)
**Files RÉELS** (le pointeur initial `refund-requests/actions.ts` était faux — ce fichier gère active-code/g2bulk/bsv reseller, PAS les slots Netflix) :
- **Create** `src/lib/loadbrain-netflix-release.ts` — `releaseRefundedLbSlots` (idempotent, fail-soft, post-commit).
- **Modify** `src/app/admin/caisse/actions.ts` — les 4 chemins qui libèrent des slots compte-partagé : `refundOrderItem`, `refundFullOrder`, `cancelOrderAction`, `approveReturn`.
- **Test** `tests/unit/loadbrain-netflix-release.test.ts` (5 cas).
- [x] **Step 1 (test, échoue):** test du helper — refs `${orderItemId}-${i}`, skip lbSlotCount 0, fail-soft (compte les échecs sans throw), no-op si siteId absent, multi-items.
- [x] **Step 2-3:** Implémenté. Le retour-stock LOCAL du miroir (`digital_code_slots`→DISPONIBLE + parent VENDU→DISPONIBLE + `isDebitCompleted=false`) **existait déjà** (corrigé par B2, contrairement au constat P0). Le vrai trou = prévenir LoadBrain. Câblé post-commit dans les 4 actions, fail-soft (LB down → log, ne bloque jamais le refund argent ; reconcile P2-5 re-jouera).
- [x] **Décision (mieux que le plan):** release **flag-indépendant** — clé = présence de `lb_slot_id` sur le slot libéré, pas l'état courant du flag. Une vente faite flag-ON est donc libérée même si le flag est repassé OFF après. Idempotent côté LoadBrain (clé `(siteId, externalOrderRef)`).
- [x] **Step 4:** tsc 0 ; 349/349 verts.
- [x] **Step 5:** Commit `feat(streaming): refund/cancel/return releases LoadBrain-allocated slots (P2-4)` (371fccc).

### Task P2-5: Réconciliation miroir↔LoadBrain (LoadBrain gagne) ✅ DONE (boutique e000548 + LoadBrain 2dc8dd0)
**Prérequis découvert:** LoadBrain n'exposait AUCUN read per-slot interne (juste allocate/release/patch + health-summary agrégé). Donc P2-5 a nécessité **un nouvel endpoint de lecture LoadBrain** (cross-repo).
- **LoadBrain (commit 2dc8dd0, branche feat/netflix-centralization-p1):** `POST /internal/slot/states` `{siteId, slotIds[]}` → `{states:[{slotId,status,externalOrderRef,publicToken}]}`, tenant-scopé (un slotId d'un autre site est omis), X-Internal-Token. `slot-read.service.ts` + `routes/internal/slot-read.ts` + register `index.ts`. 4 tests d'intégration (vraie DB `netflix_test`), tsc 0, 193/193.
- **Boutique (commit e000548):**
  - Planificateur PUR `src/lib/netflix-mirror-reconcile-plan.ts` (`planReconcile(mirror, lbStates)` — aucune DB, 6 tests). Mapping: LB `ACTIVE`↔`VENDU` ; LB autre (AVAILABLE/REFUNDED/CANCELLED/RECLAIMED)↔`DISPONIBLE`.
  - Service `src/services/netflix-mirror-reconcile.service.ts` (wrapper DB fin, 4 tests fake-db).
  - Client `getSlotStates` ajouté à `loadbrain-netflix.client.ts`.
  - Cron `instrumentation.ts` toutes les 5 min, **gated sur le flag** (mode autoritatif seulement), webhooks restent primaires.
- [x] **Heal direction (LoadBrain gagne, seul le sens SÛR est automatisé):** boutique VENDU mais LB freed → flip DISPONIBLE + parent réactivé (rend l'inventaire, jamais de double-vente). LB ACTIVE mais boutique freed = **CONFLICT reporté** (pas de flip VENDU aveugle qui fabriquerait une vente). lbSlotId inconnu de LB = **ORPHAN reporté**.
- [x] **Step 4-5:** tsc 0 des deux côtés ; boutique 359/359, LoadBrain 193/193 ; commits ci-dessus.

### Task P2-6: E2E vente/refund/anti-double-vente ✅ DONE (LoadBrain 30cf543 + boutique 56a9ba2)
- [x] **Scénario 3 (anti-double-vente) = RUNNABLE + VERT** au niveau autoritatif : `modules/netflix/tests/integration/slot-allocate-route.test.ts` — 2 allocations concurrentes sur pool à 1 slot → exactement un 201 + un 409 (FOR UPDATE SKIP LOCKED). 6/6 contre `netflix_test`. C'est l'invariant central « zéro désync » ; la vente boutique délègue à cette garantie.
- [x] **Spec boutique** `tests/e2e/16-netflix-sale-authority.spec.ts` (skip-gated `E2E_SALE_AUTHORITY=1`, façon 14/15) : scénario 3 rejouable directement contre LoadBrain ; scénarios 1 (achat→alloc LoadBrain+miroir), 2 (refund→release des 2 côtés), 4 (LoadBrain down→fail-closed livraison manuelle, pas de double débit) = `test.fixme` structurés avec prérequis opérateur précis, **en attente d'un seed cross-DB** (`scripts/seed-netflix-sale-authority-e2e.js` à créer) + stack live. Pas d'assertions fragiles prétendant passer ; CI reste verte.
- [x] Commits ci-dessus. Reste opérateur (hors session) : créer le seed + lancer 1/2/4 sur la stack complète.

## Critères de sortie P2
- [x] Flag OFF = comportement vente byte-identique (P2-2 : la branche `isSharing` n'entre dans le chemin LoadBrain que si le flag est ON ; suites vertes flag-off).
- [x] Flag ON : allocation (P2-2) / refund-release (P2-4) via LoadBrain, miroir réconcilié (P2-5), **anti-double-vente E2E VERT** (LoadBrain 30cf543, concurrence réelle), mode dégradé fail-closed→livraison manuelle (pas de double débit ; e2e `test.fixme` en attente de stack). Réconciliation soigne la dérive (P2-5, planner pur testé).
- [x] tsc 0 des deux côtés ; suites vertes (boutique 359, LoadBrain netflix 193+ ).
- [ ] **Reste opérateur (hors session)** : seed cross-DB + exécuter e2e 16 scénarios 1/2/4 sur stack live ; décider cutover flag ON en prod.

## Statut global P2 : ✅ implémenté + testé (P2-1→P2-6). Reste : validation e2e 1/2/4 sur stack live + décision cutover.

## Self-Review
Couvre §B (autorité d'allocation), §C (refund/release), §risques (mode dégradé, dérive) du spec + constat P0 #2 partiel (token généré à l'allocation via `allocateSlot`). P2-0 = vérif explicite des points d'insertion (pas de placeholder ; code concret modulo symboles confirmés). Risque clé : la branche `isSharing` de `orders.ts` est un chemin argent — flag OFF par défaut, tests de non-régression obligatoires avant tout déploiement flag ON.
