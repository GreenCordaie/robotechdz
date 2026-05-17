# Release v13.0.0 — Notes de déploiement

> Bundle merge des EPIC 0/1/2/6/11/CI. Voir [CHANGELOG.md](CHANGELOG.md) section `[13.0.0]` pour le détail.
> Tag : `v13.0.0` · Commit : `a1df514`

## Ce qui est nouveau côté ops

| Domaine | Endpoint / Page | Quand |
|---|---|---|
| Webhook DLQ retry | `GET /api/admin/cron/webhook-retries` | Toutes les minutes |
| DLQ cleanup + notif logs cleanup | `GET /api/admin/cron/webhook-cleanup` | 1× par jour |
| Admin DLQ viewer | `/admin/b2b/webhooks/dlq` | UI SAV |
| Admin notif logs viewer | `/admin/settings/notifications/logs` | UI SAV |
| Admin notif templates | `/admin/settings/notifications` | UI edit messages WhatsApp |

## 1. Pré-deploy : vérifier l'env prod

`deploy.sh` lance `drizzle-kit push` automatiquement post-pull → les 5 nouvelles
tables / colonnes (`reseller_signup_requests`, `reseller_webhooks`,
`webhook_delivery_attempts`, `notification_templates`, `notification_logs` +
columns `notification_preferences`, `auto_send_whatsapp`) sont créées sans action manuelle.

**ENV à vérifier dans `.env.production` avant de pousser** :

```bash
# Critique — sinon les cron endpoints retournent 401
CRON_SECRET=<random 32+ chars>

# Si tu veux activer les outbound webhooks vers les resellers
# (rien à set ici, le secret HMAC est par-webhook dans la DB)

# LoadBrain — si tu veux le marketplace en prod (sinon les routes /api/loadbrain/* renvoient 503)
LOADBRAIN_API_KEY=...
LOADBRAIN_URL=https://...
LOADBRAIN_SITE_URL=https://boutique.tld
LOADBRAIN_WEBHOOK_SECRET=...

# WhatsApp — configurable aussi via /admin/settings UI (shop_settings)
WHATSAPP_API_URL=http://localhost:3001
WHATSAPP_API_KEY=...
WHATSAPP_INSTANCE_NAME=FLEXBOX_BOT
```

## 2. Deploy

Push sur `master` déclenche `.github/workflows/deploy.yml` qui :
1. SSH sur le VPS
2. `git checkout` du tag
3. `./deploy.sh deploy-with-backup` :
   - Backup DB
   - Pull code
   - `npm install` + `next build`
   - `drizzle-kit push` (auto-applique les migrations 0008–0012)
   - Restart Docker compose
   - Healthcheck

Manuel équivalent :
```bash
ssh vps
cd /opt/robotech
git fetch origin --tags
./deploy.sh deploy-with-backup v13.0.0
```

## 3. Configurer les 2 nouveaux crons

Les endpoints sont auth par `Authorization: Bearer $CRON_SECRET`.
Choisis UN des 3 mécanismes ci-dessous.

### Option A — Cron Linux (le plus simple sur VPS)

`crontab -e` sur le VPS :
```cron
# Webhook DLQ retry — toutes les minutes
* * * * * curl -fsS -H "Authorization: Bearer $(grep CRON_SECRET /opt/robotech/.env | cut -d= -f2)" https://boutique.tld/api/admin/cron/webhook-retries > /dev/null

# Cleanup DLQ + notification_logs — tous les jours à 3h du matin
0 3 * * * curl -fsS -H "Authorization: Bearer $(grep CRON_SECRET /opt/robotech/.env | cut -d= -f2)" https://boutique.tld/api/admin/cron/webhook-cleanup > /dev/null
```

### Option B — n8n (déjà déployé)

Workflow 1 (retry) :
- Trigger : Schedule node, interval = 1 minute
- HTTP Request : `GET https://boutique.tld/api/admin/cron/webhook-retries`
  - Header : `Authorization: Bearer {{$env.CRON_SECRET}}`

Workflow 2 (cleanup) :
- Trigger : Schedule node, cron `0 3 * * *`
- Même HTTP Request vers `/webhook-cleanup`

### Option C — GitHub Actions scheduled

Créer `.github/workflows/cron-webhooks.yml` :
```yaml
name: Webhook crons

on:
  schedule:
    - cron: '* * * * *'      # retry chaque minute (subject to GitHub min ~5min)
    - cron: '0 3 * * *'      # cleanup quotidien

jobs:
  retry:
    if: github.event.schedule == '* * * * *'
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://boutique.tld/api/admin/cron/webhook-retries

  cleanup:
    if: github.event.schedule == '0 3 * * *'
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://boutique.tld/api/admin/cron/webhook-cleanup
```

> ⚠️ GitHub Actions min interval ≈ 5min en pratique. Si tu veux du vrai 1min,
> préfère option A (cron Linux) ou B (n8n local).

## 4. Smoke test post-deploy

```bash
# 1. Healthcheck
curl https://boutique.tld/api/health
# → {"status":"ok"}

# 2. Cron endpoints répondent 401 sans secret, 200 avec
curl -i https://boutique.tld/api/admin/cron/webhook-retries
# → 401
curl -i -H "Authorization: Bearer $CRON_SECRET" https://boutique.tld/api/admin/cron/webhook-retries
# → 200 {"success":true,"processed":0,"succeeded":0,"failed":0,"dead":0}

curl -i -H "Authorization: Bearer $CRON_SECRET" https://boutique.tld/api/admin/cron/webhook-cleanup
# → 200 {"success":true,"resolvedDeleted":0,"deadDeleted":0,"notifLogsDeleted":0,"cutoffs":{...}}

# 3. UI admin nouvelles pages
# - https://boutique.tld/admin/b2b/webhooks       (vue globale + SAV)
# - https://boutique.tld/admin/b2b/webhooks/dlq   (file de retry)
# - https://boutique.tld/admin/settings/notifications        (templates editables)
# - https://boutique.tld/admin/settings/notifications/logs   (audit envois)
# - https://boutique.tld/admin/settings → onglet Sécurité & God Mode → toggle "Auto-envoi WhatsApp kiosk"

# 4. UI reseller nouvelles pages
# - https://boutique.tld/reseller/webhooks       (CRUD webhooks outbound)
# - https://boutique.tld/reseller/settings/notifications  (opt-in/opt-out par event)
# - https://boutique.tld/api-docs                 (OpenAPI Stoplight)
```

## 5. Onboarding 1er reseller (test end-to-end)

1. Aller sur `/reseller/signup`, créer une demande
2. Admin : `/admin/b2b/signups` → approuver → user + reseller + wallet créés
3. Admin : `/admin/b2b/wallets` → recharger manuellement (cash boutique)
4. Reseller login → `/reseller/shop` → ajouter au panier → checkout
5. Vérifier que la commande apparaît dans `/reseller/orders` avec credentials
6. (Si webhook configuré) vérifier livraison HMAC dans `/admin/b2b/webhooks`

## 6. Rollback

```bash
# Sur le VPS
cd /opt/robotech
./deploy.sh rollback   # restore backup DB + git reset à la version pré-deploy
```

Ou via GitHub Actions : `.github/workflows/rollback.yml` → workflow_dispatch.

## En cas de problème

| Symptôme | Cause probable | Fix |
|---|---|---|
| Cron endpoint retourne toujours 401 | `CRON_SECRET` pas set ou mismatch entre cron caller et `.env` prod | Vérifier `grep CRON_SECRET /opt/robotech/.env` |
| Les notifs WhatsApp ne partent pas | `shop_settings.whatsapp_api_url` vide OU `auto_send_whatsapp=false` | Voir `/admin/settings/notifications/logs` colonne "reason" |
| Webhooks resellers en DEAD massif | Receiver app down côté reseller | `/admin/b2b/webhooks/dlq` → bulk dismiss ou attendre auto-cleanup |
| Page /api-docs blanche | CDN Stoplight bloqué par CSP/firewall | Whitelist `unpkg.com` ou self-host la lib |
