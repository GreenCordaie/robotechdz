# Runbook P1 — Bascule du poller mailbox (boutique → LoadBrain)

> Objet : passer la capture des emails Netflix (OTP/household) du poller **boutique** au poller **LoadBrain**, sans interruption de service client, via un **dual-run** vérifié puis une extinction par flag. Réversible à tout instant.

## Pré-requis (avant toute activation prod)

1. **Rotation du secret webhook** (`LOADBRAIN_WEBHOOK_SECRET` / `NETFLIX_WEBHOOK_SECRET_AGENT007`) — il a été dans l'historique git. Nouveau secret, **identique des deux côtés**, injecté via secrets CI uniquement.
2. P0 mergé/déployé des deux côtés (récepteur webhook boutique + émetteur LoadBrain actifs).
3. P1 mergé/déployé : poller LoadBrain émet `code.captured` (P1-1) ; boutique persiste `code.captured` en `slot_events` pour le replay (P1-2).
4. Les comptes Outlook sont importés côté LoadBrain (`migrate-from-100pcia.ts`, P0/A5) avec `ms_status='CONNECTED'` et les `public_token` = tokens d'activation boutique.

## Variables d'environnement

| Côté | Variable | Dual-run | Après cutover |
|---|---|---|---|
| LoadBrain | `NETFLIX_ENABLE_MAILBOX` | `true` | `true` |
| LoadBrain | `NETFLIX_WEBHOOK_URL_AGENT007` | URL boutique `…/api/loadbrain/netflix/webhook` | idem |
| LoadBrain | `NETFLIX_WEBHOOK_SECRET_AGENT007` | secret (rotaté) | idem |
| LoadBrain | `NETFLIX_SITE_ID_AGENT007` | UUID site AGENT007 | idem |
| LoadBrain | `REDIS_URL` / `DATABASE_URL` (netflix) | pointer le bon Redis + DB netflix | idem |
| Boutique | `LOADBRAIN_WEBHOOK_SECRET` | secret (rotaté, = ci-dessus) | idem |
| Boutique | `STREAMING_DEEPLINK_MODE` | `true` (poller boutique encore ON) | **`false`** (poller boutique OFF) |

## Étape 1 — Dual-run (les deux pollers tournent)

Les deux systèmes pollent les **mêmes** boîtes Outlook. La **dédup par `source_email_id`** empêche le double-traitement :
- LoadBrain : `netflix.codes` unique `(account_id, source_email_id)` → `onConflictDoNothing`.
- Boutique : `slot_events` unique partiel `se_dedup_idx (digital_code_id, source_email_id)` → l'OTP capté par le poller boutique ET celui rejoué par le webhook LoadBrain (avec `source_email_id = codeId` stable) **convergent sur la même ligne** ; la livraison SSE est exactly-once (UPDATE gardé `deliveredToSession`).

1. Activer `NETFLIX_ENABLE_MAILBOX=true` côté LoadBrain (garder `STREAMING_DEEPLINK_MODE=true` côté boutique).
2. Laisser tourner 24–48 h sur le trafic réel.

## Étape 2 — Vérification de parité

Sur une fenêtre temporelle T :
- **Couverture** : tout email Netflix capté par le poller boutique l'est aussi par LoadBrain.
  ```sql
  -- LoadBrain
  SELECT count(*) FROM netflix.codes WHERE received_at > now() - interval '24 hours';
  -- Boutique
  SELECT count(*) FROM slot_events WHERE received_at > now() - interval '24 hours';
  ```
  Les volumes doivent être cohérents (à la latence de poll près).
- **Pas de double livraison client** : aucun OTP affiché deux fois sur `/activer` (la garde exactly-once doit l'empêcher même si les deux sources écrivent).
- **Auto-approve household** : les liens household sont cliqués par le worker Playwright LoadBrain (vérifier `netflix.routing_decisions.outcome='AUTO_APPROVED'`).
- **Smoke client** : ouvrir un `/activer/[token]` réel, déclencher un OTP Netflix, vérifier l'affichage temps réel + le **replay** (rouvrir la page après coup → l'OTP réapparaît via `slot_events`).

Critère GO : couverture cohérente + 0 double livraison + auto-approve OK + smoke client vert.

## Étape 3 — Extinction du poller boutique

1. Poser `STREAMING_DEEPLINK_MODE=false` côté boutique → le poller boutique s'arrête (l'init est gardée par ce flag dans `instrumentation.ts`).
2. À partir de là, **LoadBrain est la seule source** des captures ; la boutique ne reçoit les OTP/household que par webhook `code.captured` → `slot_events` → SSE.
3. Surveiller 24 h : livraison OTP nominale, latence acceptable, pas d'erreurs récepteur webhook.

## Rollback (à tout instant)

- **Reprise immédiate du poller boutique** : `STREAMING_DEEPLINK_MODE=true` (redéploie/redémarre l'instance boutique) → les deux pollers re-tournent (dual-run), dédup garantit l'absence de double traitement.
- **Couper LoadBrain** : `NETFLIX_ENABLE_MAILBOX=false` → seul le poller boutique capture (état pré-P1). Aucune perte (les `slot_events` déjà persistés restent rejouables).

## Pièges connus

- **Clé de chiffrement** : le worker LoadBrain `encrypt()` exige `NETFLIX_ENCRYPTION_KEY_V1`. `runOnePass` avale les erreurs par-email → une clé absente ferait **silencieusement** tomber la capture OTP sur toute la passe. Vérifier la présence de la clé avant d'activer le poller.
- **Latence de poll** : intensité HIGH/NORMAL/LOW côté LoadBrain — vérifier que l'intensité HIGH (≈30 s) s'applique bien aux comptes avec une page `/activer` récemment ouverte (sinon l'OTP arrive en retard).
- **Idempotence cache récepteur** : la dédup `delivery_id` du récepteur boutique est in-process (par instance). En multi-instance, la dédup repose surtout sur l'unique DB `se_dedup_idx` (robuste) ; le cache n'est qu'une optimisation. À durcir (store partagé) si scale horizontal.
- **Secret non rotaté** = blocage : un secret encore présent dans l'historique git doit être considéré compromis avant tout trafic prod.
