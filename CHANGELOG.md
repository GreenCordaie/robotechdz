# Changelog - FLEXBOX DIRECT

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

> ⚙️ Convention : **chaque changement fonctionnel ajoute une entrée ici dans le
> même commit/PR**, et la prod se déploie UNIQUEMENT depuis git (plus d'édition
> directe sur prod) — GitHub reste l'unique source de vérité.

## [2026-06-11] — Réconciliation : GitHub redevient la source de vérité

> Découverte chef-projet : ~1 semaine de travail prod (`security.ts`, `caisse`
> /paiements ~1000L, `comptes-partages`, `microsoft-auth`, `AdminSidebar`,
> composants shop) avait été éditée DIRECTEMENT sur prod, jamais commitée
> (capturée dans `prod-snapshot-2026-06-10` / `b06e28e`).

- `merge` : réconcilié le drift prod + la couche dev (money-safety + miroir BSV)
  dans git. 16 conflits résolus par autorité par-fichier (prod pour la refonte
  prod, dev pour la nouvelle couche). tsc clean, **306/306 tests**. — `29987d5`
  - ⚠️ 3 fichiers ont pris un défaut documenté, **validation dev requise avant
    deploy** : `webhook/v2/route.ts` (pris DEV/money-safety), `shop/actions.ts`
    et `dashboard/page.tsx` (pris PROD).

## [2026-06-11] — Miroir BSV dans la marketplace

- `feat(reseller)` : l'onglet Marketplace miroite le catalogue BSV par
  CATÉGORIE → MARQUE → montant, en réutilisant le design existant ; BSV rallumé
  dans la grille (unifié avec G2Bulk, fournisseur caché). Lecture du catalogue
  STABLE (`catalog.list` niveau cluster/SKU), plus les offres volatiles.
  Checkout durci : commande par SKU (auto-fallback LoadBrain → fin des erreurs
  « listing no longer active ») ; `orders.create` sorti de la transaction DB,
  remboursement par-ligne sur échec. — `5b18a22`

## [2026-06-10] — Money-safety reseller/IPTV

- `fix(money-safety)` : durcissement des chemins money reseller/IPTV
  (C1/C2/H1/H2/H3/H5). — `ebdba26`

## [13.0.1] — Deploy pipeline fixes (2026-05-19)

> Hotfix infra découvert pendant le premier deploy v13 sur prod
> (187.124.191.30). Aucune feature, uniquement des fixes de tooling.

### 🚀 deploy.sh — 3 bugs critiques fixés (commit `2c05311`)

1. **Migration order** : `docker compose build app` (= `npm run build`)
   tournait AVANT `drizzle-kit push`. Le build Next.js prerender les pages
   qui query la DB ; si le schéma n'a pas les colonnes attendues par le
   NEW code, le build crash avec `errorMissingColumn`. **Fix** : apply
   les migrations SQL idempotentes via psql AVANT le docker build.

2. **Silent failure** : `git checkout REF | tail -3` masquait l'exit
   code (pipe finit par tail = 0). Quand checkout échouait
   (untracked file blocking, ref invalide, etc.), le script reportait
   `"Already at X — nothing to do"` et retournait SUCCESS. **Fix** :
   `git rev-parse` pour résoudre + `git checkout --force` avec check exit.

3. **Ref unresolvable** : `master` n'existe pas comme branche locale sur
   le VPS → `git checkout master` fail avec `"invalid reference: master"`.
   **Fix** : tente `$REF` puis `origin/$REF` puis abort (résout master,
   tag, short SHA, full SHA, `refs/tags/X`, etc.).

Bonus : working tree dirty auto-stashed avant checkout (safety net).

### 🩺 docker-compose.prod — healthcheck (commit `d8d7ce2`)

Container `robotech-app` marqué `unhealthy` depuis des semaines
(`FailingStreak=365`). **Cause** : Next.js standalone server lit
`$HOSTNAME` pour le bind ; Docker set `HOSTNAME = container ID`
→ Next bind sur l'IP du container, pas sur `127.0.0.1`. Le healthcheck
fait `fetch('http://localhost:3000/...')` depuis l'intérieur → Connection
refused. **Fix** : `HOSTNAME=0.0.0.0` override + healthcheck via `127.0.0.1`.

L'app répondait correctement depuis l'extérieur (Docker route 0.0.0.0:3000
→ container IP), donc personne n'avait remarqué. Mais un autoscaler
ou Traefik route fail-fast l'aurait considéré HS.

### 🔐 Infra deploy mise en route
- Secrets GitHub configurés : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- Deploy key SSH dédiée `github_deploy` sur le VPS, enregistrée en
  read-only sur le repo (avant : 0 deploy avait jamais fonctionné via CI)
- Crons Linux installés sur VPS via wrapper `/usr/local/bin/robotech-cron-webhook` :
  - `* * * * *` retry webhooks
  - `0 3 * * *` cleanup DLQ + notification_logs

### 📊 Bilan déploiement v13.0.0 → prod
- Code : `6f580da` → `d8d7ce2` (post-v13 + tous fixes)
- DB : 28 → 34 tables (migrations 0005–0012 idempotentes appliquées)
- App : healthy, HTTP 200 sur `/api/health` (latence ~170ms)
- Crons : tournent toutes les minutes avec HTTP 200

## [13.0.0] — Marketplace B2B + Webhooks + Notifications (2026-05-16)

> Merge cascade des **20 PRs** (`#1 → #20`) dans master via commit `a1df514`.
> 85 commits, +12 800 / −7 100 lignes. 0 credit consommé. 45 tests E2E
> (41/45 en suite full, 45/45 en isolation — 4 flaky cold-compile).
>
> **Migrations à lancer prod en ordre** : `0005` → `0011` (toutes idempotentes).
> **ENV à set prod** : `CRON_SECRET`, `LOADBRAIN_*`, `WHATSAPP_*`.
> **Cron à configurer** : `GET /api/admin/cron/webhook-retries` toutes les
> minutes avec `Authorization: Bearer $CRON_SECRET`.

### 🔔 PR #20 — EPIC 2/A Toggle auto-WhatsApp kiosk
- **schema** : colonne `shop_settings.auto_send_whatsapp` (default TRUE, préserve historique).
- **delivery** : guard dans `triggerOrderDelivery` — skip si désactivé. Param
  `forceManual` (bypass guard) utilisé par `resendWhatsAppAction` côté caisse.
- **UI** : toggle dans onglet Sécurité & God Mode + save button dédié à la section.
- **tests** : 1 spec E2E (toggle persiste après reload).

### 📝 PR #19 — EPIC 1/L Templates notifications configurables admin
- **schema** : table `notification_templates` (PK event_key, body, updated_at, updated_by_user_id).
- **service** : `notification-templates.service` avec `loadTemplate` (DB → fallback
  default hardcodé) + helper `renderTemplate({{key}}` → `vars[key]`).
- **refactor** : `reseller-notifications.service` — 5 méthodes utilisent désormais
  `loadAndRender` (fini les templates inline dans le code).
- **UI admin** : `/admin/settings/notifications` — liste, edit textarea, preview
  server-side avec sample vars, save UPSERT, reset au défaut.
- **safety** : si row DB body vide → fallback default au render.
- **tests** : 3 specs E2E.

### 🎚️ PR #18 — EPIC 1/K Préférences notif WhatsApp par event reseller
- **schema** : colonne JSONB `resellers.notification_preferences` (opt-in par défaut).
- **service** : `isResellerNotifEnabled(resellerId, eventKey)` — clé manquante
  = `true`. `safeSend` respecte la préf, retourne `{delivered:false, reason:"Désactivé par le reseller"}`.
- **catalog** : 5 events (`wallet.recharged`, `signup.approved`, `signup.rejected`,
  `order.confirmed`, `order.credentials.ready`).
- **UI reseller** : `/reseller/settings/notifications` — toggles persistants avec
  optimistic update + rollback en cas d'erreur.
- **sidebar** : lien "Notifications" dans section Assistance.
- **tests** : 3 specs E2E.

### 🔗 PR #17 — EPIC 1/I2 Sidebar reseller : section Intégrations
- **UI** : nouvelle sous-section "Intégrations" en bas du menu reseller —
  "Mes Webhooks" + "API & Docs" (ouvre `/api-docs` dans nouvel onglet).
- **tests** : 2 specs E2E (présence + navigation).

### 💀 PR #16 — EPIC 1/G3 Webhook DLQ retry + admin UI
- **schema** : table `webhook_delivery_attempts` (RETRYING/DEAD/RESOLVED).
- **dispatcher** : enqueue retry-row si livraison échoue.
  Backoff exp **1m / 5m / 30m / 2h / 6h** (max 5 attempts).
- **service** : `webhook-retry.service` — `processWebhookRetries()` +
  `replayDeadAttempt()` + `getDlqStats()`.
- **cron route** : `/api/admin/cron/webhook-retries` (Bearer `CRON_SECRET`
  timing-safe via `crypto.timingSafeEqual`).
- **UI admin** : `/admin/b2b/webhooks/dlq` — KPIs (Retrying / Dead / Resolved),
  filtres status, actions Replay (DEAD → RETRYING) / Dismiss (delete).
- **architecture** : DB-only DLQ (pas BullMQ) pour rester portable Edge/Node.
- **tests** : 6 specs E2E (page + filtres + lien depuis vue webhooks + cron 401/200).

### 🛠️ PR #15 — EPIC 1/G2 Admin webhooks overview (SAV)
- **UI admin** : `/admin/b2b/webhooks` — vue globale TOUS resellers,
  filtres ALL/ACTIVE/INACTIVE/FAILING (failing = actif + ratio échec > 30%).
- **KPIs** : Total / Actifs / Inactifs / Failing / Livraisons OK+KO.
- **actions** : force désactivation avec raison obligatoire (audit log
  `WEBHOOK_FORCE_DISABLED`) + réactivation avec reset compteurs (audit log
  `WEBHOOK_REACTIVATED`).
- **tests** : 2 specs E2E.

### 📖 PR #14 — EPIC 1/I Doc OpenAPI publique
- **public/openapi.yaml** : spec OpenAPI 3.1 avec 6 endpoints + 3 webhooks documentés.
- **UI** : `/api-docs` — Stoplight Elements via CDN (zéro npm dep ajoutée),
  layout sidebar avec hash routing.
- **tests** : 1 spec E2E.

### 🧹 PR #13 — EPIC 11 ESLint strict 0 erreurs
- **fix** : 2 vraies React bugs détectés (`React.useMemo` inline en JSX,
  rules-of-hooks dans `ClientsContent.tsx` + `ClientsMobile.tsx`).
- **fix** : 15 `react/no-unescaped-entities` (apostrophes / guillemets).
- **build** : `next.config.mjs` — `eslint.ignoreDuringBuilds: false`
  (le build crashe désormais sur toute régression lint).

### 📡 PR #12 — EPIC 1/G Outbound webhooks reseller (HMAC-SHA256)
- **schema** : table `reseller_webhooks` (CSV events, secret HMAC, stats).
- **service** : `webhook-dispatcher.service` — `dispatchResellerEvent` async
  fire-and-forget, timeout 10s, SSRF protection, signature HMAC-SHA256 dans
  header `X-Robotech-Signature`, delivery ID unique.
- **integration** : 3 events câblés (`order.paid` post-checkout,
  `wallet.recharged` post-recharge, `credentials.ready` post-provisioning LoadBrain).
- **UI reseller** : `/reseller/webhooks` — CRUD avec secret affiché 1× à la
  création, validation URL HTTPS, SSRF protection côté action.

### 🤖 PR #11 — EPIC 6/2 Auto-WhatsApp post-checkout B2B + provisioning
- **wallet.actions** : `checkoutResellerAction` → `notifyOrderConfirmed`
  (no-op safe si WAHA non configuré).
- **iptv-webhook-processor** : `notifyOrderCredentialsReady` post-provisioning
  LoadBrain réussi (avec aperçu credentials).

### 💸 PR #10 — EPIC 6 Auto-WhatsApp post-recharge / signup-approve / signup-reject
- **service** : `src/services/reseller-notifications.service.ts` — 5 méthodes
  avec templates centralisés + `safeSend` no-op safe.
- **integration** : 3 events câblés (`notifyWalletRecharged`,
  `notifySignupApproved`, `notifySignupRejected`).
- **UI** : polish wallet — bouton "Recharger" ouvre modal instructions
  (contact boutique + WhatsApp deep-link), pas paiement en ligne.

### 💰 PR #9 — EPIC 1/H Recharge wallet manuelle admin (cash boutique)
- **UI admin** : `/admin/b2b/wallets` — liste resellers + KPIs + modal recharge
  avec méthode (CASH/CIB/EDAHABIA/BANK_TRANSFER/OTHER) + référence + audit log.
- **action** : `adminRechargeWalletAction` — Zod validation, transaction atomique,
  trigger notif WhatsApp post-recharge.

### 📝 PR #8 — EPIC 1/E+J Signup reseller public + queue admin
- **schema** : table `reseller_signup_requests` (PENDING/APPROVED/REJECTED).
- **UI public** : `/reseller/signup` — form Zod, honeypot anti-bot,
  rate-limit IP 3/h.
- **middleware** : `/reseller/signup` ajouté aux public paths.
- **UI admin** : `/admin/b2b/signups` — queue avec filtres, modal d'approbation
  qui crée user + reseller + wallet + tier en transaction, affiche credentials
  générés en backup si l'envoi WhatsApp échoue.



### 🚨 PR #1 — EPIC 0 Stabilisation
- **build** : retrait de `typescript.ignoreBuildErrors: true` (bombe désactivée).
  Le build crashe désormais sur toute régression de typage.
- **build** : conservé `eslint.ignoreDuringBuilds: true` pour ne pas bloquer
  sur warnings préexistants (cleanup planifié EPIC 11).
- **repo hygiene** : retrait du tracking de `tmp/` (74 fichiers debug contenant
  des données réelles clients/Microsoft), `backups/v1.5-evo-bot/`, 23 logs
  `.txt` à la racine, 11 scripts debug, `tsconfig.tsbuildinfo`, `.bak`.
  ⚠️ historique remote **non purgé** — `git filter-repo` à faire pour rotation.
- **env** : `.env.example` complété avec 18 variables manquantes
  (TURNSTILE_*, MICROSOFT_*, LOADBRAIN_*, GROQ_API_KEY, UPSTASH_*, VAPID_*,
  WHATSAPP_API_KEY, WHATSAPP_VERIFY_TOKEN, ENABLE_DEBUG_ROUTES).
- **env** : nouveau `src/lib/env.ts` (validation Zod runtime au boot Node).
- **drizzle** : retrait du fallback `DATABASE_URL` hardcodé avec password
  dans `drizzle.config.ts`.
- **encryption** : fallback `SESSION_SECRET → ENCRYPTION_KEY` conservé pour
  ne pas casser les données chiffrées en prod, **+ warning explicite**.
  Migration de rotation propre planifiée EPIC 8.
- **security** : 3 routes debug (`/api/debug-codes`, `/api/diag-netflix`,
  `/api/list-all-emails`) désormais en 404 en production sauf si
  `ENABLE_DEBUG_ROUTES=true` (helper `guardDebugRoute`).
- **security** : suivi public `/suivi/[orderNumber]` — validation téléphone
  passée de 4 chiffres (~10K combos) à **6 chiffres** (~1M combos) pour
  résister au brute-force.
- **bug critical** : `reverseSupplierDebits` était susceptible de double-rembourser
  un fournisseur si appelé 2× pour la même order. Idempotence via marker
  `REVERSAL:` dans `reason` + check au début de la fonction.
- **B2B UX** : wallet reseller — retrait des stats hardcodées `12,500 DZD volume`
  et `625 DZD savings`. Calcul depuis transactions réelles du mois en cours.
- **B2B UX** : bouton "Recharger le Compte" masqué (recâblage EPIC 14).
- **typing** : 9 erreurs TS réelles fixées dans push/actions, SettingsMobile,
  PushNotificationManager, rate-limit.service. Total 37 → 0.
- **tsconfig** : `scripts/`, `drizzle/`, `public/` exclus du `tsc`.

### 🏗️ PR #2 — EPIC 1 Tier system (Bronze / Silver / Gold)
- **schema** : nouvelle table `reseller_tiers` (id, name unique, discount_pct,
  min_monthly_volume_dzd, color, is_default, rank).
- **schema** : colonne `tier_id` (FK) sur `resellers` — ON DELETE SET NULL
  pour rester safe.
- **schema** : `reseller_visible` (default true) + `reseller_price_override_dzd`
  (nullable) sur `product_variants`.
- **migration** : `drizzle/0005_epic_1_marketplace_foundation.sql` écrite à la
  main, idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `INSERT ... ON CONFLICT DO NOTHING`). Seed Bronze (0%) / Silver (5% à 50k)
  / Gold (10% à 200k). Backfill : assigne BRONZE aux resellers existants.
- **drizzle** : re-track des migrations legacy `0000–0004` qui avaient été
  silencieusement retirées du tracking par le commit `440787c` (release 10.1.1).
- **service** : `src/services/tier.service.ts` — getDefaultTier (cache 10min),
  getCurrentTierForReseller, getMonthlyPurchaseVolume, recalculateTierForReseller,
  applyTierDiscount.
- **B2B checkout** : `checkoutResellerAction` utilise `reseller_price_override_dzd`
  > `salePriceDzd`, applique le discount tier puis `customDiscount` (capé 100%),
  enrichit la description transaction (`[GOLD -10% +custom -2%]`), recalcule
  async le tier post-checkout pour promotion automatique.
- **UI** : badge "Palier BRONZE/SILVER/GOLD -X%" coloré dans wallet reseller +
  progress bar vers palier suivant basée sur volume mensuel réel.
- **i18n stub** : `getCurrentResellerAction` retourne désormais le `tier` joint
  + `monthlyVolume`.

### 🛒 PR #3 — EPIC 2/A Catalogue reseller fonctionnel
- **bug critical** : `/reseller/shop` appelait `getPaginatedProducts` qui exige
  les rôles ADMIN/CAISSIER/TRAITEUR → un vrai RESELLER était rejeté → **le shop
  n'a jamais fonctionné en production**. Remplacé par `getResellerCatalogAction`.
- **bug critical** : le bouton "Panier" n'avait pas `onClick={onOpen}` → modal
  de checkout **jamais ouvert** → aucune commande B2B possible via l'UI.
- **action** : `getResellerCatalogAction` filtre `reseller_visible=true`,
  calcule stock disponible temps réel (codes + slots), pricing tier-aware,
  pagination + recherche + filtre catégorie.
- **UI** : badges livraison par produit — **Instant** (cyan, LoadBrain auto),
  **Stock N** (emerald > 5, amber ≤ 5), **Sur demande** (slate).
- **UI** : cart bloque l'ajout au-delà du stock. Recherche debounced 300ms.
  Filtres Tout / Instant / En stock.
- **types** : `ResellerCatalogItem` + `ResellerCatalogPricing` exportés.
  Suppression des `useState<any>` / `(props: any)`.

### 🧪 PR #4 — E2E foundation + 2 bugs production
- **infra** : `docker-compose.test.yml` (postgres:16 + redis:7 sur 5499/6499
  isolés des ports prod / LoadBrain voisin).
- **infra** : `.env.test` — toutes les clés externes vides → court-circuit
  → zéro appel sortant possible.
- **infra** : `scripts/seed-e2e.ts` idempotent (admin + reseller + 3 tiers +
  product Netflix Premium avec 3 variants : stock / LoadBrain / kiosk-only),
  protégé contre l'exécution sur autre que `pc_ia_test`.
- **playwright** : `playwright.config.ts` (Chromium, port 4555, workers=1) +
  10 specs initiales.
- **bug critical** : `loginResellerAction` + `loginAction` crashaient avec
  `TypeError: Cannot read properties of undefined (reading 'getTime')` sur
  `limit.blockedUntil!.getTime()` quand `RateLimitService.checkLimit` faisait
  fail-closed (Redis down). Tout login admin + reseller en 500. **Fix** :
  fallback `15 minutes` si `blockedUntil` undefined.
- **bug critical** : `new Redis({ url: process.env.UPSTASH_REDIS_REST_URL! })`
  crashait au boot si l'env absente. Combiné au fail-closed du rate-limit =
  SPOF total : Upstash down → aucun login possible. **Fix** : client no-op
  fallback si vars absentes (warning loggé en prod).

### ⚡ PR #5 — EPIC 2/C LoadBrain Marketplace admin (GOAL FINAL)
- **service** : `src/services/loadbrain-marketplace.service.ts` avec
  - `listAvailableServices()` — appel SDK en prod, **8 fixtures** en dev/test
    (AtlasPro 1m/3m/12m, IronMax 1m/12m, PanelKing365, IBO yearly/lifetime).
  - `linkServiceToProduct()` — crée product + variant avec `loadbrainSlug`
    comme pivot → provisioning automatique au checkout reseller.
  - `unlinkSlugFromVariant()` — détache un slug sans toucher au stock.
- **UI admin** : `/admin/iptv/loadbrain-services` avec grid responsive, filtres
  Tous / À lier / Déjà liés, modal de liaison avec préfill intelligent
  (prix kiosque = achat × 1.4, prix reseller = achat × 1.2).
- **fix UI** : badge tier était caché si discount=0% (Bronze) — affichage
  "Tarif standard" désormais visible.

### 🔑 PR #6 — EPIC 2/D Credentials reseller + Send-to-client
- **bug critical** : `/reseller/orders` affichait "Articles en gros" hardcodé
  au lieu des vrais noms produits, et **n'avait aucun moyen d'afficher les
  credentials achetées** (codes en DB mais inaccessibles UI). Fix : refonte
  complète + modal détail.
- **action** : `getResellerOrderDetailAction` — fetch order + items + 4 joins,
  déchiffre côté serveur (codes / slots / iptv_provisions credentials JSON),
  vérifie ownership (orderId + resellerId match).
- **action** : `sendCredentialsToClientAction` — Zod validation (phone regex
  +213…), no-op safe en dev (WHATSAPP non configuré), enqueue BullMQ
  `SEND_WHATSAPP` en prod.
- **UI** : modal détail 3xl scrollable, par item : codes standards + profils
  partagés (parentCode + PIN) + IPTV LoadBrain (status visuel Livré / En cours
  / Échec + credentials déchiffrées dynamiquement).
- **UI** : bouton "Envoyer au client" → modal WhatsApp avec phone + message
  custom 500 char.

### 🤖 PR #7 — CI GitHub Actions (READY)
- **workflow** : `.github/workflows/ci.yml` — trigger sur push + PR sur
  `master`/`avant-netflix-n8n`/`epic-**`, concurrency `cancel-in-progress`.
- **job typecheck** : `tsc --noEmit` strict (bloquant), `eslint` soft.
- **job e2e** : services Docker postgres:16 + redis:7, cache Playwright
  browsers + npm, `drizzle-kit push`, seed E2E, dev server :4555, run
  14 tests Playwright, upload artifacts si fail.
- **deps pinning** : `@heroui/react`, `@heroui/theme`, `drizzle-orm`, `drizzle-kit`,
  `lucide-react`, `postgres` étaient à `"latest"` — pinned aux versions exactes
  locales. **Bombe à retardement éliminée** (50 erreurs TS CI résolues).
- **vendor stubs** : `vendor/loadbrain-{sdk,site-integration}-stub/` no-op
  pour satisfaire les imports statiques en CI où le vrai SDK privé est
  indisponible. `scripts/ci-pack-loadbrain-stubs.sh` avec guard `CI=true`
  pour ne JAMAIS écraser les vrais `.tgz` en local.

### 🔧 Métriques globales de la session
- **EPICs avancés** : 5 (0, 1, 2/A, 2/C, 2/D) + 2 infra (E2E, CI)
- **PRs draft** : 7 (PR #7 ready, #1-#6 draft)
- **Commits atomiques** : 18
- **Lignes ajoutées** : +2 800
- **Lignes supprimées** : −6 100 (cleanup repo)
- **Tests E2E** : 14/14 PASS (local 27s, CI Linux 8m26)
- **Bugs production critiques fixés** : 5 (3 auth/Redis + 2 UI)
- **Bombes à retardement éliminées** : 1 (deps `"latest"`)
- **TypeScript final** : 0 erreurs (strict enforced)
- **Credits consommés** : 0 (LoadBrain, Telegram, WhatsApp, Microsoft Graph)
- **Achats / commandes** : 0
- **Deploys déclenchés** : 0

---

## [12.2.0] - 2026-04-25

### 🚀 Iron Max TV — Second Provider IPTV

#### Multi-Provider IPTV
- **Iron Max TV** ajouté comme second provider IPTV aux côtés de King365TV
- 5 variantes : 12 Mois, 6 Mois, 3 Mois, 1 Mois, Trial 2 Jours
- Slugs : `ironmax-12m`, `ironmax-6m`, `ironmax-3m`, `ironmax-1m`, `ironmax-trial`
- Mappings LoadBrain créés — provisioning automatique (~25s)
- Webhook Iron Max → credentials en clair (username, password, M3U, EPG)
- Architecture multi-provider validée — aucun code modifié, tout fonctionne par configuration

#### Corrections additionnelles
- Nettoyage DB : suppression produits test "karim test king365"
- Nettoyage LoadBrain : doublons de mappings identifiés (à supprimer côté LoadBrain)
- Commandes orphelines nettoyées (8 tests supprimés, 2 annulées)
- SDK LoadBrain v3.1.0 — `createNextWebhookHandler` + `expiresAt` DD-MM-YYYY parsing

## [12.1.0] - 2026-04-25

### 🔒 Audit de Sécurité & Corrections — 21 fixes

#### CRITIQUES (9 corrigés)
- **HMAC constant-time** — `timingSafeEqual` au lieu de `!==` dans webhook LoadBrain
- **Idempotency TOCTOU** — check déplacé dans la transaction DB
- **Rate-limit atomique** — EXPIRE toujours appelé + try/catch anti-lockout permanent
- **Telegram fallback hardcodé** — `"flexbox_secure_token_2026"` supprimé, fail si absent
- **IPTV credentials masquées** — password `••••••••` dans Telegram (plus de plaintext)
- **PIN verification** — `session.user.id` → `session.userId` (écran PIN fonctionnel)
- **Settings publics** — `/api/v1/public/settings` filtre les tokens/secrets/clés API
- **require() client** — remplacé par `fetch()` dans la page Modules
- **deliveryMethod case** — `"whatsapp"` → `"WHATSAPP"` (bouton resend visible)

#### HIGH (10 corrigés)
- **decrypt null-check** — guard `s.digitalCode?.code` avant décryptage (2 endroits)
- **/api/health** — détails protégés par CRON_SECRET (public = juste "ok")
- **IPTV retry** — provisions `queued` bloquées maintenant retryable
- **OrderStatus.TERMINE** — enum au lieu de string hardcodé
- **JSON.parse** — try/catch retourne 400 au lieu de 500
- **checkExpiringProvisions** — utilise `expiresAt` avec threshold réel
- **Turnstile** — token requis si configuré (plus de bypass)
- **CredentialCard** — `screen.expiresAt` au lieu de `completedAt`
- **n8n event** — `ORDER_PAID` au lieu de `ORDER_PRINTED`
- **Dashboard mobile** — +/- pourcentage avec couleur conditionnelle

#### MEDIUM (2 corrigés)
- **useSettingsStore** — appel unique au lieu de double souscription
- **expiresAt date format** — parsing DD-MM-YYYY (format LoadBrain)

## [12.0.0] - 2026-04-24

### 🚀 Release v12.0.0 — LoadBrain IPTV Integration

Intégration complète du module LoadBrain pour le provisionnement automatique IPTV (King365).

#### 📦 Module LoadBrain SDK v3.0.1
- `@loadbrain/sdk@3.0.1` + `@loadbrain/site-integration@3.0.1` installés
- Proxy sécurisé via `createNextRouteHandler()` — API key jamais exposée au navigateur
- `ProductManager` avec `apiBasePath` — mapping produits → plans LoadBrain
- Config `siteUrl` pour les webhooks automatiques

#### 🗄️ Schema DB
- `loadbrainSlug` sur `product_variants` — liaison variante → plan LoadBrain
- Table `iptv_provisions` — suivi provisioning (taskId, status, credentials encryptées)

#### ⚡ Pipeline Commande IPTV
- `allocateOrderStock()` skip les items IPTV (provisionnés via LoadBrain)
- `payOrder()` dispatch automatique `provisionIptvOrder()` après paiement
- **Polling automatique** — vérifie le task LoadBrain toutes les 5s pendant 60s
- Si le task est `completed`, injecte les credentials en DB + marque TERMINE + envoie WhatsApp
- Guard `ORDER_DELIVERED` — empêche l'envoi WhatsApp prématuré pour les commandes IPTV

#### 📡 Webhook Handler
- `/api/loadbrain/webhook` — vérifie signature HMAC, crée `digital_codes`, complète la commande
- Fallback HMAC avec 3 variantes de body (raw, trimmed, re-stringified)
- Validation idempotency — skip si credentials déjà existantes
- Events `IPTV_PROVISION_COMPLETED` et `IPTV_PROVISION_FAILED` publiés

#### 📱 WhatsApp IPTV
- Message formaté : username, mot de passe, M3U URL, EPG URL
- M3U construit automatiquement si LoadBrain retourne vide
- Instructions IPTV (Smarters, TiviMate) envoyées après les credentials

#### 🖥️ Pages Admin
- **`/admin/iptv`** — liste des lignes provisionnées avec credentials, filtres, statuts
- Boutons : Relancer, Renvoyer webhook, Annuler, Renouveler, Saisie manuelle
- Statut "cancelled" ajouté
- **`/admin/modules`** — ProductManager LoadBrain v3.0.0, exports listés
- **Dashboard** — carte IPTV sur desktop + mobile
- **Traitement** — items IPTV affichent "IPTV LoadBrain — Provisionnement automatique" au lieu des champs code
- **Commandes** — statut IPTV dans le détail commande

#### 🛒 Kiosk
- Produits IPTV visibles avec badge cyan "Auto"
- Stock IPTV = "Disponible — Instant" (pas de compteur)
- `loadbrainSlug` exposé au frontend pour détection

#### 📋 Catalogue Admin
- Champ "LoadBrain Slug (IPTV)" dans le formulaire variante
- Validation slug — vérifie que le slug existe dans LoadBrain avant création
- Visible uniquement quand "Livraison manuelle" est désactivé

#### 🔒 Sécurité
- Proxy `/api/loadbrain/[...path]` avec path allowlist
- `/api/loadbrain/provision-status` avec auth session
- `/admin/iptv` dans le middleware RBAC whitelist (ADMIN, SUPER_ADMIN, CAISSIER, TRAITEUR)

#### ⏰ Cron Expiration
- `/api/admin/cron/iptv-expiry` — alerte Telegram pour lignes expirant dans 3 jours

## [11.1.0] - 2026-04-11

### 🔔 Notifications Push & PWA + Netflix Multi-Compte

#### Notifications Push (Badge icône)
- **Badge compteur** sur l'icône de l'app (comme WhatsApp/Facebook) via Badging API
- **Push automatiques** : nouvelle commande payée → notification ADMIN + CAISSIER
- **Auto-subscribe** au login si permission déjà accordée
- **Clear badge** à l'ouverture de l'app
- **Toggle dans Paramètres** : switch ON/OFF avec liste des événements notifiés

#### PWA Double Manifest (Admin + Kiosk)
- **2 manifests séparés** : `/api/admin-manifest` (scope `/admin`) et `/api/kiosk-manifest` (scope `/kiosk`)
- Installables **indépendamment** — installer le kiosk ne bloque pas l'installation admin
- Chaque manifest a son propre `id`, `scope`, `start_url`
- Suppression du `manifest.ts` racine (remplacé par les routes API)

#### Icônes PWA
- **4 icônes générées** via Sharp : 192px + 512px, versions `maskable` (padding 20%) et `any`
- **Badge notification** : `badge-96.png` pour la barre des tâches du téléphone
- Logo correctement dimensionné, plus de rognage

#### Bandeau Installation Kiosk
- Bannière orange "Installez [nom boutique] sur votre appareil" avec bouton Installer
- Disparaît si déjà installé ou fermé

#### Netflix Multi-Compte (Disambiguation)
- **Sélection par index** : client répond "1", "2" pour choisir le bon compte
- **Match partiel email** : client tape "john" → match `john@outlook.com` (min 4 chars)
- **Message amélioré** : liste numérotée claire avec instructions
- Conserve aussi le match par n° commande et profil

## [11.0.1] - 2026-04-11

### 🐛 Fix: Livraison WhatsApp automatique

**Problème** : Les messages WhatsApp ne partaient pas automatiquement après paiement/validation d'une commande, mais le bouton "Renvoyer" fonctionnait.

**Cause racine** (2 bugs) :
1. **EventBus double instance** : En production, `AppEventBus.instance` (variable statique) et `globalThis.__eventBus` créaient 2 instances séparées. L'événement `ORDER_DELIVERED` était émis sur une instance, le worker écoutait sur l'autre.
2. **BullMQ inaccessible** : Le bundle standalone Next.js n'inclut pas `ioredis`/`bullmq` — la queue échouait silencieusement sans jamais exécuter le job de livraison.

**Corrections** :
- **`src/lib/events.ts`** : EventBus utilise `globalThis` en production aussi (plus de double instance)
- **`src/workers/notification.worker.ts`** : `ORDER_DELIVERED` appelle `triggerOrderDelivery()` directement (bypass BullMQ). Idem pour `ORDER_PAID` et `ORDER_PRINTED` → appels directs à `N8nService`

## [11.0.0] - 2026-04-10

### 🚀 Release v11.0.0 — Production VPS

Migration complète de l'infrastructure locale vers un VPS dédié (Ubuntu 24.04, 8 Go RAM). L'application tourne désormais 24/7 sans dépendance au PC local.

#### 🏗️ Infrastructure & Déploiement
- **VPS Production** : Déploiement Docker complet sur serveur dédié (187.124.191.30)
- **Docker Compose Production** : `docker-compose.prod.yml` avec 6 services (App, PostgreSQL, Redis, n8n, WAHA, MongoDB)
- **Dockerfile optimisé** : Build multi-stage Next.js standalone, user non-root (`nextjs`)
- **Cloudflare Tunnel** : Installé en service systemd sur le VPS (plus besoin de cloudflared local)
- **Tailscale VPN** : Réseau privé entre VPS et PC caisse pour l'impression thermique
- **Script de déploiement** : `deploy.sh` (setup, deploy, update, status, logs, backup, restore)
- **`.env.production.example`** : Template documenté pour toutes les variables d'environnement

#### 🔒 Audit de Sécurité & Corrections
- **CRITICAL** : Endpoints debug (`/api/debug-codes`, `/api/diag-netflix`, `/api/list-all-emails`) protégés par `CRON_SECRET`
- **CRITICAL** : Validation `SESSION_SECRET` ≥ 32 caractères au démarrage (`jwt.ts`)
- **HIGH** : SSH durci — `PasswordAuthentication no`, clé SSH uniquement
- **HIGH** : Fail2ban configuré — 3 tentatives max, ban 1h
- **HIGH** : Rate-limit fail-closed — bloque quand Redis est indisponible (au lieu de laisser passer)
- **HIGH** : Healthchecks Docker sur tous les services (app, db, redis, n8n)
- **HIGH** : Limites CPU/RAM par container (prévention DoS)
- **HIGH** : WAHA `WHATSAPP_API_KEY` sans valeur par défaut (crash si non configuré)
- **MEDIUM** : Port PostgreSQL exposé uniquement en `127.0.0.1` (+ Tailscale pour le build)
- **MEDIUM** : Firewall UFW — ports 22, 80, 443 uniquement

#### 🖨️ Impression Thermique via Tailscale
- **`printer.ts`** : `PRINT_SERVICE_URL` configurable via variable d'environnement (plus de `127.0.0.1` en dur)
- **`print-service/server.js`** : Écoute sur `0.0.0.0`, autorise le réseau Tailscale (`100.x.x.x`)
- **`print-service/config.json`** : `serverUrl` pointe vers le VPS via Tailscale (`http://100.97.177.62:3000`)

#### 📱 Corrections UI
- **MobileNavbar** : Texte qui dépasse corrigé — `"Validation"` → `"Traiter"`, `flex-1` + `truncate` sur les labels

#### ⚙️ Configuration Next.js
- **`next.config.mjs`** : Ajout `output: 'standalone'` pour le build Docker
- **`.dockerignore`** : Exclusion node_modules, .git, backups, tmp

#### 📝 Fichiers modifiés
- `docker-compose.prod.yml` (nouveau)
- `deploy.sh` (nouveau)
- `.env.production.example` (nouveau)
- `.dockerignore` (nouveau)
- `next.config.mjs`
- `Dockerfile`
- `start.bat`
- `src/app/api/debug-codes/route.ts`
- `src/app/api/diag-netflix/route.ts`
- `src/app/api/list-all-emails/route.ts`
- `src/lib/jwt.ts`
- `src/lib/printer.ts`
- `src/services/rate-limit.service.ts`
- `src/components/admin/MobileNavbar.tsx`
- `print-service/config.json`
- `print-service/server.js`

## [10.1.1] - 2026-04-06

### 🚀 Release v10.1.1 (Stable)
- **Sauvegarde Stable** : Snapshot global de la version de production 10.1.1.
- **Automatisation & Netflix** : Intégration complète de la livraison automatisée des codes via WhatsApp et Node.js.
- **Corrections Frontend** : Résolution des avertissements pour les balises méta, les images et les erreurs Service Worker (Cloudflare beacon).
- **Core SaaS** : Déploiement et finalisation de l'infrastructure Aurum Terminal.

## [9.0.1] - 2026-03-30

### ⚡ Performance & Optimisation (Stable)
Implémentation complète — build OK, zéro régression.

**Phase 1 — Skeletons (13 fichiers créés)**
- `src/components/admin/PageSkeleton.tsx` : composants réutilisables (`SkeletonBlock`, `SkeletonStat`, `SkeletonRow`, `SkeletonCard`, `SkeletonPageHeader`).
- Ajout de `loading.tsx` sur toutes les routes : `admin/`, `dashboard`, `analytics`, `catalogue`, `clients`, `commandes`, `support`, `fournisseurs`, `traitement`, `b2b`, `comptes-partages`, `monitoring`, `settings`.

**Phase 2 — Lazy loading (10 fichiers modifiés)**
- Les 17 modals sont maintenant des chunks séparés, chargés uniquement à l'ouverture : `CommandesContent`, `ClientsContent`, `CatalogueMobile`, `SuppliersContent`, `SuppliersMobile`, `TraitementContent`, `TraitementMobile`, `B2bMobile`, `CaisseContent`, `CaisseMobile`.

**Phase 3 — Incremental Static Regeneration (ISR) (7 pages modifiées)**
- `dashboard` : revalidate=300 (au lieu de rien)
- `analytics` : revalidate=300 (au lieu de rien)
- `catalogue` : revalidate=60 (au lieu de force-dynamic)
- `clients` : revalidate=60 (au lieu de force-dynamic)
- `fournisseurs` : revalidate=60 (au lieu de force-dynamic)
- `b2b` : revalidate=60 (au lieu de force-dynamic)
- `commandes` : revalidate=120 (au lieu de rien)

**Résultat attendu** : Navigation < 300ms, zéro écran blanc, bundle JS réduit de ~35–40% sur les pages avec modals.

## [9.0.0] - 2026-03-29

### 🚀 Release Majeure v9.0.0 (Stable)
- **UI & Clients** : Améliorations majeures de l'interface utilisateur et gestion complète CRUD pour les clients.
- **Automatisation** : Implémentation des mécanismes d'automatisation (webhook, tunnels).
- **Achats & Commandes** : Implémentation complète de la gestion des achats.
- **Base de données** : Nouvelles actions et résolveurs de données.
- **Stabilisation** : Préparation de la version finale v9.

## [8.0.1] - 2026-03-28

### 🛡️ Architecture & Synchronisation (Stable Release)
- **Auto-Sync n8n** : L'orchestrateur (`scripts/start-dev.js`) détecte et sauvegarde désormais automatiquement l'URL Cloudflare de n8n en base de données.
- **Chemin Unifié** : Alignement du service n8n sur le gateway de production (`flexbox-gateway`) et passage à un format de données "plat" pour une compatibilité totale.
- **Garantie Livraison** : Implémentation d'un fallback direct WhatsApp (WAHA) si le workflow n8n est injoignable.
- **Persistance Singletons** : Correction des fuites de mémoire et pertes d'écouteurs d'événements grâce au pattern `globalThis`.
- **Fix Monitoring** : Résolution de l'erreur de compilation sur le tableau de bord de monitoring (Client Component).
 
## [8.0.0] - 2026-03-28

### 🛡️ Robustesse & Notifications (Stable Core)
- **Pattern "N8n + Fallback"** : Implémentation d'une architecture de notification redondante. Si n8n est indisponible, le système bascule automatiquement sur l'API WhatsApp directe pour garantir la livraison.
- **Versements Dettes** : Les remboursements manuels déclenchent désormais une notification immédiate incluant le montant versé et le **solde actualisé (Reste à payer)**.
- **Centralisation** : Création de `src/lib/notifications.ts` pour uniformiser les alertes système.

## [7.3.6] - 2026-03-28

### 🖨️ Logique d'Impression & WhatsApp
- **Impression Intelligente** : Désactivation de l'impression automatique pour les commandes avec livraison "WhatsApp" afin d'éviter le gaspillage de papier.
- **Visibilité Totale** : Le montant final est désormais affiché sous le libellé "**TOTAL A PAYER**" en majuscules et en grand format (Gras + Double Taille) pour les commandes soldées ou avec remise.
- **Correction Kiosk** : Suppression du déclenchement d'impression prématuré lors de la création d'une commande au Kiosk.
- **WhatsApp Enrichment** : Ajout du "Total Dette Client" dans les notifications de paiement WhatsApp pour une meilleure transparence.

### 🛠️ Corrections de Stabilité
- **Encoding Repair** : Correction globale des caractères corrompus (UTF-8) dans les messages de succès et de retour du module Caisse.


## [7.3.5] - 2026-03-24

### 🖨️ Synchronisation Impression
- **Automatisme Traitement** : Le module de traitement utilise désormais la file d'impression centralisée (`requeueForPrint`), éliminant les boîtes de dialogue manuelles du navigateur.
- **Expérience Unifiée** : Alignement de la logique d'impression Desktop et Mobile sur celle du module Caisse pour une meilleure fiabilité.

### 📊 Profit → Analytics (Rentabilité)
- **Catalogue** : Suppression de la colonne/carte "Profit Estimé" — les estimations ne reflétaient pas les ventes réelles.
- **Analytics > Rentabilité Produits** : Nouveau tableau avec **CA**, **Coût Total**, **Profit Net** et **Marge %** par produit vendu, trié par profit décroissant.
- **Marge Nette corrigée** : Les coûts d'achat en USD sont désormais convertis en DZD (×245) dans `getFinancialOverview`, `getProfitTrend` et `getTopProducts`.
- **Export CSV** : L'export du catalogue reflète les prix d'achat convertis en DZD.

## [7.3.4] - 2026-03-24

### ✨ Flexibilité Caisse
- **Édition Prix d'Achat** : Le caissier peut désormais modifier manuellement le prix d'achat d'un article lors de l'encaissement pour une précision comptable totale.
- **Réconciliation Dynamique** : Les surcharges de prix impactent directement les débits fournisseur et l'historique analytique de la vente.

## [7.3.3] - 2026-03-24

### 💱 Devises & Statistiques
- **Support Multi-devises** : Ajout du sélecteur DZD / $ pour le prix d'achat des comptes.
- **Précision Analytique** : Les statistiques de commande utilisent désormais la devise spécifique de chaque compte pour le calcul de la marge.

## [7.3.2] - 2026-03-24

### 🚀 Production & Profits
- **Purge de Production** : Suppression sécurisée de toutes les données de test (produits, commandes, clients) tout en conservant les configurations système.
- **Suivi des Profits Réels** : Implémentation du suivi du prix d'achat par compte (shared accounts).
- **Proratisation Automatique** : Calcul automatique des marges par slot vendu basé sur le coût réel du compte parent.
- **Interface Admin** : Nouveaux champs de saisie pour le prix de revient dans les formulaires d'ajout et de modification (unique et bulk).

## [7.3.1] - 2026-03-24

### 🚀 Orchestration & Robustesse
- **Orchestrateur v6.1** : Amélioration du démarrage de la session WAHA avec un fallback automatique de 15s.
- **Synchronisation Hybride** : Support de la synchronisation partielle (WhatsApp locale) en attendant les tunnels Cloudflare.
- **Auto-Start Logiciel** : Automatisation complète du lancement de la session WhatsApp dans `start.bat`.

## [7.3.0] - 2026-03-23

### 🛡️ Sécurité & Hardening
- **Audit de Sécurité Majeur** : Évaluation de 40 points de contrôle sur l'ensemble de la stack.
- **Correction Critique (SEC-001)** : Suppression de la clé de chiffrement fallback pour garantir l'utilisation de `ENCRYPTION_KEY`.
- **Protection Webhook** : Suppression du bypass en mode développement pour les webhooks WhatsApp (SEC-002).
- **Hardening API** : Migration vers `timingSafeEqual` pour la file d'impression et suppression des secrets dans les logs et URLs CRON.
- **Rate-Limiting** : Renforcement des politiques anti-force brute (5 tentatives / 15 min).
- **Filtrage Export** : Sécurisation de l'export de base de données par masquage des secrets et tokens.

### 🖥️ Expérience Kiosk (UI/UX)
- **Fluid Layout scaling** : Ajustement global de la taille des éléments pour une interface plus compacte et lisible sur les écrans tactiles.
- **Catalogue & Idle Views** : Raffinement visuel des marges et des typographies pour éviter la fatigue visuelle.

### 📚 Documentation & Specs
- **GitHub Spec Kit** : Initialisation des spécifications techniques dans le dossier `/specs`.
- **Agent Context** : Mise en place du `CLAUDE.md` pour optimiser la mémoire et les routines d'assistance IA.

## [7.2.1] - 2026-03-22

### 💫 Spec-Driven Development
- **Spec Kit Integration** : Installation et initialisation du GitHub Spec Kit pour une gestion structurée des spécifications techniques.
- **Agent Optimization** : Configuration d'Antigravity pour le support natif des routines Spec Kit via `.specify`.

## [7.2.0] - 2026-03-22

### 🏪 Module Caisse (POS)
- **POS Overhaul** : Refonte complète de l'interface de caisse pour une saisie ultra-rapide des ventes.
- **Support Mobile Caisse** : Adaptation du module de caisse pour les terminaux mobiles et tablettes.
- **Server Actions POS** : Nouvelles actions pour la gestion des transactions, des tickets et des stocks en temps réel.

### 🖨️ Écosystème d'Impression
- **Print Service v2** : Amélioration du service Node.js pour une gestion plus fiable des files d'attente d'impression.
- **Library Refactor** : Simplification de `src/lib/printer.ts` pour faciliter l'intégration de nouvelles imprimantes.

### 📦 Services & Data
- **Order Service Update** : Extension du service de commandes pour supporter les flux spécifiques à la vente directe.
- **Database Alignment** : Mise à jour du schéma Drizzle pour la synchronisation des données de caisse.

### 🛠️ Maintenance & Dev
- **Start Scripts** : Optimisation finale des scripts de démarrage pour l'environnement de production locale.

## [7.1.1] - 2026-03-22

### 📊 Analytics & Insights
- **Dashboard Booster** : Amélioration des graphiques et des indicateurs de performance clés (KPI) pour une meilleure visibilité des ventes.
- **Actions Analytiques** : Optimisation des Server Actions dédiées au traitement des données statistiques.

### ⚙️ Paramètres & FAQ
- **Module FaqBot** : Intégration du composant `FaqBotSettings` permettant de configurer finement l'IA pour répondre aux questions fréquentes des clients.
- **Settings Sync** : Meilleure synchronisation entre les versions Desktop et Mobile des paramètres.

### 🛡️ Sécurité & Résilience
- **Security Core Refresh** : Mise à jour du module `lib/security.ts` pour une protection accrue contre les injections et attaques par force brute.
- **Optimization Rate-Limit** : Affinement des seuils de limitation de débit sur les routes critiques.

### 🛠️ Maintenance & Dev
- **Workflow Dev** : Mise à jour des scripts de démarrage (`scripts/start-dev.js`) pour un support multi-plateforme amélioré.

## [7.1.0] - 2026-03-22

### 🛡️ Sécurité & API
- **Hardening Webhook** : Nouveau middleware de validation HMAC et signatures de sécurité pour les webhooks entrants.
- **Rate-Limiting v2** : Service de limitation de débit granulaire pour protéger les endpoints sensibles.
- **Correction Tracking** : Résolution des erreurs de types TypeScript dans le module de suivi des commandes.

### 🤖 Automation & Intelligence
- **Intégration n8n Native** : Nouveau module de synchronisation bidirectionnelle (`n8n.service.ts`) pour automatiser les workflows complexes.
- **Brain Integration** : Optimisation des routines de prompt IA pour les agents de support.

### 🖥️ Expérience Kiosk & Client
- **Kiosk Refresh** : Refonte visuelle majeure des vues `Catalogue`, `Confirmation` et `Idle` pour optimiser le parcours utilisateur.
- **Suivi Temps Réel** : Amélioration de la page de suivi client avec mise à jour du statut en direct.

### ⚙️ Admin & Écosystème
- **Mobile First Admin** : Mise en conformité de la Sidebar et des paramètres Bot pour une expérience 100% fonctionnelle sur tablette et smartphone.
- **Print Core** : Lancement du service `print-service` autonome pour une gestion robuste des impressions sans drivers locaux.

### 🛠️ Améliorations Techniques
- Déploiement d'une suite de 30+ scripts utilitaires pour le monitoring DB et les tests d'intégration.
- Optimisation du `middleware.ts` pour une meilleure gestion des sessions et de la sécurité des routes.

## [7.0.0] - 2026-03-18

### 🚀 WhatsApp & Automatisation
- **Nouveau Moteur Evolution API (v1.8.2)** : Intégration complète via Docker pour une stabilité maximale.
- **Livraison Automatique** : Envoi instantané des codes d'accès et profils dès la validation du paiement.
- **Moteur de Template Dynamique** : Personnalisation totale du message client via l'admin avec balises intelligentes (`{{items}}`, `{{customer}}`, `{{orderId}}`, `{{shopName}}`).
- **Dashboard de Connexion** : Interface de scan QR-Code et monitoring de santé en temps réel (Orange/Vert).
- **Actions Rapides** : Ajout de boutons "Renvoyer WhatsApp" dans le module de traitement des commandes.

### 🖨️ Révolution Impression (WebUSB)
- **Pilote ESC/POS Natif** : Passage d'une génération PDF lente à un flux binaire ultra-rapide directement via USB.
- **Optimisation Xprinter 80C** : Mise en page sur 48 colonnes, grille d'alignement parfaite et commande de découpe (Cut) automatique.
- **Thermal Receipt V2** : Nouveau design "Style Supermarché" plus compact et professionnel.
- **Support Multi-Profils** : Affichage optimisé des identifiants (Email/Pass | Profil | PIN) sur le ticket.

### 🛡️ Sécurité & Intégrité (God Mode)
- **Hardening Financier** : Verrouillage des transactions (`Row Locking`) pour éviter les doubles débits sur les portefeuilles B2B.
- **Audit Logs Avancés** : Traçabilité totale des actions administratives sensibles.
- **MFA & IP Whitelisting** : Renforcement des accès "God Mode" pour le panneau d'administration.

### 🛠️ Améliorations Techniques
- Migration vers une structure de données centralisée (`src/app/actions.ts`).
- Système de cache et revalidation Cloudflare optimisé.
- Correction des bugs de collision d'ID sur le Kiosk.

---
*Généré avec expertise par Antigravity - Version de Production Stable.*
