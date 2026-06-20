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

### Task P2-4: Refund → `releaseSlot` + retour-stock
**Files:** Modify `src/app/admin/refund-requests/actions.ts` + `src/lib/orders.ts`; Test.
- [ ] **Step 1 (test, échoue):** au refund d'une commande compte-partagé, si flag ON : `releaseSlot({ siteId, externalOrderRef })` appelé ; le miroir `digital_code_slots` repasse DISPONIBLE (corrige le retour-stock manquant constaté P0). Idempotent.
- [ ] **Step 2-3:** Implémenter dans le flux refund (deps client injecté), transactionnel, fail-soft (si LoadBrain down, marquer pour reconcile, ne pas bloquer le refund argent).
- [ ] **Step 4:** Run → passe ; tsc 0.
- [ ] **Step 5:** Commit `feat(streaming): refund releases the LoadBrain slot + returns mirror to stock`.

### Task P2-5: Réconciliation miroir↔LoadBrain (LoadBrain gagne)
**Files:** Create `src/services/netflix-mirror-reconcile.service.ts`; Test.
- [ ] **Step 1 (test, échoue):** détecte les divergences (slot vendu LoadBrain mais DISPONIBLE boutique, ou inverse) via comparaison par `lbSlotId`/`externalOrderRef` ; soigne en alignant la boutique sur LoadBrain ; rapport. Dérive injectée → détectée + soignée.
- [ ] **Step 2-3:** Implémenter (lecture LoadBrain via `getSlot`/listing SDK ou requête de réconciliation), brancher en cron gardé.
- [ ] **Step 4-5:** Run → passe ; commit `feat(streaming): mirror↔LoadBrain reconciliation (LoadBrain authoritative)`.

### Task P2-6: E2E vente/refund/anti-double-vente
**Files:** `tests/e2e/16-netflix-sale-authority.spec.ts`.
- [ ] Scénarios (flag ON, stack live + `netflix_test`) : (1) achat compte-partagé → slot alloué par LoadBrain, creds+token rendus, miroir cohérent. (2) refund → slot rendu DISPONIBLE. (3) **anti-double-vente** : 2 ventes simultanées sur pool à 1 slot (une boutique + une via route LoadBrain directe) → une seule réussit, l'autre « stock épuisé », aucune double-allocation. (4) LoadBrain down → vente → `PENDING_LB_ALLOC` → reprise reconcile sans double débit.
- [ ] Commit `test(e2e): sale authority — allocate/refund/anti-double-sell/degraded-retry`.

## Critères de sortie P2
- [ ] Flag OFF = comportement vente byte-identique (non-régression prouvée).
- [ ] Flag ON : allocation/refund via LoadBrain, miroir cohérent, **anti-double-vente E2E vert**, mode dégradé sans double débit, réconciliation soigne la dérive.
- [ ] tsc 0 des deux côtés ; suites vertes.

## Self-Review
Couvre §B (autorité d'allocation), §C (refund/release), §risques (mode dégradé, dérive) du spec + constat P0 #2 partiel (token généré à l'allocation via `allocateSlot`). P2-0 = vérif explicite des points d'insertion (pas de placeholder ; code concret modulo symboles confirmés). Risque clé : la branche `isSharing` de `orders.ts` est un chemin argent — flag OFF par défaut, tests de non-régression obligatoires avant tout déploiement flag ON.
