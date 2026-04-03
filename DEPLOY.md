# Guide de Déploiement VPS

## Prérequis VPS
- Ubuntu 22.04 LTS (recommandé)
- Node.js 20 LTS
- PostgreSQL 15+
- Redis 7+
- Nginx (reverse proxy)
- PM2 (process manager)

---

## 1. Préparation du serveur

```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 global
sudo npm install -g pm2

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Nginx
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

## 2. Base de données

```bash
sudo -u postgres psql
CREATE DATABASE flexbox;
CREATE USER flexbox_user WITH ENCRYPTED PASSWORD 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE flexbox TO flexbox_user;
\q
```

---

## 3. Déploiement de l'application

```bash
# Clone ou copie du projet
cd /var/www
git clone <your-repo> 100-pc-ia
cd 100-pc-ia

# Installation des dépendances
npm ci --omit=dev

# Configuration des variables d'environnement
cp .env.example .env
nano .env   # Remplir toutes les valeurs

# Build de production
npm run build

# Migrations Drizzle
npm run db:push  # ou: npx drizzle-kit push
```

---

## 4. Variables d'environnement (.env)

Générer les secrets :
```bash
openssl rand -hex 32   # Pour SESSION_SECRET
openssl rand -hex 32   # Pour ENCRYPTION_KEY
openssl rand -hex 32   # Pour PRINT_SECRET
openssl rand -hex 32   # Pour CRON_SECRET
```

Vérifier que **toutes** les variables du `.env.example` sont renseignées.

---

## 5. PM2 — Process Manager

```bash
# Créer ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: '100-pc-ia',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/var/www/100-pc-ia',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '512M',
    error_file: '/var/log/pm2/100-pc-ia-error.log',
    out_file: '/var/log/pm2/100-pc-ia-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
}
EOF

pm2 start ecosystem.config.js
pm2 save
pm2 startup   # Suivre les instructions pour auto-démarrage
```

---

## 6. Nginx — Reverse Proxy

```nginx
# /etc/nginx/sites-available/100-pc-ia
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Gzip
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;

    # Proxy vers Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # SSE — désactiver le buffering pour les Server-Sent Events
    location /api/events/stream {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }

    # Fichiers statiques Next.js avec cache agressif
    location /_next/static/ {
        proxy_pass http://localhost:3000;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Limiter la taille des uploads
    client_max_body_size 10M;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/100-pc-ia /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. SSL — Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
sudo systemctl enable certbot.timer
```

---

## 8. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 9. Index PostgreSQL manquants

Exécuter après le premier déploiement :

```sql
-- Connexion rapide au login (recherche par email)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Recherche clients
CREATE INDEX IF NOT EXISTS idx_clients_telephone ON clients(telephone);

-- Commandes par statut et date
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
```

---

## 10. Checklist finale avant go-live

- [ ] `NODE_ENV=production` dans `.env`
- [ ] `SESSION_SECRET` ≥ 32 caractères aléatoires
- [ ] `ENCRYPTION_KEY` ≥ 32 caractères aléatoires
- [ ] `DATABASE_URL` pointe vers la DB de production
- [ ] `REDIS_URL` opérationnel
- [ ] `NEXT_PUBLIC_APP_URL` = URL publique réelle
- [ ] SSL configuré et fonctionnel (HTTPS)
- [ ] Nginx en reverse proxy avec headers X-Forwarded-Proto
- [ ] PM2 configuré avec auto-restart
- [ ] Firewall activé (ports 80, 443, SSH seulement)
- [ ] Backups automatiques PostgreSQL configurés
- [ ] `whatsappVerifyToken` configuré dans les settings de l'app (via interface admin)
- [ ] Token Telegram configuré si notifications actives
- [ ] `npm audit` exécuté sans vulnérabilités critiques

---

## 11. Backups PostgreSQL

```bash
# Cron backup quotidien
crontab -e
# Ajouter:
0 3 * * * pg_dump -U flexbox_user flexbox | gzip > /backups/flexbox_$(date +\%Y\%m\%d).sql.gz
```

---

## 12. Monitoring

```bash
# Logs PM2 en temps réel
pm2 logs 100-pc-ia

# Status des processus
pm2 status

# Redémarrage après mise à jour
git pull && npm ci --omit=dev && npm run build && pm2 restart 100-pc-ia
```
