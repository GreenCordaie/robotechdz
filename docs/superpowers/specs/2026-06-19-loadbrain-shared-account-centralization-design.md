# Centralisation du module « compte partagé » streaming vers LoadBrain — Design

**Date:** 2026-06-19
**Module:** Cross-repo — boutique 100-pc-IA (`feat/bsv-mirror-integrated`) ↔ LoadBrain `modules/netflix` (`feat/bsv-bulletproof-and-listings`)
**Site ID:** `AGENT007`
**Status:** Approved (design), pending implementation plan
**Owner orchestration:** `chef` (possède `modules/netflix` côté LoadBrain + l'intégration boutique)

## Purpose

Faire de **LoadBrain `modules/netflix` la source de vérité unique** pour tout le module « compte partagé » streaming (comptes maîtres Outlook/Netflix, slots/profils, stock, ventes, OTP/household, lifecycle), de sorte que **tout soit géré et supervisé depuis LoadBrain** — tout en gardant la **boutique 100 % fonctionnelle** comme réplique synchronisée (caisse, commandes, refunds, catalogue, page d'activation client white-label inchangés pour l'opérateur et le client).

La contrainte dure n°1, posée par le métier : **zéro désynchronisation sur les ventes**. Deux systèmes qui vendraient indépendamment sur le même stock physique (les profils Netflix) finiraient par double-vendre. La réponse architecturale est : **une seule autorité d'allocation au moment de la vente** (LoadBrain), la boutique reflétant le résultat.

### Non-objectifs

- On ne réécrit **pas** le checkout, la caisse, le moteur de refund, ni le catalogue de la boutique. Les changements boutique sont **additifs et contenus** (client SDK, récepteur de webhooks, colonnes de mapping, redirection de l'étape d'allocation derrière un flag).
- On ne supprime **pas** les tables boutique `digital_codes` / `digital_code_slots` : elles deviennent un **miroir** lu localement (résilience + couplage POS préservé).
- Pas de double-master symétrique. « Bidirectionnel » = expérience deux-consoles, mais **une seule vérité sous le capot**.

## État des lieux (vérifié 2026-06-19)

### Boutique (100-pc-IA) — pipeline complet existant
- **Schéma** (`src/db/schema.ts`) : `digital_codes` (compte maître ; `code` & `outlookPassword` chiffrés ; `msRefreshToken/msStatus/msAccountEmail/msClientId/msLastSync/hasExtraMember`), `digital_code_slots` (profil ; PIN chiffré, `maxDevices/devicesActivated/lastDeviceAt`, `activationUrl`, `lastCodeRequestAt`), `slot_activation_tokens` (token varchar(16), `validUntil`, `lastSeenAt`), `slot_events` (OTP/HOUSEHOLD chiffrés, dédup `(digital_code_id, source_email_id)`), `slot_lifecycle` (cadence household ~28j → intensité polling).
- **Services** : `slot-activation-token.service.ts`, `slot-device-quota.service.ts` (`checkDeviceQuota` pur + `bumpDeviceUsage` atomique), `netflix-resolver.service.ts`, `microsoft-graph.service.ts`, `microsoft-auth.service.ts`, `loadbrain-auto-approve.client.ts`, `shared-account-sweeper.service.ts`, `shared-account-orphan-generator.service.ts`.
- **Worker** : `streaming-mailbox-watcher.worker.ts` (gardé par `STREAMING_DEEPLINK_MODE=true`, init via `instrumentation.ts`).
- **Routes publiques** : `src/app/activer/[token]/{page.tsx,ActivationClient.tsx}` + `src/app/api/activer/[token]/{events,heartbeat,request-code,poll}/route.ts`.
- **Admin** : `src/app/admin/comptes-partages/{page.tsx,SharedAccountsContent.tsx,SharedAccountsMobile.tsx,SharedAccountsViewSwitcher.tsx,actions.ts}` (`getSharedAccountsInventory`, add/update/delete, link variant, sweep, generate, `resolveHouseholdAction`).
- **Libs** : `src/lib/streaming-event-bus.ts` (pub/sub in-process), `src/lib/netflix-url.ts` (validation host www.netflix.com + sender).
- **Migrations** : `drizzle/0018_streaming_deeplink.sql`, `0019_slot_activation_url.sql`, `0021_slot_device_quota.sql`, `0022_backfill_max_devices.sql`, `0025_slot_last_code_request.sql`.
- **Intégration LoadBrain actuelle** : `callLoadBrainAutoApprove` → `POST ${LOADBRAIN_URL}/api/netflix/internal/auto-approve` (X-API-Key + X-Internal-Token), payload `{ accountId, codeId, url }`.

### LoadBrain — `modules/netflix` déjà ~80 % construit (microservice Fastify, port 3015)
- **Schéma `netflix` (Postgres namespace)** : `netflix_accounts` (`site_id`, `ms_account_email`, `ms_refresh_token_encrypted` v1:, `ms_status`, `monitoring_intensity`, `auto_approve_household`, `netflix_email`, `netflix_password_encrypted`, giftcard…, unique `(site_id, ms_account_email)`), `netflix_slots` (`account_id`, `site_id`, `netflix_profile_name(_normalized)`, `customer_phone/name/email`, `external_order_ref`, `public_token` unique global, `expires_at`, `max_uses`, `usage_count`, `status`, `profile_pin_encrypted`, `sale_price_dzd`, `sold_at`, unique `(account_id, profile_name_normalized)` et `(site_id, external_order_ref)`), `netflix_codes` (dédup `(account_id, source_email_id)`), `netflix_routing_decisions` (audit immuable), `netflix_webhook_deliveries` (`signature_sha256`, `delivery_id`, retry log), `netflix_slot_lifecycle`.
- **Workers** : `mailbox.worker.ts` (poller MS Graph, **DÉSACTIVÉ** — `NETFLIX_ENABLE_MAILBOX`), `auto-approve.worker.ts` (BullMQ + Playwright, **actif**, concurrency 2, retry 4, whitelist netflix.com).
- **Routes** : `routes/internal/{auto-approve,slot,health-summary}.ts`, `routes/admin/{accounts,account-details,slots,codes,auth-guard}.ts`, `routes/magic-link.ts` (`GET /n/:token` + SSE).
- **Services / lib** : `slot-provision.service.ts` (`claimOrCreateSlot`), `slot-eligibility.ts`, `codes-store.ts` (SSE), `slot-lifecycle.service.ts`, `routing/routing-engine.ts`, `lib/{encryption,token,normalize,auto-approve-whitelist}.ts`.
- **Dashboard** : `apps/dashboard/src/app/(dashboard)/admin/netflix/**` (5 onglets), proxy `apps/dashboard/src/app/api/netflix/[...path]/route.ts`, hooks `use-netflix.ts`.
- **Migration** : `modules/netflix/scripts/migrate-from-100pcia.ts` (one-shot, 10 comptes Outlook déjà importés).

### Manques côté LoadBrain (à construire)
- **Surface SDK netflix** (`packages/sdk` / `sdk-v2`) : **inexistante**. À créer : `allocateSlot`, `releaseSlot`, `getSlot`, `listAccounts`, CRUD compte, `health`, et la souscription/relais d'événements.
- **Émetteur de webhooks** sortants (la table `netflix_webhook_deliveries` existe, la file BullMQ d'émission **n'est pas câblée**).
- **Allocation transactionnelle de vente** côté `slot-provision.service.ts` avec **idempotence sur `(site_id, external_order_ref)`** et garde anti-double-vente (`FOR UPDATE SKIP LOCKED` sur le pool).
- **Device-quota centralisé** (cible P3) : `netflix_slots.max_uses/usage_count` à promouvoir en autorité.

## Principe directeur & invariant

> **Invariant central :** l'état « ce slot est-il vendu / disponible » a **exactement un propriétaire : LoadBrain**. La boutique ne fait que **demander** (allouer/libérer) et **refléter**. Toute lecture boutique passe par le miroir ; toute écriture qui change la disponibilité passe par LoadBrain en synchrone.

Conséquence directe : **impossible de vendre deux fois le même profil**, quel que soit le canal initiateur (checkout boutique, dashboard LoadBrain, futur autre site).

## Architecture

### A. Mapping d'identité (additif, non-cassant)

| Boutique (miroir) | LoadBrain (vérité) | Clé de corrélation |
|---|---|---|
| `digital_codes.id` (int) + **col. ajoutée** `lb_account_id uuid null` | `netflix_accounts.id` (uuid) | `(site_id=AGENT007, ms_account_email)` |
| `digital_code_slots.id` (int) + **col. ajoutée** `lb_slot_id uuid null` | `netflix_slots.id` (uuid) | `(site_id, external_order_ref)` |
| `slot_activation_tokens.token` (varchar 16) | `netflix_slots.public_token` | **token préservé** → les liens `/activer/[token]` déjà distribués restent valides |

- **Migration boutique** : 1 migration purement additive (`ADD COLUMN lb_account_id`, `lb_slot_id`, nullable + index). Aucune lecture existante impactée (Drizzle SELECT inclut les nouvelles colonnes nullable sans casse).
- **Côté LoadBrain** : `external_order_ref` = référence commande/orderItem boutique → clé naturelle de corrélation slot ↔ vente. `public_token` accepte la valeur 16-char existante de la boutique (vérifier la contrainte : varchar/text unique, pas de format imposé).

### B. Cœur anti-désync — autorité d'allocation (LoadBrain)

**Vente (P2+) :**
1. Checkout boutique (chemin existant `allocateOrderStock`) → derrière un **feature-flag** `LB_NETFLIX_AUTHORITATIVE` → appelle `sdk.netflix.allocateSlot({ siteId, variantRef, orderItemRef, customer })`.
2. LoadBrain `slot-provision.service.ts` : `BEGIN` → sélectionne un slot DISPONIBLE du pool du variant (`FOR UPDATE SKIP LOCKED`) → marque vendu (`status=ACTIVE`, `external_order_ref`, `sold_at`, `sale_price_dzd`) → garantit `public_token` → `COMMIT` → renvoie `{ lbSlotId, lbAccountId, profileName, pin, token, activationUrl, credentials }`.
3. **Idempotence** : clé `(site_id, external_order_ref)` (déjà unique). Un retry renvoie **le même slot** (lecture de l'allocation existante au lieu d'en créer une 2ᵉ). Aucune double-allocation possible.
4. Boutique écrit le résultat dans le **miroir local** (`digital_code_slots` marqué vendu + `lb_slot_id` + `slot_activation_tokens.token`). Caisse/commandes/refunds lisent en local, **inchangés**.

**Refund / retour-stock :**
- Chemin refund existant boutique → `sdk.netflix.releaseSlot({ siteId, orderItemRef, reason })` → LoadBrain remet `status=AVAILABLE` (purge creds client, `reclaimed_at`/`needs_profile_reset` selon politique) → webhook `slot.released` → miroir mis à jour.
- Idempotent (libérer un slot déjà libéré = no-op).

**Mode dégradé (LoadBrain injoignable à la vente) :**
- L'allocation **échoue proprement** (erreur typée `LB_UNAVAILABLE`, message client « réessayer », **le slot n'est pas remis** au client). On préfère un échec à une double-vente.
- Le reste du POS (produits non-streaming) **n'est pas affecté**.
- Option implémentée en P2 : **file de retry** côté boutique pour ré-tenter l'allocation d'une commande payée mais non-allouée (statut `PENDING_LB_ALLOC`), réconciliée par un worker, jamais un second débit.

### C. Synchro bidirectionnelle

**Boutique → LoadBrain (écritures) :**
- `allocateSlot` / `releaseSlot` / CRUD compte au moment de l'action (P2/P3).
- **Import initial** : extension de `migrate-from-100pcia.ts` (comptes + MS refresh tokens + slots vendus + tokens actifs + lifecycle), idempotent, réversible.
- **Job de réconciliation** périodique (boutique↔LoadBrain) : détecte toute dérive (slot vendu d'un côté pas de l'autre, statut divergent) et la **soigne** (vérité = LoadBrain), avec rapport.

**LoadBrain → boutique (miroir + temps réel) :**
- **Webhooks signés** (HMAC `signature_sha256` + `X-Internal-Token`) émis depuis une file BullMQ LoadBrain (table `netflix_webhook_deliveries` pour l'audit/retry), sur : `slot.allocated`, `slot.released`, `slot.expired`, `account.updated`, `account.ms_status_changed`, `code.captured` (OTP/HOUSEHOLD).
- **Récepteur boutique** : `POST /api/loadbrain/netflix/webhook` → vérifie signature → **idempotent** (dédup `delivery_id`) → met à jour le miroir → **republie sur `streaming-event-bus`** (qui alimente déjà la SSE `/activer`).

**Admin (deux consoles, une vérité) :**
- `/admin/comptes-partages` (boutique) **conservée** ; ses écritures proxifient vers LoadBrain (P3). Les changements faits dans le dashboard LoadBrain redescendent par webhook. Lecture = miroir local (rapide).

### D. Page d'activation client (white-label préservé)

- On **garde** `src/app/activer/[token]` brandée revendeur (feature réelle : `resellerBrand`, `brandColor`, logo, support).
- Données statiques (email, PIN, branding, `validUntil`) → **miroir local** (rapide, résilient).
- OTP/household temps réel → webhook `code.captured` → `streaming-event-bus` → **SSE existant** → client. Le SSE/heartbeat/`request-code`/`poll` boutique sont **réutilisés tels quels**.
- **Device-quota anti-link-sharing** :
  - **P1–P2** : reste appliqué **localement** (boutique `bumpDeviceUsage` atomique), avec **report d'usage** asynchrone vers LoadBrain (`usage_count`). Activation résiliente.
  - **P3 (cible)** : **centralisé** — `max_uses/usage_count` deviennent autorité LoadBrain ; le gate `/activer` consulte LoadBrain (avec cache local court + fail-closed si quota réellement épuisé). Reste fail-closed et atomique pour préserver la garantie anti-partage.

### E. Cerveau streaming (poller + auto-approve)

- LoadBrain `mailbox.worker.ts` (existe, désactivé) → **ON** (`NETFLIX_ENABLE_MAILBOX=true`) en P1.
- Boutique `streaming-mailbox-watcher.worker.ts` → **OFF** (`STREAMING_DEEPLINK_MODE=false`) **après** validation de parité (dual-run sûr grâce à la dédup `source_email_id` des deux côtés).
- Auto-approve Playwright : déjà côté LoadBrain, inchangé. `callLoadBrainAutoApprove` boutique devient inutile une fois le poller boutique éteint (le poller LoadBrain enchaîne lui-même sur l'auto-approve interne).

## Phasage (zéro casse — chaque phase livrable, testée E2E, réversible)

| Phase | Contenu | Réversibilité | Gate E2E de sortie |
|---|---|---|---|
| **P0 — Fondations** | Surface SDK netflix LoadBrain (`allocateSlot/releaseSlot/getSlot/listAccounts/CRUD/health`) ; émetteur webhooks LoadBrain ; récepteur boutique `/api/loadbrain/netflix/webhook` ; colonnes mapping `lb_account_id/lb_slot_id` ; import initial (extension `migrate-from-100pcia.ts`). **Aucun changement de comportement boutique.** | Trivial (additif) | LoadBrain dashboard affiche l'inventaire complet importé ; webhook test reçu+appliqué au miroir ; SDK contract tests verts. |
| **P1 — Cerveau** | LoadBrain poller ON (dual-run) → parité vérifiée → poller boutique OFF. OTP/household via webhooks → event-bus → SSE. | Flag (`STREAMING_DEEPLINK_MODE`, `NETFLIX_ENABLE_MAILBOX`) | E2E : un email Netflix réel (OTP + household) capté par LoadBrain est livré sur `/activer/[token]` boutique ; auto-approve household déclenché. |
| **P2 — Autorité de vente** | Flag `LB_NETFLIX_AUTHORITATIVE` : checkout → `allocateSlot` ; refund → `releaseSlot` ; allocation locale = fallback si flag off ; file de retry `PENDING_LB_ALLOC` ; réconciliation active. | Flag off → retour allocation locale | E2E : achat streaming → slot alloué par LoadBrain, creds + token rendus, miroir cohérent ; refund → slot rendu ; **test anti-double-vente concurrent**. |
| **P3 — Réplique pure** | Écritures admin boutique proxifiées vers LoadBrain ; device-quota centralisé ; allocation locale retirée (dormante en secours). LoadBrain = vérité bout-en-bout. | Allocation locale dormante réactivable | E2E complet bout-en-bout (cf. plan de tests) sur les 2 consoles + client. |

## Plan de tests E2E (exigence de première classe — « tout testé E2E »)

### Tests unitaires / contrat (par phase)
- **SDK idempotence** : 2 `allocateSlot` avec même `(siteId, orderItemRef)` → **même `lbSlotId`**, une seule allocation en base.
- **Anti-double-vente** : N `allocateSlot` concurrents sur le **dernier** slot du pool → **exactement un** succès, les autres `OUT_OF_STOCK` (test de course réel avec `FOR UPDATE SKIP LOCKED`).
- **Récepteur webhook** : rejoue le même `delivery_id` → appliqué **une seule fois** ; signature invalide → 401 ; mauvais `X-Internal-Token` → 403.
- **Migration** : run → re-run = no-op (idempotent) ; rollback restitue l'état ; tokens préservés.
- **Réconciliation** : dérive injectée (slot vendu LoadBrain, dispo boutique) → détectée + soignée, rapport correct.
- **Device-quota (P3)** : `max_uses` atteint → `/activer` bloque (fail-closed) ; même appareil sous debounce → pas de faux blocage.

### Scénarios E2E (Playwright + stack live)
1. **Vente → activation** : opérateur vend « Netflix Premium » en boutique → slot alloué par LoadBrain → page `/activer/[token]` affiche email/PIN brandés revendeur → client clique « Voir mon code » → email OTP réel capté par poller LoadBrain → **OTP livré en SSE** sur la page.
2. **Household auto-approve** : email « update household » réel → poller LoadBrain → auto-approve Playwright clique le lien → succès marqué ; fallback WhatsApp si échec.
3. **Refund** : commande remboursée en boutique → `releaseSlot` → slot DISPONIBLE chez LoadBrain → webhook → miroir + catalogue boutique reflètent le re-stock.
4. **Désync impossible** : 2 ventes simultanées (boutique + dashboard LoadBrain) sur un pool à 1 slot restant → une seule réussit, l'autre voit « stock épuisé », aucune double-allocation.
5. **Mode dégradé** : LoadBrain coupé → vente streaming échoue proprement (« réessayer »), aucune creds rendue ; à la reprise, la file `PENDING_LB_ALLOC` réconcilie sans double débit.
6. **Deux consoles** : édition d'un compte dans le dashboard LoadBrain → webhook → `/admin/comptes-partages` boutique reflète ; édition côté boutique → proxifiée → visible dans LoadBrain.

**Définition de « done » globale :** les 6 scénarios E2E verts sur stack live + suites unitaires/contrat vertes + `tsc` 0 des deux côtés, avant de retirer l'allocation locale (P3).

## Sécurité

- **Webhooks** : HMAC `signature_sha256` (comparaison à temps constant) + `X-Internal-Token`, anti-rejeu par `delivery_id`, fenêtre de fraîcheur sur timestamp.
- **SDK service-to-service** : `X-API-Key` + `X-Internal-Token` (`LOADBRAIN_*`), jamais exposés au client.
- **Secrets chiffrés au repos** des deux côtés (boutique `encryptedText` AES-256-GCM ; LoadBrain `v1:` AES-256-GCM). Le miroir boutique ne stocke jamais de creds en clair.
- **Validation URL household** : `isNetflixHouseholdUrl` (host strict `www.netflix.com`) appliquée côté LoadBrain (clic Playwright) **et** côté client `/activer` (défense en profondeur) — déjà en place, à conserver.
- **Page `/activer`** : token = seule creds, rate-limit per-IP existant conservé (events 60/min, heartbeat 120/min, request-code & poll 30/min), device-quota fail-closed.
- **Aucune fuite d'erreur upstream** au client/reseller (sanitisation des erreurs SDK/LoadBrain via `toClientError`).

## Contraintes à honorer (vérifiées en planification, non supposées)

1. **Toutes les lectures de slots/comptes côté boutique passent par le miroir Drizzle** — aucune logique de disponibilité ne doit interroger LoadBrain de façon synchrone dans un chemin de lecture (sinon perte de résilience). Étape planif : grep des lectures de disponibilité.
2. **`public_token` LoadBrain accepte la valeur 16-char boutique** sans reformatage — à confirmer sur la contrainte de colonne avant migration (sinon prévoir une table d'alias token→slot).
3. **Le pool d'allocation LoadBrain doit mapper le variant boutique** → besoin d'une correspondance `variantRef ↔ compte/pool netflix` (par `site_id` + identifiant produit). Étape planif : définir la clé de pool (probablement `netflix_accounts` filtrés par produit/variant via un champ dédié).
4. **Dual-run poller sûr** : la dédup `(account_id/digital_code_id, source_email_id)` doit être garantie identique des deux côtés pendant P1 (sinon double traitement OTP). Vérifier les deux index uniques avant d'activer.
5. **Réconciliation = LoadBrain gagne** : règle de résolution de conflit unique et documentée ; la boutique ne « gagne » jamais sur la disponibilité.
6. **Migrations boutique manuelles** : `__drizzle_migrations` est vide sur la DB locale (suivi non automatisé) → appliquer la migration additive à la main comme 0021-0025, idempotente (`IF NOT EXISTS`).

## Coordination cross-repo (obligatoire)

- Passe par le **`chef`** (possède `modules/netflix` LoadBrain + glue boutique). Décomposition + délégation A*/B* + audit.
- Branches miroir : boutique `feat/bsv-mirror-integrated` ↔ LoadBrain `feat/bsv-bulletproof-and-listings`.
- Toute touche au schéma partagé → ligne `[SYNC-LOADBRAIN] <message>` dans `STATUS.md` (boutique) ; le chef synchronise côté LoadBrain.
- **Discipline git** : commits path-scopés (`git commit -- <paths>`), **jamais** `git add .`/`-A` (index partagé entre agents).

## Risques & mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| LoadBrain down à la vente | Vente streaming bloquée | Fail-closed + file de retry `PENDING_LB_ALLOC` (jamais de double débit). Reste du POS intact. |
| Dérive miroir ↔ vérité | Stock affiché faux | Job de réconciliation (LoadBrain gagne) + webhooks idempotents. |
| Double traitement OTP en dual-run P1 | Code livré 2× | Dédup `source_email_id` vérifiée identique avant P1 ; fenêtre dual-run courte. |
| Token existant cassé par migration | Liens client morts | `public_token` = token boutique préservé (contrainte #2) ; sinon table d'alias. |
| Mapping variant→pool incorrect | Mauvais compte alloué | Contrainte #3 traitée en P0 avant toute vente autoritative. |
| Couplage POS (refund/return-to-stock) | Régression caisse | Miroir conservé, chemins refund inchangés ; seul l'appel `releaseSlot` est ajouté. |

## Definition of Done

- P0→P3 livrées, chacune derrière flag et réversible.
- **6 scénarios E2E verts** sur stack live + suites unitaires/contrat vertes + `tsc` 0 des deux côtés.
- LoadBrain = source de vérité unique ; boutique = réplique 100 % fonctionnelle (caisse/commandes/refund/catalogue/activation inchangés pour l'opérateur et le client).
- Zéro désync de vente prouvée par le test de course concurrent et le scénario « deux consoles ».
- Runbook de cutover + rollback documenté ; ligne `[SYNC-LOADBRAIN]` posée ; chef a synchronisé les schémas.
