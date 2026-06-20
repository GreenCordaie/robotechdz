# P3 — Réplique pure (admin proxifié + device-quota centralisé) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Finaliser la centralisation : la boutique devient une **réplique pure**. Les écritures admin compte-partagé proxifient vers LoadBrain (vérité unique), le **device-quota anti-link-sharing** devient autorité LoadBrain, et le chemin d'allocation locale est **retiré** (dormant en secours). LoadBrain = source de vérité bout-en-bout ; la boutique reste 100 % fonctionnelle en lecture (miroir) et en écriture (proxy).

**Architecture:** `/admin/comptes-partages` garde son UI mais ses mutations (add/update/delete compte, link variant, sweep) passent par le SDK LoadBrain ; les changements faits dans le dashboard LoadBrain redescendent par webhook (P0/P1). Le gate `/activer` device-quota consulte LoadBrain (`netflix.slots.max_uses/usage_count`) avec cache local court + fail-closed. L'ancien `allocateOrderStock` local pour `isSharing` est retiré (le flag `LB_NETFLIX_AUTHORITATIVE` devient toujours-on ; le chemin local reste dormant, réactivable en secours).

**Tech Stack:** Next.js + Drizzle (boutique), SDK/clients LoadBrain, Vitest, Playwright.

**Pré-requis :** P0 (client, webhooks, miroir), P1 (poller), P2 (autorité de vente + flag + reconciler). P3 suppose P2 validée en prod (flag ON stable).

---

## File Structure
- **Modify** `src/app/admin/comptes-partages/actions.ts` — mutations proxifiées vers LoadBrain (add/update/delete/link/sweep) ; lectures restent sur le miroir.
- **Create** `src/services/loadbrain-netflix-admin.client.ts` — méthodes CRUD compte/slot vers LoadBrain (étend le client P0).
- **Modify** `src/app/activer/[token]/page.tsx` + `src/services/slot-device-quota.service.ts` — device-quota consulte LoadBrain (autorité) + cache local + fail-closed.
- **Create** `src/services/loadbrain-device-quota.client.ts` — `bumpDeviceUsage`/`checkQuota` vers LoadBrain.
- **Modify (LoadBrain)** `modules/netflix/src/routes/internal/` — endpoint device-quota (`POST /internal/slot/:id/device-bump` autoritatif atomique sur `usage_count`/`max_uses`).
- **Modify** `src/lib/orders.ts` — retirer la branche d'allocation locale `isSharing` (dormante derrière un garde « secours »), `LB_NETFLIX_AUTHORITATIVE` devient default-on.
- **Tests** unit + e2e.

---

### Task P3-0: Vérifier l'admin + le device-quota actuels (read-only)
- [ ] **Step 1:** Relire `src/app/admin/comptes-partages/actions.ts` (toutes les mutations : `addSharedAccount`, `updateSharedAccount`, `deleteSharedAccount`, `linkProductToSharing`, `sweepSharedAccountSlots`, `resolveHouseholdAction`). Relire `src/services/slot-device-quota.service.ts` (`checkDeviceQuota` pur + `bumpDeviceUsage` atomique) + son appel dans `src/app/activer/[token]/page.tsx`. Confirmer côté LoadBrain l'état de `netflix.slots.max_uses/usage_count` + s'il existe déjà un endpoint de bump (sinon le créer). Noter les symboles.

### Task P3-1: Endpoint device-quota autoritatif (LoadBrain) ✅ DONE (LoadBrain a634548)
- [x] `POST /internal/slot/:id/device-bump` : incrément atomique `usage_count` borné par `max_uses` (NULL=illimité), **lock `FOR UPDATE`** → 2 bumps concurrents au dernier crédit = exactement un 200 + un 409 `quota_exhausted`. Debounce optionnel (`debounceMinutes`, calculé côté DB via `make_interval`, pas d'horloge app). Tenant-scopé par siteId. `device-quota.service.ts` + `routes/internal/slot-device-bump.ts` + register `index.ts`.
- [x] 8 tests d'intégration (vraie DB `netflix_test`, dont la course + tenant-scope + 404 + debounce). tsc 0, 202/202.
- [x] Commit `feat(netflix): authoritative device-bump endpoint (atomic usage_count cap) — P3-1`.

### Task P3-2: Device-quota boutique consulte LoadBrain (fail-closed + cache) ✅ DONE (boutique 2452738)
**Découverte:** le modèle boutique (`maxDevices`/`devicesActivated`/`lastDeviceAt`, collapse 60 min) est **sémantiquement identique** à LoadBrain (`max_uses`/`usage_count`/`last_used_at`) → mapping 1:1.
- [x] `loadbrain-device-quota.client.ts` (`bumpDeviceUsageRemote`) : **DÉGRADE** (renvoie `unavailable`) au lieu de throw → fallback local (≠ client d'allocation qui fail-close en throw).
- [x] `loadbrain-device-quota.service.ts` (`enforceDeviceQuota`) orchestre LB-first / local-fallback. Remote ok+fresh → mirror local best-effort ; ok+debounced → pas de mirror ; `quota_exhausted` → bloque ; `unavailable`/`not_found` → enforcer local.
- [x] **Politique LoadBrain-down (décision sécurité)** : fallback sur le **cap du miroir local** (toujours strict, atomique, TOCTOU-safe) — pas de hard-deny d'un client légitime sur un hoquet LB. Le cap reste appliqué des deux côtés ; seule l'autorité du compteur dégrade.
- [x] `slot-device-quota.service.ts` : extraction `enforceLocalDeviceQuota` (check + bump atomique + recheck TOCTOU de la page, à l'identique) partagée par les 2 chemins.
- [x] `activer/[token]/page.tsx` câblé **derrière le flag** (`lbSlotId != null && isLbNetflixAuthoritative()`) ; flag OFF = chemin local inchangé (byte-identique).
- [x] 14 tests (client 7 + orchestrateur 7) ; tsc 0 ; 373/373.
- [x] Commit `feat(streaming): device-quota enforced by LoadBrain (authoritative) with local mirror — P3-2`.

### Task P3-3: Mutations admin proxifiées vers LoadBrain
**Files:** Create `src/services/loadbrain-netflix-admin.client.ts`; Modify `src/app/admin/comptes-partages/actions.ts`; Test.
- [ ] **Step 1 (test, échoue):** chaque mutation (`addSharedAccount`, `updateSharedAccount`, `deleteSharedAccount`, `linkProductToSharing`, `sweepSharedAccountSlots`) appelle l'API LoadBrain correspondante puis reflète localement (ou attend le webhook) ; les lectures (`getSharedAccountsInventory`) restent sur le miroir. Tests avec client mock : la mutation part bien vers LoadBrain ; fail → erreur sanitisée, pas d'écriture locale orpheline.
- [ ] **Step 2-4:** Étendre le SDK/admin-client LoadBrain (côté LoadBrain : routes admin write si absentes — `POST/PATCH/DELETE /internal/account`), implémenter le proxy boutique, garder l'UX. tsc 0.
- [ ] **Step 5:** Commit `feat(streaming): admin shared-account mutations proxy to LoadBrain (single source of truth)`.

### Task P3-4: Retirer l'allocation locale (dormante en secours)
**Files:** Modify `src/lib/orders.ts`.
- [ ] **Step 1:** `LB_NETFLIX_AUTHORITATIVE` devient default-on. La branche locale `isSharing` (SELECT/UPDATE/createToken) est extraite dans une fonction `allocateSharingSlotLocalFallback` **non appelée** sauf garde explicite `LB_NETFLIX_EMERGENCY_LOCAL=true`. Aucune suppression destructive — code dormant réactivable.
- [ ] **Step 2:** Tests : default → LoadBrain ; `LB_NETFLIX_EMERGENCY_LOCAL=true` → local. Non-régression.
- [ ] **Step 3:** Commit `refactor(streaming): LoadBrain allocation default-on; local path dormant emergency fallback`.

### Task P3-5: E2E bidirectionnel complet
**Files:** `tests/e2e/17-netflix-pure-replica.spec.ts`.
- [ ] Scénarios (stack live) : (1) édition d'un compte dans le dashboard LoadBrain → webhook → `/admin/comptes-partages` boutique reflète. (2) édition côté boutique → proxifiée → visible LoadBrain. (3) device-quota : N+1ᵉ appareil bloqué via autorité LoadBrain. (4) vente/refund toujours verts (P2) en mode default-on.
- [ ] Commit `test(e2e): pure replica — two-console sync + centralized device-quota`.

## Critères de sortie P3 (= Definition of Done globale du spec)
- [ ] LoadBrain = source de vérité unique bout-en-bout ; boutique = réplique 100 % fonctionnelle (caisse/commandes/refund/catalogue/activation inchangés pour opérateur et client).
- [ ] Device-quota centralisé (autorité LoadBrain) ; admin proxifié ; allocation locale dormante.
- [ ] **6 scénarios E2E du spec verts** (P0 webhook→SSE, P1 poller→OTP, P2 vente/refund/anti-double-vente/dégradé, P3 deux-consoles/quota) ; tsc 0 ; suites vertes.
- [ ] Runbook cutover + rollback complet ; `[SYNC-LOADBRAIN]` posé ; chef informé.

## Self-Review
Couvre §D (device-quota centralisé), §C (admin bidirectionnel), §B (allocation default-on) du spec + la Definition of Done. P3-0 = vérif explicite. Risque : device-quota fail-closed doit rester strict (sécurité anti-partage) même en mode dégradé — la politique cache est une décision sécurité explicite en P3-2. Dépend de P2 stable en prod avant de passer default-on.
