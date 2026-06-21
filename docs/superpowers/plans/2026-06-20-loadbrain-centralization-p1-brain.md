# P1 — Cerveau (poller live + auto-approve + replay) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Faire de LoadBrain le **cerveau streaming** : son poller mailbox MS Graph devient la source des événements OTP/household (auto-approve inclus), émis vers la boutique par webhooks `code.captured` (émetteur livré en P0), et le poller boutique est éteint après vérification de parité. Corrige aussi le constat P0 : persister `code.captured` côté boutique pour le replay SSE.

**Architecture:** Le poller LoadBrain (`mailbox.worker.ts`, déjà présent mais désactivé) est activé (`NETFLIX_ENABLE_MAILBOX=true`). À chaque capture, il route (OTP → slot, household → broadcast + auto-approve Playwright) et **émet un webhook `code.captured`** (via `emitNetflixWebhook` de P0). La boutique reçoit (récepteur P0), **persiste un `slot_events`** puis republie sur l'event-bus → SSE. Dual-run sûr (dédup `source_email_id`) puis extinction du poller boutique.

**Tech Stack:** LoadBrain Fastify+BullMQ+MS Graph ; boutique Next.js+Drizzle+SSE ; Vitest ; Playwright.

**Repos & branches :** LoadBrain `feat/netflix-centralization-p0` (continue) ; boutique idem. Commits path-scopés.

**Pré-requis P0 (livrés) :** émetteur `emitNetflixWebhook` (`modules/netflix/src/services/emit-webhook.ts`), récepteur boutique `src/app/api/loadbrain/netflix/webhook/route.ts`, `applyNetflixWebhook` (`src/lib/loadbrain-netflix-mirror.ts`), event-bus + SSE existants.

---

## File Structure
- **Modify (LoadBrain)** `modules/netflix/src/workers/mailbox.worker.ts` — émettre `code.captured` après chaque capture/route.
- **Modify (LoadBrain)** `modules/netflix/src/services/emit-webhook.ts` (si besoin) — payload `code.captured`.
- **Modify (boutique)** `src/lib/loadbrain-netflix-mirror.ts` — sur `code.captured`, persister un `slot_events` (chiffré) AVANT publish (replay).
- **Test** `modules/netflix/tests/unit/mailbox-emit.test.ts`, `tests/unit/loadbrain-netflix-mirror.test.ts` (étendu).
- **Ops** `docs/superpowers/runbooks/p1-poller-cutover.md` (nouveau runbook).

---

### Task P1-0: Vérifier le poller LoadBrain (read-only)
- [ ] **Step 1:** Lire `modules/netflix/src/workers/mailbox.worker.ts` : où un email capté devient OTP vs HOUSEHOLD ; où le routage écrit `netflix.codes` + `netflix.routing_decisions` ; où l'auto-approve est enqueué ; la signature exacte de la fonction de persistance/route (point d'insertion de l'émission webhook). Confirmer le gate `NETFLIX_ENABLE_MAILBOX` dans `index.ts`. Confirmer comment le worker résout le `public_token` du slot ciblé (l'OTP est routé vers un slot → on a son `public_token` pour le payload `code.captured`). Noter les symboles réels.

### Task P1-1: Émettre `code.captured` depuis le poller LoadBrain
**Files:** Modify `modules/netflix/src/workers/mailbox.worker.ts`; Test `modules/netflix/tests/unit/mailbox-emit.test.ts`.
- [ ] **Step 1 (test, échoue):** test unitaire injectant un `emit` mock dans la fonction de route ; quand un OTP est routé vers un slot (avec son `public_token`), `emit("code.captured", { publicToken, type:"OTP_CODE", value, timestamp }, siteId)` est appelé une fois ; idem `HOUSEHOLD_LINK` broadcast → un `code.captured` par slot (ou un seul `type:"HOUSEHOLD_LINK"` selon le contrat — décider en P1-0).
- [ ] **Step 2:** Run → échoue.
- [ ] **Step 3:** Dans `mailbox.worker.ts`, après la persistance/route réussie (et l'enqueue auto-approve pour household), appeler `void emitNetflixWebhook("code.captured", { publicToken, type, value, timestamp, slotId }, siteId).catch(()=>{})` (fire-and-forget gardé). Rendre `emit` injectable (deps) pour le test. Réutiliser `emitNetflixWebhook` de P0.
- [ ] **Step 4:** Run → passe ; `pnpm exec tsc --noEmit` 0 ; suite verte.
- [ ] **Step 5:** Commit `feat(netflix): emit code.captured webhook from mailbox worker on OTP/household route`.

### Task P1-2: Persister `code.captured` côté boutique (replay SSE)
**Files:** Modify `src/lib/loadbrain-netflix-mirror.ts`; Test `tests/unit/loadbrain-netflix-mirror.test.ts`.
Constat P0 : `applyNetflixWebhook` publie en live sans persister → pas de replay si la page s'ouvre tard.
- [ ] **Step 1 (test, échoue):** sur `code.captured`, `applyNetflixWebhook` insère un `slot_events` (slotId résolu, `eventType`, `valueEncrypted` = `encrypt(value)`, `sourceEmailId` = `payload.sourceEmailId ?? deliveryId`, `digitalCodeId`) **idempotent** (dédup `(digital_code_id, source_email_id)` — réutiliser l'index `se_dedup_idx`, ON CONFLICT DO NOTHING) PUIS publie. Le test vérifie l'insert + le publish, et qu'un 2e appel même `sourceEmailId` n'insère pas 2 fois.
- [ ] **Step 2:** Run → échoue.
- [ ] **Step 3:** Implémenter : résoudre `slotId` + `digitalCodeId` via `slotActivationTokens`/`digitalCodeSlots` (le slot → son `digital_code_id`), `encrypt(value)` (`@/lib/encryption`), insert `slotEvents` `onConflictDoNothing`, puis `deps.publish`. Garder la fonction pure-ish (db injecté).
- [ ] **Step 4:** Run → passe ; tsc 0 ; suite boutique verte.
- [ ] **Step 5:** Commit `fix(streaming): persist code.captured to slot_events before publish (SSE replay-on-connect)`.

### Task P1-3: Dual-run + bascule du poller (runbook + vérif)
**Files:** Create `docs/superpowers/runbooks/p1-poller-cutover.md`.
- [ ] **Step 1:** Documenter : (a) activer LoadBrain `NETFLIX_ENABLE_MAILBOX=true` + `REDIS_URL`/`DATABASE_URL` netflix + `NETFLIX_WEBHOOK_URL_AGENT007`/`NETFLIX_WEBHOOK_SECRET_AGENT007`. (b) garder boutique `STREAMING_DEEPLINK_MODE=true` (dual-run). (c) vérifier parité : sur N comptes, les deux pollers captent les mêmes emails, dédup `source_email_id` empêche le double-traitement (vérifier les 2 index uniques identiques). (d) après 24-48 h de parité OK, poser boutique `STREAMING_DEEPLINK_MODE=false` (poller boutique OFF). (e) rollback : re-`true`.
- [ ] **Step 2:** Vérif parité scriptée : comparer `netflix.codes` (LoadBrain) vs `slot_events` (boutique) sur une fenêtre — mêmes captures, pas de double livraison client.
- [ ] **Step 3:** Commit `docs(runbook): P1 poller dual-run + cutover`.

### Task P1-4: E2E poller → activation (simulateur d'email)
**Files:** Test `tests/e2e/15-netflix-poller-to-activation.spec.ts` (boutique) OU test d'intégration LoadBrain.
Sans vrais creds MS Graph, injecter au niveau résolveur : un test qui simule `getLatestNetflixEmail` renvoyant un OTP, fait tourner un `runOnePass` du poller LoadBrain contre `netflix_test` (compte+slot seedés, `public_token` partagé avec un token boutique), vérifie l'émission `code.captured` (émetteur en mode capture/mock), puis côté boutique poste ce webhook signé → `/activer/[token]` affiche l'OTP (réutiliser le harnais E2E P0 `14-*`).
- [ ] **Step 1-4:** seed parité token ; stub résolveur OTP ; assert émission ; assert affichage navigateur ; commit `test(e2e): poller-captured OTP reaches /activer via webhook`.

## Critères de sortie P1
- [ ] Poller LoadBrain émet `code.captured` (test) ; boutique persiste + republie (test, replay couvert).
- [ ] Dual-run vérifié (parité, pas de double livraison) ; poller boutique éteint via flag, rollback documenté.
- [ ] E2E poller→/activer vert (simulateur) ; tsc 0 des deux côtés.

## Self-Review
Couvre §E du spec (poller cutover) + le constat P0 #1 (replay). Le constat P0 #2 (slots sans token) est traité en P2 (génération de token à l'allocation). Pas de placeholder : P1-0 est une vérif explicite ; le code des tâches est concret modulo symboles confirmés en P1-0.
