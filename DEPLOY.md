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
NEXT_PUBLIC_APP_URL="https://votre-domaine.com"
```

---

## 4. Nginx — Reverse Proxy

```nginx
# /etc/nginx/sites-available/100-pc-ia
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com n8n.yourdomain.com waha.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# Proxy Principal (Next.js)
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

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
    server_name n8n.yourdomain.com;

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
    server_name waha.yourdomain.com;

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
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d n8n.yourdomain.com -d waha.yourdomain.com
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

## 8. Monitoring / Updates

```bash
# Voir les logs de toute la stack
docker compose -f docker-compose.prod.yml logs -f

# Mettre à jour l'application
git pull
docker compose -f docker-compose.prod.yml up -d --build
```
