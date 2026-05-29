# STATUS — 100-pc-IA in-flight work

> Append-only log. Format: `[YYYY-MM-DD HH:MM] [agent-id] [TYPE] message`
> Types: `WIP`, `DONE`, `BLOCKED`, `LOCK`, `UNLOCK`, `QUESTION`, `NOTE`, `SYNC-LOADBRAIN`

## Active locks

(none)

## Log

```
[2026-05-28 11:00] chef NOTE COORDINATION.md + STATUS.md créés. Coord active. AGENTS.md existant (n8n MCP) intact.
[2026-05-28 11:00] chef DONE Migration 0021_slot_device_quota + 0022_backfill_max_devices committed (e34d645).
[2026-05-28 11:00] chef DONE src/services/loadbrain-auto-approve.client.ts + slot-device-quota.service.ts shippés. Boutique appelle LoadBrain auto-approve.
[2026-05-28 11:00] chef NOTE B1-B4 ont push, B5 peut-être en cours (lib/loadbrain-whatsapp.ts +115 lignes vu dans diff).
[2026-05-28 11:00] chef NOTE TOCTOU fix /activer/[token] par B3 — atomic bumpDeviceUsage + secondary re-check intégré. Excellent.
[2026-05-28 13:58] B2 DONE Errors/security (caisse/wallet/refund). Commits: e3dcfe3 (C2 reseller refund → reseller_wallets+REFUND, plus de UPDATE resellers.balance), bf3a2f8 (FOR UPDATE anti-double cancel/refund/approve), cc29bb9 (clientPayments REMBOURSEMENT sur refundFullOrder), 57d5393 (UserError+toClientError anti-leak), 171c96e (helper réutilisable refundResellerWallet + tests). +12 tests (errors 8, refund-reseller-wallet 4). tsc 0, 257/257 verts.
[2026-05-28 13:58] B2 NOTE Découverte: fidélité client (clients.loyalty_points / total_spent_dzd) JAMAIS créditée à l'achat = feature morte (approveReturn la décrémente en no-op). Décision produit: compléter le crédit à l'achat ou retirer la colonne. Hors zone B2.
[2026-05-28 14:07] B2 QUESTION → Chef: user demande une "page settings Credentials" (gestion centralisée + chiffrement-at-rest des secrets d'intégration). HORS zone B2 — touche src/db/schema.ts (shop_settings = zone Chef), src/app/admin/settings/** (non assigné), secrets WhatsApp/notifications (zone B5). Besoin d'un owner/affectation (Chef, ou agent settings dédié). Spec déjà écrite, commitée par erreur dans zone B4 avant lecture COORDINATION.md: docs/superpowers/specs/2026-05-28-credentials-settings-page-design.md (045f90a). B2 = FINI, je stoppe en attendant arbitrage.
[2026-05-28 14:05] chef DONE Webhook v2 g2bulk/bsv idempotents (FOR UPDATE + garde status!=PENDING_LOADBRAIN + lock wallet), anti double-refund/double-codes (21477ef, +4 tests). Proxy /api/loadbrain/[...path] gated staff ADMIN (b1b24a2). cron-tick.sh + DEPLOY.md S7b scheduler VPS (e454396). marketplace linkServiceToProduct transactionnel (5beb603).
[2026-05-28 14:05] chef DONE Pricing BSV/G2Bulk deduplique -> MarkupPricingService abstrait (c5d0d2e). API + comportement byte-identiques, relu APPROVE. Net -144 lignes.
[2026-05-28 14:05] chef DONE CI reparee: declenchee sur feat/** (a45f825), cache npm retire post-migration pnpm (aee45f6), @loadbrain/sdk-v2 vendore (dist reel sous vendor/loadbrain-sdk-v2/lib, 0c2219b), apostrophe IptvCheckoutModal echappee (64c7946). Jobs Typecheck OK + Production build OK (1er next build vert; la CI ne tournait sur AUCUNE branche feature avant). NB chef a touche .github/workflows (zone B4, Fini) pour debloquer la CI branch-wide.
[2026-05-28 14:05] chef NOTE INCIDENT (aee45f6): index git PARTAGE entre agents -> mon commit CI a happe le WIP non-committe de B5 (loadbrain-whatsapp.ts, notification-*, migration 0023, reseller notifs) + l'a pousse sous mon message. Vert, travail NON perdu, historique NON reecrit. Discipline: git diff --cached avant chaque commit (rappel: l'index est partage).
[2026-05-28 14:05] chef NOTE Pour B5/zone reseller: e2e ROUGES (02-reseller-flow badge BRONZE/catalogue/modal ; 12-sidebar 'Mes Webhooks' ; 13-notif-prefs lien sidebar) — jamais tournes en CI avant. Probablement feature notifications (sidebar) + seed e2e. Reseller UI = pas ma zone, je n'y touche pas. A investiguer cote B5.
[2026-05-28 14:13] B3 DONE Audit streaming clos — 6 commits: a1c3b09 (C1/H4 validation host www.netflix.com via netflix-url.ts + filtre sender strict), cc9777f (H2 quota fail-closed bump-avant-rendu + re-check), dfbfb24 (H1 rate-limit /api/activer events+heartbeat), 8b1d10f (SSE livraison exactly-once), e6eb6d2 (guard msAccountEmail), 7303f38 (re-entrance setInterval watcher). tsc 0, 245 tests verts. Zone B3 = FINI.
[2026-05-28 14:13] B3 DONE Côté B1/MFA (pairing, même session): primitive mfa-ticket.ts (2c241d1, 7 tests) + admin câblé (ddf370a, fuite TOTP retirée des logs) + reseller câblé (d42199a, check claims.role===RESELLER). Étape 2 MFA exige le ticket signé étape-1 (plus de userId client). Zone B1 = FINI. CAVEAT: smoke-test 2FA navigateur NON fait (pas de TOTP live générable) — à valider avant prod.
[2026-05-28 14:13] B3 QUESTION → Chef: scripts/check-zone.sh (référencé dans le protocole pull→check-zone→STATUS→push) est ABSENT du repo → step 2 infaisable pour tous les agents. À committer ou ajuster le protocole.
[2026-05-28 14:55] chef ACK B2 errors/security DONE 5 commits, 257 tests verts, anti-leak + double-refund FOR UPDATE + reseller_wallets refund. Excellent travail. B2 idle.
[2026-05-28 14:55] chef ACK B3 streaming audit DONE 6 commits (a1c3b09..dfbfb24), validation host www.netflix.com + quota fail-closed + rate-limit + SSE exactly-once + setInterval re-entrance. CAVEAT 2FA smoke-test pris en compte — à ajouter à la checklist deploy prod.
[2026-05-28 14:55] chef ACK B1 MFA hardening DONE via B3 pairing (mfa-ticket.ts + admin + reseller). Ticket signé étape-1 → étape-2. Pattern à propager si futur flow multi-step.
[2026-05-28 14:55] chef ANSWER B3 question check-zone.sh: le script n'existe que côté LoadBrain (LoadBrain/scripts/check-zone.sh, commit 55bd5f1). Côté boutique, protocole simplifié = juste `git diff --name-only` pour vérifier ta zone manuellement, puis `git commit <paths>` (pas `git add`). Si besoin d'un script boutique, je le drop en suivant — pour l'instant les 5 zones B1-B5 sont assez disjointes que le risque est faible.
[2026-05-28 14:55] chef ANSWER B2 question credentials-settings page: feature stratégique (centraliser secrets WAHA, MS Graph, n8n, OAuth, Stripe). OWNER = nouvel agent B6 ou réassignement B2 (idle). Scope multi-zone (schema chef + admin/settings non-assigné + secrets B5) donc nécessite COORDINATION explicite avant code. Spec déjà écrite (045f90a) — bonne base. DÉCISION : on garde la spec sur la branche, on assignera B6 après le deploy actuel. Bloquant : non.
[2026-05-28 14:55] chef NOTE loyalty_points / total_spent_dzd dead feature (signalé par B2 13:58) → produit decision, hors zone agents. Marquée comme tech-debt à arbitrer avec produit.
[2026-05-28 14:55] chef NOTE Production reseller 02/12/13 e2e ROUGE = B5 zone (reseller UI notifications + sidebar 'Mes Webhooks' + lien notif-prefs). À investiguer dès que B5 finit son travail en cours sur lib/loadbrain-whatsapp.ts.
[2026-05-28 14:55] chef DECISION discipline ALL AGENTS (boutique aussi) : `git commit -- <paths>` mandatory, plus de `git add .`. Sweep race observée côté LoadBrain (commit 4e2d029). Cf. LoadBrain STATUS.md 14:50 chef ACK.
[2026-05-28 15:12] chef DONE Diag IPTV IronMax: 3 commandes reseller FAILED (orders 659/661/662) + 14 provisions B2C failed. ROOT CAUSE = UPSTREAM (worker LoadBrain IronMax), PAS notre repo. Mon cote correct: les 3 ont ete AUTO-REMBOURSEES (PURCHASE->REFUND verifie, orders=REMBOURSE, wallet equilibre, 0 perte). markIptvOrderFailed fail-closed + refund OK.
[2026-05-28 15:12] chef DONE fix(iptv) 3ca8e99: markIptvOrderFailed sanitise desormais le lastError reseller (sanitizeProviderError) — avant, l'erreur brute upstream (nom provider + hint interne 'run tg-onestep.js') fuyait au reseller dans IptvLineDetailModal + ligne de refund.
[2026-05-28 15:12] chef NOTE POUR LE CHEF-PROJET / A3 (LoadBrain modules/ironmax): la commande IronMax la plus recente (order 662, today) echoue car le worker IronMax n'a PAS de session Telegram (@MYIRON_BOT) -> 'run tg-onestep.js to create one'. Fix = INTERACTIF (phone + OTP + 2FA), repo LoadBrain infra/deploy/tg-onestep.js, puis set TELEGRAM_SESSION sur le VPS + recreate container. NON faisable par un agent (auth Telegram interactive). Bonus: l'erreur upstream ne devrait pas exposer 'run tg-onestep.js' aux surfaces client (hygiene message cote LoadBrain).
[2026-05-28 15:30] B6 LOCK src/db/schema.ts (8 colonnes secrets shop_settings) + src/app/admin/settings/actions.ts + nouveau src/db/encrypted-column.ts + scripts/backfill-encrypt-settings.ts. Feature credentials encrypted-at-rest (spec 045f90a). Working tree VERIFIE clean avant edition (aucun schema.ts WIP d'un coworker). ETA court.
[2026-05-28 15:30] B6 NOTE → ② ③ (consommateurs shop_settings): j'applique l'Option A du spec = type Drizzle transparent `encryptedText` sur 8 colonnes (telegramBotToken, whatsappToken, whatsappApiKey, whatsappVerifyToken, geminiApiKey, vapidPrivateKey, microsoftClientSecret, netflixResolverPassword). Vos lectures Drizzle (db.query.shopSettings / db.select) recoivent du CLAIR sans changement de code (fromDriver dechiffre auto). SEUL risque: une lecture SQL BRUT (sql`SELECT...`) de ces colonnes verrait du ciphertext. Verifie cote app: AUCUNE lecture SQL brut de colonne secrete au runtime (tout passe par Drizzle). Si vous en ajoutez une, pingez-moi.
[2026-05-28 15:30] B6 NOTE → chef/D (dev tooling): scripts/start-dev.js LIT telegram_bot_token en SQL brut (SELECT *) pour poser le webhook Telegram dev → recevra du ciphertext apres chiffrement. Je patche start-dev.js (dechiffrement inline minimal). sync_tunnel_db.js + start-dev.js n'ECRIVENT que des colonnes config non-secretes (webhook_url, *_webhook_url, microsoft_redirect_uri) → writes OK, pas de mixed-state.
[2026-05-28 15:30] B6 NOTE DEPLOY: backfill OBLIGATOIRE avant/avec le deploy (scripts/backfill-encrypt-settings.ts, idempotent, raw-SQL read→encrypt→write). Sans backfill, un secret cleartext CONTENANT un point (URL/mdp) → decrypt() renvoie null pendant la fenetre deploy↔backfill. fromDriver fail-safe (null→"") donc pas de crash, mais valeur masquee tant que pas backfille.
[2026-05-28 15:45] B6 DONE → chef: Credentials encrypted-at-rest PHASE 1 (spec 045f90a) livree, 5 commits, tsc 0, 267/267 tests verts. UNLOCK schema.ts + actions.ts. Commits: 98d9459 (feat type encryptedText AES-256-GCM transparent sur 8 colonnes shop_settings + saveShopSettingsAction audit-redaction + blank-keeps-current), b646d12 (tests + vitest test-keys), 29bcece (backfill idempotent), a4e9f2f (fix dev start-dev.js decrypt telegram_bot_token raw-SQL), b0e43c1 (status). PAS de migration DB (type SQL reste text, zero diff drizzle). Consommateurs ②/③ recoivent du clair sans changement (lecture Drizzle). Branche feat/bsv-mirror-integrated, NON pushe (en attente d'aval push).
[2026-05-28 15:45] B6 ACTION-REQUISE → chef (DEPLOY): lancer `npx tsx scripts/backfill-encrypt-settings.ts` AVANT/AVEC le deploy qui embarque ces commits. Idempotent (re-run = no-op). Sans lui, un secret cleartext avec un `.` lit "" jusqu'au backfill (fail-safe, pas de crash). A ajouter au runbook deploy a cote du smoke-test 2FA (caveat B3) et du reset loyalty_points.
[2026-05-28 15:45] B6 NOTE PHASE 2 NON FAITE (arbitrage user = stop apres P1): l'UI existante ApiBotSettings.tsx fonctionne avec le chiffrement mais (a) ENVOIE ENCORE les valeurs secretes au client au load, (b) est ADMIN (pas SUPER_ADMIN), (c) pas de reveal-on-demand/badges Configure-Manquant. Le durcissement UI (hasX + Reveal audite + SUPER_ADMIN) reste a faire — spec 045f90a comme reference. A re-assigner quand voulu (necessite smoke-test navigateur).
[2026-05-28 16:10] B5 DONE Investigation e2e ROUGES 12/13 — ROOT CAUSE: src/components/reseller/ResellerSidebar.tsx (section Integrations + liens Mes Webhooks/API&Docs/Notifications) etait du CODE MORT (jamais rendu). La nav reseller = ShopTopNav (top-nav dropdown), pas la sidebar. Les e2e 12 + 13(test3) ciblaient cette sidebar orpheline. Fix (decision user = garder top-nav, adapter tests): (a) ShopTopNav dropdown profil expose desormais 'Mes Webhooks' (renomme depuis 'API') + nouveau lien externe 'API & Docs' (href=/api-docs target=_blank rel=noopener data-testid=reseller-api-docs-link); (b) e2e 12 + 13(test3) reecrits pour ouvrir le dropdown profil au lieu de la sidebar; (c) ResellerSidebar.tsx SUPPRIME (dead code, 0 import). tsc 0. Fichiers: src/app/reseller/shop/components/ShopTopNav.tsx, tests/e2e/12-*.spec.ts, tests/e2e/13-*.spec.ts, suppr src/components/reseller/ResellerSidebar.tsx.
[2026-05-28 16:10] B5 NOTE e2e 02-reseller-flow ROUGE = PAS un bug de code dans ma zone. Le seed (scripts/seed-e2e.ts) cree bien tier BRONZE + reseller@e2e.test/PIN 1234 + wallet 100k + produit 'Netflix Premium Test' (3 variants), et l'UI wallet rend 'Palier {tier.name}' + testid recharge-info-btn. Rouge = environnemental (serveur :4555 + DB seedee requis, jamais tourne en CI avant) → a confirmer en lancant la stack e2e complete. Aucun fix code 02 cote B5.
[2026-05-28 16:10] B5 CAVEAT e2e navigateur 12/13 NON executes ici (pas de serveur :4555 + DB seedee dispo). tsc vert + assertions adaptees au DOM reel du dropdown profil (role=menuitem + getByTestId). Smoke-test e2e a faire sur la stack complete avant de clore.
[2026-05-28 19:45] B2 DONE Re-assignation chef 19:20 (ligne 7 trial, solde 17234 "non debite") = VERIFIE, PAS UN BUG WALLET. Zone caisse/wallet saine: createIptvOrderAction (seul createur de ligne reseller, seul appelant UI = IptvCheckoutModal) debite atomiquement en tx (FOR UPDATE + garde priceDzd>0 + PURCHASE); markIptvOrderFailed ne rembourse que les lignes PENDING_LOADBRAIN jamais livrees; le reconciler in-process (instrumentation.ts, 60s) ne rembourse que sur status upstream failed/cancelled et recupere en ACTIVE les completed. CONFIRME par user: la ligne 7 a ete AUTO-REMBOURSEE suite a un bug de provisioning (deja corrige) -> debit -200 puis refund +200 = net zero = comportement CORRECT d'un trial echoue, PAS un debit manquant. Le "solde inchange" lu = le refund qui marche. Pointeur payOrder/recordPayment = faux-ami (checkout reseller cree l'order PAYE + debite le wallet en direct, ne passe NI par payOrder NI par recordPayment). Aucun changement de code. B2 reste idle.
```

## Conflits détectés

| Fichier | Agents | Status | Décision chef |
|---|---|---|---|
| `src/services/slot-device-quota.service.ts` | Chef (checkDeviceQuota pure) + B3 (bumpDeviceUsage DB + fail-closed) | ✅ Compatible | B3 a étendu sans casser ma fonction pure. Tests verts. Pas de conflit. |
| `src/app/activer/[token]/page.tsx` | Chef (initial quota guard) + B3 (TOCTOU fix avec re-check) | ✅ B3 wins | Le fix B3 est strictement supérieur. Chef adopte. |
| `src/workers/streaming-mailbox-watcher.worker.ts` | Chef (LoadBrain auto-approve call) + B3 (msAccountEmail guard) | ✅ Compatible | Les deux changements coexistent (ligne différente). |

## Décisions architecturales

1. **Quota TOCTOU** : pattern fail-closed bumpDeviceUsage atomic + secondary re-check via `findFirst` adopté (B3).
2. **MFA step transition** : signed HMAC ticket avec TTL (B1) — utiliser pour tout flow multi-step futur.
3. **Errors client** : ne JAMAIS leak les messages d'erreur bruts. `toClientError(err)` (B2) à utiliser partout.
4. **Streaming watcher** : guard sur `ms_account_email` IS NOT NULL (B3) — évite gaspillage de refresh MS Graph.
5. **LoadBrain client SDK** : tous les appels vers LoadBrain passent par `src/lib/loadbrain-*.ts` avec `LOADBRAIN_INTERNAL_TOKEN` header (chef).
6. **Netflix URL validation** : helper centralisé `src/lib/netflix-url.ts` pour valider host www.netflix.com avant tout fetch/redirect (B3).
7. **Rate-limit** : `/api/activer/*` rate-limité par token (B3 dfbfb24).
8. **SSE livraison** : exactly-once via dedup index (B3 8b1d10f).
9. **Git discipline** : `git commit -- <paths>` mandatory (sweep race observée côté LoadBrain 14:50).

## Next actions (chef)

- [x] **B2** : audit caisse remaining (payOrder/recordPayment tests) en cours par B2. + nouveau ticket wallet hold→debit ligne ID 7 IPTV (chef SYNC-LOADBRAIN 19:50, sync depuis LoadBrain).
- [x] **B6** : Phase 1 credentials encrypted-at-rest DONE (commits 98d9459→b0e43c1, push origin ec6f6e0). Phase 2 UI hardening (SUPER_ADMIN reveal-on-demand + hasX badges) DEFERRED.
- [x] **e2e 12/13 ROUGES** : B5 root-cause + fix DONE (commit WIP en attente B5, ResellerSidebar→ShopTopNav dropdown). Smoke navigateur à confirmer en CI une fois stack :4555+DB seedée levée.
- [ ] **e2e 02-reseller-flow ROUGE** : environnemental (seed OK selon B5, manque serveur :4555 + DB seedée en CI). NON-bug code, à confirmer en CI une fois stack levée.
- [ ] **NOUVEAU: 4 bugs ligne IPTV trial ID 7** (chef SYNC-LOADBRAIN 19:50): wallet B2 + table reseller refonte B5. Voir log 19:50.
- [ ] **Smoke test 2FA navigateur** avant deploy prod (CAVEAT B3).
- [ ] **Backfill credentials encrypted-at-rest** : `npx tsx scripts/backfill-encrypt-settings.ts` AVANT/AVEC le deploy boutique (idempotent, B6 ACTION-REQUISE 15:45). AJOUTÉ AU RUNBOOK.
- [ ] **Reset loyalty_points** : décision produit avant le prochain release.

## Sync events

- 2026-05-28 19:50 chef SYNC-LOADBRAIN : 4 bugs IPTV ligne ID 7 broadcastés @B2 (wallet) + @B5 (UI table refonte). Voir log 19:50. Cross-link LoadBrain commit 99821c4 ↔ boutique commit ec6f6e0.
- 2026-05-28 19:50 chef ACK B6 Phase 1 DONE + branche `feat/bsv-mirror-integrated` pushée à origin (commit ec6f6e0). Backfill ajouté runbook deploy.
- 2026-05-28 19:50 chef ACK B5 e2e 12/13 root-cause + adapt DONE — B5 doit commit son WIP (ShopTopNav.tsx + e2e 12/13 specs + suppr ResellerSidebar.tsx) avant de prendre le nouveau ticket IPTV.

[2026-05-28 19:50] chef SYNC-LOADBRAIN — relais coord LoadBrain → boutique. Smoke test reseller→prod E2E VALIDÉ à 19:20 (LoadBrain STATUS commit 99821c4). Ligne ID 7 trial 2j IronMax depuis localhost:3050/reseller via LOADBRAIN_URL=https://api.loadbrain.shop = chaîne LoadBrain green bout-en-bout (Telegram session refresh chef 17:30, A3 ironmax fix dfb8941 LIVE, gateway v2 A5 745bcb6 LIVE, marketplace notify 200, poll v2 60s = 200 OK). MAIS 4 bugs reseller-side identifiés (LoadBrain payload complet+correct, consumer reseller ne mappe/débite/transitionne pas):
  --- @B2 wallet/caisse ---
  Solde reseller TOUJOURS 17234 DZD après ligne ID 7 trial 200 DZD réussie (devrait être 17034). Hold→debit pas déclenché. Probablement manque hook `onProvisionCompleted` côté wallet OU debit fait en pré-commande mais rollback non-trigger. À investiguer dans ton audit `payOrder`/`recordPayment` en cours.
  --- @B5 e2e + UI reseller ---
  4 bugs visuels/state sur table lignes IPTV (composant reseller, pas la ShopTopNav que tu viens de fix l.47):
  (1) Status reste "EN ATTENTE" malgré poll `200 OK status:completed` → consumer ne transitionne pas EN ATTENTE → ACTIVE.
  (2) Password column vide/masqué → extraire `credentials.screens[0].password` (= `2895701349247247`) du payload poll.
  (3) Username tronqué `9999434211447043344` (devrait être `99994342114470433444`) → bug CSS truncation, manque 1 chiffre.
  (4) EXPIRES/LEFT vides → pour trial, payload retourne `expiresAt=""`, le reseller doit calculer client-side = `created_at + plan.durationDays` (Trial 2j = +2 jours).
  REFONTE TABLE (zero scroll horizontal) — 8 cols essentielles ≤820px total:
    ID(60) | LIGNE-username(200,ellipsis+tooltip) | STATUS(110) | TYPE-badge(90) | EXPIRES-relatif(100) | M3U-copy+open(100) | CREATED-relatif(110) | ⋮menu(50)
  Drawer latéral au clic ligne avec tous les détails:
    ▶ Credentials: username/password(masqué👁)/code
    ▶ URLs: m3u_url/epg_url (copy + open buttons)
    ▶ Lifecycle: created/expires/owner
    ▶ Network: online/conn/isp_lock/country/speed (placeholder, polled depuis panel plus tard)
    Actions footer: Renouveler / Désactiver / Supprimer
  MAPPING payload→UI:
    - LIGNE          ← credentials.screens[0].username (ellipsis 20 chars + tooltip full)
    - STATUS         ← poll response.status (transition EN ATTENTE → ACTIVE quand "completed")
    - M3U            ← credentials.screens[0].m3uUrl (déjà builé avec panel streamingHost lg.stir.wales:8080, AFFICHER TEL QUEL, ne pas re-fabriquer)
    - EXPIRES        ← credentials.screens[0].expiresAt SI non vide SINON computed(created_at + plan.durationDays)
    - Drawer-Password ← credentials.screens[0].password (révélable 👁)
    - Drawer-EPG     ← credentials.screens[0].epgUrl
    - Drawer-Code    ← credentials.screens[0].code
  REF DESIGN: Drawer pattern LoadBrain Daylight (commit LoadBrain db723cf, A1 quit DONE) — chef LoadBrain a aussi onboardé A7 design system à 19:30 (LoadBrain commit d6e0336) pour aider sur ce genre de refonte cross-app. Si B5 veut une spec design détaillée, pinger chef pour brief A7.

[2026-05-28 19:50] chef ACK B6 Phase 1 credentials encrypted-at-rest DONE (5 commits 98d9459→b0e43c1, branche feat/bsv-mirror-integrated, 267/267 vert, tsc 0). UNLOCK schema.ts + actions.ts accepté. Push à toi quand prêt. Backfill `npx tsx scripts/backfill-encrypt-settings.ts` AJOUTÉ AU RUNBOOK DEPLOY (à côté smoke 2FA B3 + reset loyalty_points). Phase 2 (UI hardening ApiBotSettings.tsx: SUPER_ADMIN reveal-on-demand + hasX badges + no-leak load) **OFFICIELLEMENT DEFERRED** — à ré-assigner quand voulu, spec 045f90a reste référence. NOTE LoadBrain side: la coord avait listé A2 (LoadBrain) comme possible owner d'un credentials-vault centralisé multi-module — c'est un scope DIFFÉRENT de ce que tu as fait (toi = at-rest local boutique 8 colonnes shop_settings ; A2 archi = vault cross-module LoadBrain). Pas de chevauchement. A2 reste idle LoadBrain-side (sa propal commit 4f03e76 archivée comme reference si futur vault LoadBrain).

[2026-05-28 19:50] chef ACK B5 e2e 12/13 root-causée + adaptée (l.47, code mort ResellerSidebar→ShopTopNav dropdown) — DONE quand tu commit + smoke navigateur OK. Caveat (l.49 stack :4555+DB seedée non dispo) accepté, à confirmer en CI une fois stack levée. e2e 02 environnemental (l.48) noté, pas un bug code B5. Tu as une autre tâche prioritaire ci-dessus (4 bugs ligne IPTV trial ID 7) — c'est dans ta zone reseller-UI, démarre quand tu veux. Discipline: commit ton WIP actuel (ShopTopNav.tsx + e2e 12/13 + suppr ResellerSidebar.tsx) AVANT de commencer le ticket IPTV (sinon sweep race avec mes synces).
[2026-05-28 20:10] chef QUESTION -> chef-projet: re ta SYNC 19:50 — le bug #2 des 4 bugs ligne 7 ("statut bloque EN ATTENTE malgre poll 200 status:completed") est bucke @B5, mais la TRANSITION d'etat EN ATTENTE->ACTIVE = markIptvOrderDelivered, declenchee par le reconciler IPTV in-process (iptv-reseller-reconciler.service.ts via instrumentation.ts poll 60s) = couche INTEGRATION/consommateur = MA zone (chef boutique / IPTV), PAS l'UI B5. SPLIT PROPOSE: MOI = la transition (le reconciler ne mappe pas poll status:completed -> markIptvOrderDelivered, la ligne reste PENDING_LOADBRAIN) ; B5 = affichage table (username/password/expires/rendu). Je prends le #2-transition si tu valides le re-routing. #1 wallet (@B2) et #3 affichage (@B5) inchanges. Je verifie le statut DB reel de la ligne 7 des que tu ACK (stuck PENDING_LOADBRAIN => mon reconciler ; ACTIVE-en-DB-mais-UI-EN-ATTENTE => affichage B5).

[2026-05-28 20:00] chef ACK B2 verification (l.50) — TU AS RAISON, je retire mon hypothèse "wallet hold→debit pas déclenché". Ligne ID 7 = tentative ANTÉRIEURE échouée (avant Telegram refresh chef LoadBrain 17:30) → cycle debit/refund correct = net zero. Wallet sain. Faux-ami `payOrder`/`recordPayment` noté (checkout reseller passe par `createIptvOrderAction` direct). B2 reste idle, **scope wallet officiellement clos** sur cet incident.
[2026-05-28 20:00] chef CORRECTION ticket B5 (l.91+) — les 4 bugs UI observés sur ligne ID 7 sont **probablement des artefacts d'un ordre refundé** (B2 confirm 19:45), PAS des bugs sur ordre completed. À RE-VÉRIFIER : passer une NOUVELLE commande test trial post-fixes (Telegram refresh + A3 dfb8941 + B6 P1), observer une ligne CONFIRMED-COMPLETED côté reseller, puis confirmer/infirmer les 4 bugs (status EN ATTENTE, password vide, username tronqué, EXPIRES vide) + la refonte table. Si nouvelle ligne complete affiche correctement → annuler ticket B5 IPTV. Sinon → maintenir ticket B5 avec les bugs réellement reproduits. Action chef: re-tester reseller→prod, puis ANSWER à B5.

[2026-05-28 20:10] chef DONE Smoke test #2 reseller→prod GREEN bout-en-bout, dossier IPTV CLOS:
  - Nouvelle commande IronMax (taskId LoadBrain `dee03bef-9af1-4177-bdb4-e498f389ae5d`, username `99992813925507012755`, password `3915006627328694`) validée par user reseller UI:
    ✓ Status: ACTIVE (transition completed OK)
    ✓ Username entier (pas tronqué)
    ✓ Password visible
    ✓ Solde wallet débité -200 DZD (debit propre, PAS de refund cette fois)
    ✓ M3U URL affichée (panel streamingHost lg.stir.wales)
  --- TICKET B5 IPTV (4 bugs ligne ID 7) — ANNULÉ ---
  Les 4 bugs observés étaient des artefacts de la ligne ID 7 (ordre refundé suite à panne Telegram pré-fix, confirmé B2 19:45). Une commande COMPLETED s'affiche correctement. B5 zone reseller-UI = saine. Ticket retiré, pas d'action UI requise.
  --- VERDICT GLOBAL ---
  Pipeline complet end-to-end VALIDÉ: reseller (boutique) → gateway v2 → IronMax (Telegram session refresh) → marketplace notify → poll v2 → reseller UI ACTIVE + creds + wallet debit. 2/2 smoke tests verts. Dossier provisioning IronMax officiellement clos.
  --- AGENTS BOUTIQUE STATUS POST-DOSSIER ---
  B2: idle, scope wallet officiellement clos (verification 19:45 correcte).
  B5: B5 a juste son commit WIP (ShopTopNav + e2e 12/13) à finaliser quand prêt; pas de ticket IPTV à reprendre.
  B6: idle, Phase 1 closed + pushed; Phase 2 deferred si décision produit.
  B1/B3/B4: déjà idle/done.

[2026-05-28 20:25] B5 DONE nav reseller (ticket initial) COMMITÉ (6ced85d): e2e 12/13 root-cause = ResellerSidebar code mort, migré vers ShopTopNav dropdown (Mes Webhooks + API & Docs /api-docs target=_blank) + ResellerSidebar supprimé. tsc 0, suite 277 verte. Caveat smoke navigateur (stack :4555+DB) maintenu.
[2026-05-28 20:25] B5 ACK ticket IPTV ANNULÉ (chef 20:10, smoke #2 green sur ordre completed = les 4 bugs étaient artefacts de la ligne 7 refundée). Bien reçu, je ne reprends pas le ticket.
[2026-05-28 20:25] B5 NOTE → chef (zone reconciler/intégration) — 2 constats RÉELS survivent à l'annulation, pour ta décision (pas d'action de ma part dans ta zone) : (1) RECTIF de ton hypothèse 20:10 : le reconciler `iptv-reseller-reconciler.service.ts` MAPPE BIEN `status:completed → markIptvOrderDelivered → status ACTIVE` (reconcileOne l.217-230 + iptv-reseller.service.ts:272). Donc la transition N'est PAS manquante. (2) Vraie cause de la fenêtre "EN ATTENTE" : `processCompletedTask` (webhook) ne touche QUE les tables kiosk (orders/digital_codes/iptv_provisions), JAMAIS `reseller_iptv_orders` → le mirror reseller n'est réconcilié QUE par le poll 60s → fenêtre PENDING transitoire entre provisioning et tick. (3) Latent trial-expiry : `extractExpiry` fait `tryParse("")===null` → une ligne TRIAL (upstream expiresAt="") garde expiresAt NULL même après réconciliation. Ta zone — à trancher si worth fixing.
[2026-05-28 20:25] B5 NOTE commits IPTV (df1c452, a96e152, a491417) GARDÉS comme durcissement défensif READ-ONLY côté affichage reseller (aval user) : `getMyIptvLinesLiveAction` n'écrit RIEN dans le mirror (persistance = ta zone reconciler), elle DÉRIVE seulement pour l'UI : status ACTIVE immédiat (sans attendre le tick 60s), extractScreen robuste aux wrappers (credentials/result/data → screens[0]) pour username/password fiables, estimation expiry trial (created_at + durée plan parsée, display-only jamais persistée). Helpers purs extraits dans `src/app/reseller/iptv/screen-extract.ts` + 16 tests unitaires (payload réel ligne 7). tsc 0, 277 tests verts. Si tu préfères que je revert (flux validé), dis-le.
[2026-05-28 20:25] B5 idle. Reste non-bloquant : smoke navigateur e2e 12/13 + e2e 02 (environnemental) à confirmer en CI une fois stack :4555+DB seedée levée. Dispo pour pairer (reseller UI / IPTV affichage).

[2026-05-28 20:35] chef DONE Bug `/admin/traitement` FIXÉ — 3 migrations en retard appliquées sur DB locale (`100-pc-ia-db-1` postgres flexbox):
  - 0021_slot_device_quota.sql : ADD COLUMN max_devices/devices_activated/last_device_at + index dcs_devices_activated_idx
  - 0022_backfill_max_devices.sql : UPDATE 255 rows (backfill rows already-sold)
  - 0023_reseller_low_balance_threshold.sql : ADD COLUMN low_balance_threshold (déjà existante, skip)
  Root cause (diag agent debug): schéma TS `src/db/schema.ts` référence ces colonnes (depuis commit `558ad05` device quota Option C hybrid + `47f6ae2` IPTV reseller) mais migrations jamais appliquées en local. `db.query.orders.findMany` avec relational join → SELECT auto-inclut ces colonnes manquantes → Postgres ERROR `column "max_devices" does not exist` → catch outer `page.tsx` → "ERREUR DE CHARGEMENT DES COMMANDES". `getPendingCount()` survivait (no join, juste count orders) → expliquait badge "1" sidebar fonctionnel.
  Faux suspects écartés: B6 encryptedText sur shop_settings (zone orthogonale, non lue par OrderQueries), B5 recents commits reseller-iptv (uniquement zone reseller).
  NOTE: la table `drizzle.__drizzle_migrations` est vide → suivi migrations non automatisé sur cette DB. À risque: futures migrations peuvent être sautées. Considérer wiring `drizzle-kit migrate` ou suivi manuel rigoureux.
[2026-05-28 20:35] chef ACK B5 rapport complet (entries 20:25, commits 6ced85d + df1c452 + a96e152 + a491417):
  (1) ACCEPT 6ced85d nav reseller e2e 12/13 DONE — tsc 0, 277 verte, caveat smoke navigateur OK.
  (2) ACCEPT corrections B5 sur mes erreurs d'analyse 20:10:
     - Reconciler `iptv-reseller-reconciler.service.ts` MAPPE BIEN `completed → ACTIVE` (l.217-230). J'avais affirmé l'inverse, tu as raison: la transition n'est PAS manquante.
     - Vraie cause fenêtre "EN ATTENTE" = `processCompletedTask` webhook ne touche QUE tables kiosk (orders/digital_codes/iptv_provisions), JAMAIS `reseller_iptv_orders` → mirror reseller réconcilié SEULEMENT par poll 60s → fenêtre PENDING transitoire. C'est by-design (event source-of-truth = kiosk, reseller en mirror), pas un bug.
  (3) DÉCISIONS @B5:
     - **Garde** les 3 commits IPTV display-only (df1c452, a96e152, a491417) — durcissement read-only utile, sans risque (jamais d'écriture mirror, persistance reste reconciler), UX plus réactive (status ACTIVE immédiat vs attente tick 60s), helpers purs testés 16 cases. NE PAS REVERT. Bon travail.
     - **Trial-expiry latent NULL** (`extractExpiry("")===null` → expiresAt jamais persisté pour trial) = **NON-FIX**. Aligne avec ta décision a96e152 "persist only authoritative reconcile values" — display-only computed (created_at + plan duration) suffit, le DB stocke seulement le vrai upstream expiresAt. Si upstream renvoie "" pour trial, mirror reste NULL, UI dérive l'estimation. Cohérent.
  (4) B5 idle confirmé. Smoke navigateur e2e 12/13 + e2e 02 restent en attente stack :4555+DB seedée (non-bloquant). B5 dispo pour pairer si besoin reseller UI ou IPTV display.

[2026-05-28 20:50] chef DONE fix(orders) scoping — chef commit (zone shared service `src/services/queries/order.queries.ts`). User a vu les commandes reseller mélangées dans /admin/traitement après fix migrations. Root cause: les 8 list queries `OrderQueries.*` n'avaient JAMAIS de filtre `resellerId IS NULL`, donc reseller orders fuyaient dans toutes les vues admin (traitement, caisse, commandes, sidebar counts). Fix appliqué:
  - `getPending`, `getPaid`, `getFinished`, `getToday` → ajout `isNull(orders.resellerId)` au where
  - `getPendingCount`, `getPaidCount` → ajout `isNull(orders.resellerId)`
  - `getHistory`, `getHistoryPaginated` → ajout `isNull(orders.resellerId)` (combiné avec search)
  - `findByNumber`, `getById` → NON modifiées (admin lookup tools, doivent pouvoir cibler reseller orders par ID pour debug)
  tsc 0. Aligné avec la décision architecturale boutique: orders.resellerId NULL = B2C boutique, NOT NULL = reseller B2B. Future SaaS vision (chaque reseller a sa boutique complète) construira sur ce socle.
  NOTE @B5: ton mirror `reseller_iptv_orders` reste isolé (separate table), pas impacté par ce fix. Les reseller orders restent visibles dans /reseller/* via tes queries dédiées + reseller webhooks.

[2026-05-28 21:30] chef DONE Passe complète scoping admin boutique:
  Fixé: src/services/queries/dashboard.queries.ts (KPIs turnover/profit/count + latestOrders + pendingCount + weekData chart + getRecentOrders → isNull(orders.resellerId)). Dashboard admin n'agrège plus les commandes reseller dans le CA / profit / nb commandes. Continuité avec fix précédent OrderQueries + admin/iptv/queries.
  Audité OK (pas de fix nécessaire):
    - src/app/admin/settings/actions.ts L576 = export backup INTENTIONNEL (inclut orders + resellers séparément)
    - src/app/admin/clients/actions.ts = filtré par clientId naturellement (reseller orders n'ont pas de clientId, ne fuient pas)
    - src/app/admin/caisse/actions.ts = lookups single par ID (debug tools)
    - src/services/queries/support.queries.ts = lookups orderId (debug tools)
  Invariant désormais cohérent partout: orders.reseller_id NULL = B2C boutique, NOT NULL = reseller. Tous les list/aggregate admin scopés. Single lookups par ID restent permissifs (admin debug). Prêt pour vision SaaS A7.

[2026-05-29 09:25] chef DONE Soldes fournisseurs Lots 1-5 backend complet (UI patch deferred):
  - Lot 1 (commit a77411f): migration 0024 + schema TS (type/provider_kind/external_config/alert_threshold/last_balance_at)
  - Lot 2 (commit 4294f86): library balance-fetchers (capsolver/twocaptcha/anticaptcha/lb_module/mudfish, pluggable registry, env-resolved keys)
  - Lot 3 (commit ae732d2): cron route GET /api/admin/cron/refresh-balances (Bearer CRON_SECRET, idempotent loop)
  - Lot 4 actions (commit ae732d2): listFetcherKindsAction, createExternalSupplierAction, refreshSupplierBalanceAction
  - Lot 5 seed: 3 rows insérées direct en DB locale (CapSolver/2Captcha/AntiCaptcha) — chef bootstrap pour smoke test
  - .env local: ajout CAPSOLVER_KEY + TWOCAPTCHA_KEY (cohérent avec LoadBrain prod 00:45)
  RESTE: Lot 4 UI patch (filter dropdown Tous/Stock/External + section External avec refresh btn) sur SuppliersContent.tsx — non urgent, le backend marche. À planifier ou laisser pour quand l'opérateur sort de PK365 fix.
  SMOKE TEST À LANCER (opérateur, après restart pnpm dev pour charger les nouvelles env vars):
    curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3050/api/admin/cron/refresh-balances
  Réponse attendue: { refreshed: 3, failed: [], alerts: [] } avec balances CapSolver ~$4.46 + 2Captcha ~$2.99 + AntiCaptcha 0 (out of credit).
  CRON VPS à wirer: ajouter `*/10 * * * *` curl /api/admin/cron/refresh-balances dans cron-tick.sh côté prod (pattern existant), à faire au prochain deploy boutique.

[2026-05-29 17:25] B5 DONE ticket HAUTE prio "reseller IPTV table m3u/password manquants atlaspro/ironmax" (brief LoadBrain 15:45 / 74a9035). Commits b51641f + 1daa720.
  ROOT CAUSE: getMyIptvLinesLiveAction faisait `if (!row.lbTaskId) return null` → les providers ORDER-based (atlaspro/panelking via lb_order_id, PAS lb_task_id) etaient skippes en live → m3u/password jamais peuplé. Le webhook ne touche pas le mirror, le reconciler ne persistait pas les creds.
  FIX (3 volets, comme demandé):
   (1) Migration 0025 + schema: m3u_url / epg_url / credentials_password sur reseller_iptv_orders. username deja dans provider_account_id.
   (2) Reconciler iptv-reseller-reconciler.service.ts: stocke ces valeurs via extractScreen() sur completed/delivered (markIptvOrderDelivered etendu, ?? fresh.X = ne clobber jamais avec null).
   (3) getMyIptvLinesLiveAction: poll tasks.get OU orders.get (fix atlaspro) + fallback colonnes persistées; reveal idem (password live ?? stocké). extractScreen traverse desormais les wrappers task/order (forme orders.get). Table affiche deja m3u(copy)+password(mask/reveal/copy) → la donnée circule maintenant.
  tsc 0, 278 tests verts (+2 wrapper order/atlaspro). Helper pur deplacé app/reseller/iptv/screen-extract → src/lib/iptv-screen (le service reconciler doit l'importer).
[2026-05-29 17:25] B5 DECISION SECU (a valider) — j'ai stocké les 3 colonnes CHIFFRÉES AU REPOS via le type encryptedText de B6 (colonne SQL reste `text`, transparent en lecture Drizzle), PAS en clair. Raison: m3u_url contient le password dans sa query-string + le pattern projet chiffre deja les credentials (digitalCodes, shop_settings B6). Lecture SQL BRUT de ces colonnes verrait du ciphertext (aucune au runtime, tout passe par Drizzle). Si tu veux du clair (consommateur raw-SQL externe ?), dis-le, je bascule en text simple.
[2026-05-29 17:25] B5 ACTION-REQUISE → chef (DB/deploy): appliquer migration 0025 (ADD COLUMN m3u_url/epg_url/credentials_password) sur DB locale + prod AVANT que ce code tourne — Drizzle SELECT inclut desormais ces colonnes, elles doivent exister sinon erreur. Additive/idempotente (IF NOT EXISTS). NB: __drizzle_migrations vide (tu l'as note 20:35) → application manuelle comme 0021-0024.
[2026-05-29 17:25] B5 CAVEAT: non validé contre un vrai payload atlaspro live (pas de stack LoadBrain ici). Couvert par unit tests (extractScreen: screens[0] sous credentials/result/data/task/order + cas atlaspro). Smoke reseller→prod recommandé sur une ligne atlaspro completed. NB: IptvLinesTable.tsx a une modif externe non-mienne (masquage scrollbar, refonte table ?) — laissée intacte, hors mon commit.

[2026-05-29 17:30] B5 PIVOT (steer chef "poll direct + affiche, pas de persistance") — REVERT de la couche persistance (commit 73bdd9f). Retiré: migration 0025, colonnes m3u_url/epg_url/credentials_password, écriture reconciler, encryptedText. GARDÉ (le vrai fix): extractScreen traverse les wrappers task/order/credentials/result/data → screens[0] (helper lib/iptv-screen) ; live action + reveal pollent tasks.get OU orders.get ; table affiche m3u+password (mask/reveal/copy) direct depuis le live feed. tsc 0, 278 tests verts. Le live poll contient tout → affichage live suffit, pas de DB.
[2026-05-29 17:30] B5 BLOCKED/QUESTION → chef: pour confirmer que extractScreen parse la VRAIE forme atlaspro/panelking, j'ai besoin du payload réel (tu as cité task atlaspro 04316f29). Envoie-moi le JSON de `provision.tasks.get('04316f29')` (ou un id panelking365 completed) — je vérifie/ajuste extractScreen + ajoute un test contre la forme exacte. Sans ça je devine la forme (mes wrappers couvrent credentials/result/data/task/order → screens[0], mais si atlaspro niche ailleurs, il faut le voir).

[2026-05-29 17:40] B5 ESCALADE → chef (et chef-projet / coord LoadBrain) — TICKET IPTV m3u/password atlaspro : FIX LIVRÉ MAIS NON VÉRIFIABLE CÔTÉ BOUTIQUE.
  ÉTAT: lean shippé (commit 73bdd9f) — extractScreen robuste (wrappers task/order/credentials/result/data → screens[0]) + live poll tasks.get/orders.get + affichage m3u/password. tsc 0, 278 tests. Persistance DB retirée sur ton steer.
  BLOCAGE: je ne peux PAS confirmer que extractScreen matche la VRAIE forme du payload atlaspro/panelking. Pas d'accès stack LoadBrain live ici. Si atlaspro niche les creds hors de `credentials.screens[0]` (forme non vue), l'affichage restera vide MALGRÉ le fix.
  CE DONT J'AI BESOIN (1 des 2):
    (a) le JSON de provision.tasks.get('04316f29') (atlaspro, que TU as déjà inspecté côté LoadBrain) — colle-le ici ou dans un fichier, je l'aligne sur extractScreen + ajoute un test contre la forme réelle ; OU
    (b) un id de ligne panelking365/atlaspro COMPLETED + accès pour que quelqu'un avec la stack live tourne /reseller/iptv et confirme l'affichage.
  DÉCISION OUVERTE: tant que (a)/(b) pas fournis, ce ticket reste "fix probable, non vérifié". Je ne peux pas le clore en confiance. → à toi / chef-projet de fournir le payload ou de désigner qui valide sur la stack.

[2026-05-29 20:20] chef ANSWER ? B5 (escalade 17:40) � PAYLOAD ATLASPRO REEL fourni cote LoadBrain STATUS 19:15 commit 4e58c70 mais tu ne l'as pas vu (cross-repo). Le cross-poste ici:
  FORME REELLE (task atlaspro 04316f29 via v1 internal /api/v1/atlaspro/internal/provision/<id>):
  ```json
  {
    "success": true,
    "data": {
      "task": {
        "id": "04316f29-0a3f-4df2-9b39-01f405d2bfa3",
        "orderId": "IPTV-1780066307464-586",
        "customerId": "671",
        "customerInfo": { "name": "Client", "phone": "", "orderNumber": "IPTV-1780066307464-586" },
        "status": "completed",
        "screenCount": 1,
        "credentials": {
          "screens": [
            {
              "screenNumber": 1,
              "username": "365332146332404",
              "password": "1593574628",
              "m3uUrl": "http://15rof.site:80/get.php?username=365332146332404&password=1593574628&type=m3u&output=ts",
              "epgUrl": "http://15rof.site:80/xmltv.php?username=365332146332404&password=1593574628",
              "expiresAt": "2026-05-30T14:54:12.022Z"
            }
          ]
        },
        "error": null,
        "attempts": 1,
        "completedAt": "2026-05-29T14:54:12.024Z",
        "createdAt": "2026-05-29T14:51:45.884Z"
      }
    }
  }
  ```
  Forme: 	ask.credentials.screens[0] avec keys username/password/m3uUrl/epgUrl/expiresAt/screenNumber. Camel case partout. M3U URL contient le password en query-string.
  Ton extractScreen avec wrapper "credentials" (helper lib/iptv-screen) DEVRAIT capturer direct - meme structure pour ironmax et panelking365 (chef a verifie le code des 3 modules: tous emettent credentials.screens[0] dans le payload final).
  CAVEAT IMPORTANT: ce payload est l'endpoint v1 INTERNAL DIRECT (/api/v1/atlaspro/internal/provision/<id>). Le boutique SDK passe par gateway v2 (/api/v2/provision/tasks/<id>) qui peut ajouter un wrapper esult ou data supplementaire en plus du wrapper 	ask. Si ton SDK consomme la reponse v2 brute (sans deballer), ton extractScreen doit traverser data->task->credentials->screens[0].
  POUR LEVER L'INCERTITUDE A 100%: dis-moi la signature exacte de provision.tasks.get(taskId) dans ton SDK et la forme du retour - si elle deballe deja le wrapper data (donne juste { task: {...} }) ou si elle te file le payload v2 brut. Si tu veux je peux aller lire le SDK code directement (LoadBrain/packages/sdk-v2/**) et te confirmer la forme exacte qu'extractScreen recevra.
  TICKET STATUS: encore ouvert tant que tu n'as pas confirme le path - mais le payload reel ne devrait PAS te bloquer plus longtemps. Si extractScreen avec ton wrapper "credentials" couvre la forme 	ask.credentials.screens[0], tu peux fermer en confiance avec ce payload comme reference test.

[2026-05-29 18:05] B5 DONE + RÉPONSE SDK → chef (re ton payload 20:20 + question signature SDK). J'ai lu le SDK vendoré moi-même, plus besoin que tu ailles le lire:
  - transport.js:106 → `return parsed.data` (déballe l'enveloppe {success,data}).
  - ProvisionTasksNamespace.get (client.js:216) → retourne `this.call(...)` SANS déballer `.task`.
  - DONC extractScreen reçoit `{ task: { credentials: { screens:[...] } } }` (ton payload réel, moins l'enveloppe data).
  FIX FINAL (commit 79e760c): findScreensContainer est désormais un DFS borné (depth≤6) qui trouve `credentials.screens[0]` à N'IMPORTE QUELLE profondeur de wrapper (task / data.task / result.task / order…). → l'incertitude "gateway v2 ajoute-t-il un wrapper" est LEVÉE: peu importe la forme, on trouve screens[0]. Camel case (username/password/m3uUrl/epgUrl/expiresAt) géré.
  TESTS: ton payload réel atlaspro (task 04316f29) ajouté comme référence + cas deep-wrapper (data.task / result.task). tsc 0, 280 tests verts.
  TICKET FERMÉ EN CONFIANCE côté extraction. m3u/epg/password/username/expires sont extraits du payload réel et affichés (table: m3u copy + password mask/reveal/copy, live feed). atlaspro/ironmax/panelking365 = même structure credentials.screens[0] (tu l'as confirmé pour les 3 modules) → tous couverts par le même chemin.
  RESTE (hors mon contrôle): smoke navigateur /reseller/iptv sur la stack live pour voir le rendu final — recommandé avant de clore prod, mais l'extraction est prouvée contre le payload réel.

[2026-05-29 20:35] chef ACK B5 commit 79e760c DONE final - excellent auto-resolution. Approche DFS born� (depth<=6) sur findScreensContainer = elegant: peu importe que gateway v2 ajoute data/result/task wrapper, screens[0] est toujours trouve. Camel case handled, payload reel atlaspro 04316f29 ajoute comme reference test, 280/280 verts.
  Ticket IPTV m3u/password ATLASPRO/IRONMAX/PANELKING FERME EN CONFIANCE cote extraction. B5 noted le smoke navigateur reseller live recommande avant clore prod - mais l'extraction est prouvee contre payload reel.
  B5 idle - dispo pour ajustements si bug remonte du smoke nav.
