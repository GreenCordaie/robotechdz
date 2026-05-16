# Auto-Deploy via GitHub Actions

Push sur `master` (ou `avant-netflix-n8n`) → SSH vers VPS → backup DB + image → build + restart → rollback auto si échec.

## Setup (à faire 1 fois)

### 1. Générer une clé SSH dédiée au CI

Sur ta machine :
```bash
ssh-keygen -t ed25519 -f ~/.ssh/robotech_deploy -N "" -C "github-actions@robotech"
```

Tu obtiens 2 fichiers :
- `~/.ssh/robotech_deploy.pub` → clé publique, à coller sur le VPS
- `~/.ssh/robotech_deploy` → clé privée, à coller dans GitHub secrets

### 2. Autoriser la clé sur le VPS

SSH sur le VPS comme d'habitude, puis :
```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat >> ~/.ssh/authorized_keys <<'EOF'
<PASTE le contenu de ~/.ssh/robotech_deploy.pub ICI>
EOF
chmod 600 ~/.ssh/authorized_keys
```

Test depuis ta machine locale :
```bash
ssh -i ~/.ssh/robotech_deploy <user>@<vps_ip> "cd /opt/robotech && pwd"
# Doit afficher /opt/robotech sans demander de password
```

### 3. Configurer GitHub Secrets

Dans GitHub : `Settings → Secrets and variables → Actions → New repository secret`. Ajoute :

| Nom | Valeur | Obligatoire |
|---|---|---|
| `VPS_HOST` | IP ou hostname du VPS (l'origine derrière Cloudflare) | ✅ |
| `VPS_USER` | utilisateur SSH (`root` ou autre) | ✅ |
| `VPS_SSH_KEY` | **contenu complet** de `~/.ssh/robotech_deploy` (clé privée) | ✅ |
| `VPS_PORT` | port SSH si non-standard | optionnel (default 22) |
| `TELEGRAM_BOT_TOKEN` | token bot pour notifications deploy | optionnel |
| `TELEGRAM_ADMIN_CHAT_ID` | chat ID admin pour notifications deploy | optionnel |

### 4. Bootstrap initial sur le VPS (1 fois)

Le workflow s'attend à ce que le repo soit cloné sur le VPS. Si ce n'est pas déjà fait :
```bash
ssh <user>@<vps_ip>
cd /opt
git clone https://github.com/GreenCordaie/robotechdz.git robotech
cd robotech
cp .env.production.example .env.production
nano .env.production   # remplir les vraies valeurs
./deploy.sh setup      # première install Docker + lance les services
```

Vérifier que `LOADBRAIN_SITE_URL`, `LOADBRAIN_URL`, `LOADBRAIN_WEBHOOK_SECRET` sont bien dans `.env.production`.

## Utilisation

### Auto-deploy (push)

Chaque push sur `master` déclenche `.github/workflows/deploy.yml`. Le workflow :
1. SSH au VPS
2. `git fetch + checkout` du SHA poussé
3. Backup DB (gzippé dans `/opt/robotech/backups/pre_<sha-from>_to_<sha-to>_<timestamp>.sql.gz`)
4. Tag image actuelle comme `previous` + `<short-sha>`
5. Build + restart container `app`
6. Migrations Drizzle
7. Health check `/api/health` (5 retries)
8. Si échec → rollback auto vers `previous`
9. Cleanup : garde 10 backups DB + 5 images SHA-taggées

### Deploy manuel (workflow_dispatch)

GitHub → onglet `Actions` → `Deploy to VPS` → `Run workflow` → choisir branche/SHA/tag.

Utile pour :
- Déployer une version spécifique (tag `v12.3.0` par exemple)
- Re-déployer un SHA existant (force-rebuild)

### Rollback manuel

GitHub → `Actions` → `Rollback Production` → `Run workflow` :
- `target` : `previous` (default) ou un SHA précis (ex: `a84d48d`)
- `restore_db` : `yes` pour aussi restaurer le dernier backup DB pré-deploy ; `no` (default) sinon

⚠️ **`restore_db: yes` perd toutes les données créées depuis le deploy fautif.** À utiliser seulement si la nouvelle version a corrompu le schéma ou les données.

### Commandes locales sur le VPS

```bash
cd /opt/robotech
./deploy.sh list-backups              # voir backups + images dispos
./deploy.sh rollback previous         # rollback rapide
./deploy.sh rollback a84d48d          # rollback à un SHA précis
./deploy.sh restore-db backups/pre_... # restore DB (prompt confirmation)
./deploy.sh restore-db file.sql.gz --force  # restore sans prompt
./deploy.sh status                    # état des services
./deploy.sh logs app                  # logs de l'app
```

## Sauvegarde et rétention

| Type | Localisation | Rétention | Format |
|---|---|---|---|
| DB pre-deploy | `/opt/robotech/backups/pre_*.sql.gz` | 10 dernières | gzip pg_dump |
| DB manuelle | `/opt/robotech/backup_flexbox_*.sql.gz` | aucune | gzip pg_dump |
| Images Docker | `robotech-app:<short-sha>` | 5 dernières (hors `latest`/`previous`) | Docker image |
| Image rollback | `robotech-app:previous` | toujours = avant-dernière | Docker image |

**Backup OVH automatique** continue par-dessus (1 rotation per spec OVH).

## Failure modes et récupération

| Échec | Comportement | Action manuelle |
|---|---|---|
| Build échoue | git HEAD restauré, image inchangée | Rien — fix code, push à nouveau |
| Migration échoue | Rollback auto vers `previous` | Inspecter logs, corriger migration |
| Health check 500/timeout | Rollback auto vers `previous` | Inspecter logs `docker compose logs app` |
| DB backup échoue | Deploy annulé avant tout changement | Vérifier espace disque, droits |
| Rollback échoue | Workflow émet erreur Telegram | SSH manuel + `./deploy.sh status` |

## Workflow de release recommandé

```bash
# Sur ta machine
git checkout master
git merge --no-ff avant-netflix-n8n
git tag -a v12.3.0 -m "v12.3.0 — IPTV webhook recovery + Ibosol Option A"
git push origin master --tags
```

Push déclenche auto-deploy. Si KO, rollback auto. Si tu veux re-déployer un tag spécifique : `Actions → Deploy → Run workflow → ref: v12.3.0`.
