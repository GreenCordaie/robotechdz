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

### Task P3-3: Mutations admin proxifiées vers LoadBrain ⚠️ PARTIEL (tranche slot-quota DONE — LoadBrain e0b2969 + boutique 4f9dbb3)
**Recon (réalité architecturale) :** les mutations boutique et le modèle LoadBrain ne se recouvrent que partiellement. `linkProductToSharing` / `generateMissingSlots` = concepts **catalogue boutique** sans équivalent LoadBrain → restent locaux. `addSharedAccount` / `deleteSharedAccount` impliquent le **transfert/suppression des credentials MS Graph chiffrés** cross-système + de nouvelles routes account-write LoadBrain → **sensible, différé** (décision sécurité séparée). Le vrai trou créé par P3-1/P3-2 = le **cap device** (`maxDevices`) édité en admin n'était pas répercuté sur le `max_uses` autoritatif LoadBrain.
- [x] **Tranche livrée — slot-quota proxy :**
  - LoadBrain `PATCH /internal/slot/:id/quota` (`setSlotMaxUses`, tenant-scopé, NULL=illimité, 6 tests DB) — commit e0b2969.
  - Boutique `loadbrain-netflix-admin.client.ts` (`setSlotQuotaRemote`, dégrade-soft, 5 tests) + `updateSharedAccount` proxifie le cap post-commit, **gated** (flag + siteId), best-effort (un hoquet LB ne fait jamais échouer la sauvegarde admin). Commit 4f9dbb3.
- [x] **`deleteSharedAccount` proxifié** (boutique c34fcd4 + LoadBrain 6404635) : `DELETE /internal/account/:id` (drop compte + slots, refus 409 `has_active_slots`, tenant-scopé, FOR UPDATE) + client `deleteAccountRemote` (degrade-soft) câblé post-delete gated. 5 tests LB + 5 tests boutique.
- [x] **`addSharedAccount` = DESIGN livré** (décision verrouillée) : `docs/superpowers/specs/2026-06-21-p3-account-create-credential-design.md` — **Option A** (LoadBrain possède l'onboarding MS Graph, aucun transfert de secret cross-système). Implémentation planifiée sur stack live + tenant MS de test (chemin credentials non codable à l'aveugle).
- [ ] `sweepSharedAccountSlots` → boutique + LoadBrain ont chacun leur sweeper ; proxy optionnel (non requis).

### Task P3-4: Retirer l'allocation locale (dormante en secours) ✅ DONE (boutique b75ad01)
- [x] **Cœur comportemental livré** : en mode autoritatif (flag ON), un variant `isSharing` sans compte LoadBrain (`NO_LB_ACCOUNT`) = anomalie non-migrée → **livraison manuelle** par défaut (plus de local-pick silencieux). Le chemin local reste **dormant**, réactivable UNIQUEMENT via `LB_NETFLIX_EMERGENCY_LOCAL=true` (panne LoadBrain prolongée). Aucune suppression destructive.
- [x] **Tests** : NO_LB_ACCOUNT default → manual (plus de VENDU local) ; `LB_NETFLIX_EMERGENCY_LOCAL=true` → local pick ; non-régression flag-off byte-identique. 379/379, tsc 0.
- [x] **Décision « default-on »** : le flag **reste OFF par défaut dans le code** (sûr à merger ; flag-off = inchangé). Le passage default-on EST le **cutover ops** = `shop_settings.lb_netflix_authoritative=true` en prod une fois LoadBrain déployé + comptes migrés (un flip de setting, pas un défaut de code). L'extraction cosmétique en `allocateSharingSlotLocalFallback` n'a PAS été faite (le garde comportemental suffit ; éviter une refacto risquée sur un chemin argent).
- [x] Commit `feat(streaming): pure-replica allocation — local path dormant behind emergency hatch (P3-4)`.

### Task P3-5: E2E bidirectionnel complet ✅ DONE (boutique a89bd21)
- [x] Spec `tests/e2e/17-netflix-pure-replica.spec.ts` (skip-gated `E2E_PURE_REPLICA=1`, façon 16). Scénario 3 (device-quota N+1 bloqué) rejouable direct contre LoadBrain `device-bump` ET **prouvé vert** au niveau intégration LoadBrain (2 bumps concurrents au dernier crédit → un 200 + un 409). Scénarios 1/2/4 (propagation LoadBrain→boutique, proxy cap boutique→LoadBrain, vente/refund verts flag-ON) = `test.fixme` structurés + prérequis opérateur + seed cross-DB. tsc 0, parse OK.
- [x] Commit `test(e2e): pure-replica spec (P3-5) — two-console sync + centralized device-quota`.

## Critères de sortie P3 (= Definition of Done globale du spec)
- [x] **Code** : device-quota centralisé (autorité LoadBrain, P3-1/2) ; admin cap proxifié (P3-3 slot-quota) ; allocation locale **dormante** derrière garde de secours (P3-4). tsc 0 des deux côtés ; suites vertes (boutique 379, LoadBrain netflix 212+).
- [x] **Anti-double-vente + device-quota anti-overuse** prouvés VERTS au niveau autoritatif LoadBrain (tests de course réels). `[SYNC-LOADBRAIN]` posés (endpoints states/device-bump/quota).
- [ ] **OPS (hors code — bloque le 100 %)** : merger PR #25 (boutique) + #23 (LoadBrain) ; déployer LoadBrain ; **valider P2 en staging** (flag ON) ; **cutover prod** = `shop_settings.lb_netflix_authoritative=true`.
- [ ] **Différé (décision/design)** : P3-3 account-CRUD (`add`/`deleteSharedAccount` — transfert credentials MS Graph chiffrés + routes account-write LoadBrain) ; e2e 16/17 scénarios live (seed prêt, manque serveur boutique + LoadBrain live).

## Statut global P3 : ✅ tout le codable livré (P3-1→P3-5). Reste = OPS (review/deploy/staging/cutover) + P3-3 account-CRUD (design sécu). Le passage 87 %→100 % est désormais opérationnel, pas du code.

## Self-Review
Couvre §D (device-quota centralisé), §C (admin bidirectionnel), §B (allocation default-on) du spec + la Definition of Done. P3-0 = vérif explicite. Risque : device-quota fail-closed doit rester strict (sécurité anti-partage) même en mode dégradé — la politique cache est une décision sécurité explicite en P3-2. Dépend de P2 stable en prod avant de passer default-on.
