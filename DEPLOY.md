# Guide de Déploiement VPS (Docker)

## Prérequis VPS
- Ubuntu 22.04 LTS (recommandé)
- Docker & Docker Compose
- Nginx (reverse proxy sur l'hôte)
- Un nom de domaine configuré (app, n8n, waha)

---

## 1. Préparation du serveur (Docker & Nginx)

Connectez-vous à votre VPS en SSH, puis installez les prérequis :

```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Installation de Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Installation de Nginx
sudo apt install -y nginx
sudo systemctl enable nginx
```

*Déconnectez-vous et reconnectez-vous pour que les groupes Docker soient pris en compte.*

---

## 2. Déploiement de l'application

```bash
# Clone ou copie du projet
mkdir -p /var/www
cd /var/www
git clone <your-repo> 100-pc-ia
cd 100-pc-ia

# Configuration des variables d'environnement
cp .env.example .env
nano .env   # Remplir toutes les valeurs (voir section 3)

# Lancer la stack complète avec Docker Compose
docker compose -f docker-compose.prod.yml up -d --build

# Migrations de la base de données (sur le conteneur Node)
docker compose -f docker-compose.prod.yml exec app npm run db:push

# Backfill du chiffrement des secrets shop_settings (B6) — voir §3 bis.
# Idempotent. Lance-le APRÈS db:push et APRÈS avoir seedé/restauré les
# valeurs dans shop_settings (sinon il chiffre du vide, pas de risque mais inutile).
docker compose -f docker-compose.prod.yml exec app npx tsx scripts/backfill-encrypt-settings.ts
```

---

## 3. Variables d'environnement (.env)

Générer des secrets robustes :
```bash
openssl rand -hex 32   # Pour SESSION_SECRET
openssl rand -hex 32   # Pour ENCRYPTION_KEY
openssl rand -hex 32   # Pour PRINT_SECRET
openssl rand -hex 32   # Pour CRON_SECRET
```

Ajoutez/Modifiez ces variables spécifiques au déploiement Docker dans votre `.env` :
```env
# Variables demandées par le docker-compose.prod.yml
DB_PASSWORD="VOTRE_MOT_DE_PASSE_DB"
WHATSAPP_API_KEY="abc" # Ou une clé plus sécurisée

# Base de données (le hostname est 'db' qui correspond au container Docker)
DATABASE_URL="postgres://flexbox_user:VOTRE_MOT_DE_PASSE_DB@db:5432/flexbox"
REDIS_URL="redis://redis:6379"

# WhatsApp (Waha est accessible dans le réseau Docker via 'whatsapp')
WHATSAPP_API_URL="http://whatsapp:3000"

NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://boutique.nexusbox.tech"
NEXTAUTH_URL="https://boutique.nexusbox.tech"
NEXT_PUBLIC_BASE_URL="https://boutique.nexusbox.tech"
PUBLIC_URL="https://boutique.nexusbox.tech"
MICROSOFT_REDIRECT_URI="https://boutique.nexusbox.tech/api/auth/microsoft/callback"
```

---

## 3 bis. Décision `ENCRYPTION_KEY` — DB existante OU fresh ?

Les 8 colonnes secrètes de `shop_settings` (telegram/whatsapp/gemini/vapid/microsoft/netflix)
sont chiffrées au repos via `ENCRYPTION_KEY` (AES-256-GCM, feature B6). La clé doit
être **stable et cohérente avec les données déjà en DB** — sinon les secrets deviennent
illisibles (`fromDriver` renvoie `""`, l'app tourne mais WhatsApp/Telegram/etc. ne se
configurent pas).

### Scénario A — migration depuis prod existante (dump → restore)

1. **Garde la MÊME `ENCRYPTION_KEY`** que la prod actuelle dans `.env`.
2. Restaure le dump SQL → les colonnes chiffrées sont déjà en ciphertext, cohérentes.
3. `db:push` (no-op si schema identique) puis **SKIP le backfill** (déjà fait sur la prod source).

### Scénario B — fresh DB (nouveau site, pas de dump)

1. **Génère une nouvelle clé** : `openssl rand -hex 32` → `ENCRYPTION_KEY` dans `.env`.
2. `db:push` (crée le schema).
3. Seed les valeurs en **clair** dans `shop_settings` (UI `/admin/settings` après login admin,
   OU `INSERT INTO shop_settings (...)` avec les valeurs cleartext).
4. Lance le backfill : `npx tsx scripts/backfill-encrypt-settings.ts` — il lit les colonnes en
   raw SQL, chiffre les valeurs cleartext, ré-écrit. Idempotent (re-run = no-op).

### Garde-fou commun

Si tu remplaces `ENCRYPTION_KEY` après coup sur une DB qui contient déjà du ciphertext :
les anciennes valeurs deviennent du bruit, le backfill ne les sauve pas (il les voit comme
ciphertext et passe). → Sauvegarde + re-seed manuel des secrets dans ce cas.

---

## 4. Nginx — Reverse Proxy

```nginx
# /etc/nginx/sites-available/100-pc-ia
server {
    listen 80;
    server_name boutique.nexusbox.tech n8n.boutique.nexusbox.tech waha.boutique.nexusbox.tech;
    return 301 https://$server_name$request_uri;
}

# Proxy Principal (Next.js)
server {
    listen 443 ssl http2;
    server_name boutique.nexusbox.tech;

    # SSL (Let's Encrypt config passée plus bas)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 10M;
}

# Proxy n8n
server {
    listen 443 ssl http2;
    server_name n8n.boutique.nexusbox.tech;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Proxy Waha
server {
    listen 443 ssl http2;
    server_name waha.boutique.nexusbox.tech;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/100-pc-ia /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. SSL — Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d boutique.nexusbox.tech -d n8n.boutique.nexusbox.tech -d waha.boutique.nexusbox.tech
sudo systemctl enable certbot.timer
```

---

## 6. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 7. Backups (Automatisé OVH ou script local)

Le VPS OVH prend des backups automatiques réguliers (comme commandé : "Automated Backup with 1 rotation"), mais il est toujours recommandé d'avoir un dump SQL :

```bash
# Cron backup quotidien
crontab -e
# Ajouter:
0 3 * * * docker exec robotech-db pg_dump -U flexbox_user flexbox | gzip > /var/www/100-pc-ia/backups/flexbox_$(date +\%Y\%m\%d).sql.gz
```

---

## 7b. Tâches planifiées (cron) — fiabilité LoadBrain

Trois endpoints (protégés par `CRON_SECRET`) doivent tourner périodiquement, sinon
des livraisons ratées ne sont jamais réessayées et des commandes peuvent rester
bloquées en `PENDING_LOADBRAIN` quand un webhook entrant est manqué :

| Endpoint | Rôle | Cadence conseillée |
|----------|------|--------------------|
| `GET /api/admin/cron/webhook-retries` (header `Authorization: Bearer $CRON_SECRET`) | Rejoue la DLQ des webhooks sortants reseller | toutes les minutes |
| `POST /api/admin/g2bulk/reconcile` (header `x-cron-secret: $CRON_SECRET`) | Rattrape les commandes G2Bulk dont le webhook a été manqué | toutes les ~10 min |
| `POST /api/admin/iptv/reconcile` (header `x-cron-secret: $CRON_SECRET`) | Idem pour l'IPTV reseller | toutes les ~10 min |
| `GET /api/admin/cron/refresh-balances` (header `Authorization: Bearer $CRON_SECRET`) | Rafraîchit les soldes des fournisseurs externes (CapSolver / 2Captcha / AntiCaptcha) et déclenche les alertes de seuil bas | toutes les ~10 min |

Le script `scripts/cron-tick.sh` appelle ces endpoints avec les bons headers. Ils
sont idempotents (verrous `FOR UPDATE` + gardes de statut / `SKIP LOCKED`), donc les
faire tourner en parallèle d'un autre scheduler (n8n) est sans risque.

```bash
crontab -e
# Ajouter :
* * * * *    CRON_SECRET=xxxx CRON_APP_URL=https://boutique.nexusbox.tech /var/www/100-pc-ia/scripts/cron-tick.sh retries   >> /var/log/robotech-cron.log 2>&1
*/10 * * * * CRON_SECRET=xxxx CRON_APP_URL=https://boutique.nexusbox.tech /var/www/100-pc-ia/scripts/cron-tick.sh reconcile >> /var/log/robotech-cron.log 2>&1
*/10 * * * * CRON_SECRET=xxxx CRON_APP_URL=https://boutique.nexusbox.tech /var/www/100-pc-ia/scripts/cron-tick.sh balances  >> /var/log/robotech-cron.log 2>&1
```

`CRON_SECRET` doit être identique à la variable d'environnement de l'app. Variante
Docker : `docker exec robotech-app sh scripts/cron-tick.sh reconcile` (le conteneur
a déjà `CRON_SECRET` + `NEXT_PUBLIC_APP_URL`).

---

## 8. Monitoring / Updates

```bash
# Voir les logs de toute la stack
docker compose -f docker-compose.prod.yml logs -f

# Mettre à jour l'application
git pull
docker compose -f docker-compose.prod.yml up -d --build
```
