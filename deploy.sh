#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════════════════════
# ROBOTECH — Script de déploiement VPS
# Usage: ./deploy.sh [setup|deploy|update|logs|status|backup|restore]
# ═══════════════════════════════════════════════════════════════════════════════

APP_DIR="/opt/robotech"
COMPOSE_FILE="docker-compose.prod.yml"
REPO_URL="https://github.com/YOUR_USER/100-pc-IA.git"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[ROBOTECH]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── SETUP : Premier déploiement sur un VPS vierge ──────────────────────────
setup() {
    log "═══ SETUP INITIAL DU VPS ═══"

    # 1. Paquets système
    log "Installation des paquets..."
    apt-get update -qq
    apt-get install -y -qq curl git ufw fail2ban > /dev/null

    # 2. Docker
    if ! command -v docker &> /dev/null; then
        log "Installation de Docker..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
    else
        log "Docker déjà installé."
    fi

    # 3. Firewall
    log "Configuration du firewall..."
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP (Cloudflare)
    ufw allow 443/tcp   # HTTPS (Cloudflare)
    ufw --force enable

    # 4. Créer le dossier app
    mkdir -p $APP_DIR
    log "Dossier créé : $APP_DIR"

    # 5. Cloner le repo ou copier les fichiers
    if [ -d "$APP_DIR/.git" ]; then
        log "Repo déjà présent, pull..."
        cd $APP_DIR && git pull
    else
        log "Clone du repo..."
        git clone $REPO_URL $APP_DIR || {
            warn "Clone échoué. Copiez manuellement les fichiers dans $APP_DIR"
            warn "Puis relancez: ./deploy.sh deploy"
            exit 0
        }
    fi

    # 6. .env.production
    if [ ! -f "$APP_DIR/.env.production" ]; then
        cp $APP_DIR/.env.production.example $APP_DIR/.env.production
        warn "IMPORTANT: Éditez $APP_DIR/.env.production avec vos vraies valeurs !"
        warn "  nano $APP_DIR/.env.production"
        warn "Puis lancez: ./deploy.sh deploy"
        exit 0
    fi

    deploy
}

# ─── DEPLOY : Build + lancement ─────────────────────────────────────────────
deploy() {
    log "═══ DÉPLOIEMENT ═══"
    cd $APP_DIR

    [ ! -f ".env.production" ] && err ".env.production manquant ! Copiez .env.production.example"

    # Charger DB_PASSWORD pour le build
    export $(grep -v '^#' .env.production | xargs)

    # Build l'image Next.js
    log "Build de l'image Next.js..."
    docker compose -f $COMPOSE_FILE build app

    # Démarrer tous les services
    log "Démarrage de tous les services..."
    docker compose -f $COMPOSE_FILE up -d

    # Attendre que PostgreSQL soit prêt
    log "Attente de PostgreSQL..."
    until docker compose -f $COMPOSE_FILE exec -T db pg_isready -U flexbox_user -d flexbox > /dev/null 2>&1; do
        sleep 2
    done
    log "PostgreSQL prêt."

    # Pousser le schéma Drizzle
    log "Migration du schéma DB..."
    docker compose -f $COMPOSE_FILE exec -T app npx drizzle-kit push 2>/dev/null || {
        warn "drizzle-kit push depuis le container a échoué."
        warn "Lancez manuellement: DATABASE_URL=... npx drizzle-kit push"
    }

    log "Vérification des services..."
    sleep 5
    status

    log "═══ DÉPLOIEMENT TERMINÉ ═══"
    echo ""
    log "Site accessible sur : $(grep NEXT_PUBLIC_APP_URL .env.production | cut -d= -f2 | tr -d '\"')"
}

# ─── UPDATE : Mise à jour rapide (git pull + rebuild app) ───────────────────
update() {
    log "═══ MISE À JOUR ═══"
    cd $APP_DIR

    log "Pull des dernières modifications..."
    git pull

    log "Rebuild de l'image Next.js..."
    export $(grep -v '^#' .env.production | xargs)
    docker compose -f $COMPOSE_FILE build app

    log "Redémarrage de l'app..."
    docker compose -f $COMPOSE_FILE up -d app

    sleep 5
    status
    log "═══ MISE À JOUR TERMINÉE ═══"
}

# ─── STATUS : État des services ─────────────────────────────────────────────
status() {
    log "═══ ÉTAT DES SERVICES ═══"
    cd $APP_DIR
    docker compose -f $COMPOSE_FILE ps
    echo ""

    # Test local
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/login 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log "✅ App Next.js : OK (HTTP $HTTP_CODE)"
    else
        warn "❌ App Next.js : DOWN (HTTP $HTTP_CODE)"
    fi

    # Test WAHA
    WAHA_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/sessions 2>/dev/null || echo "000")
    if [ "$WAHA_CODE" = "200" ] || [ "$WAHA_CODE" = "401" ] || [ "$WAHA_CODE" = "403" ]; then
        log "✅ WAHA WhatsApp : OK"
    else
        warn "❌ WAHA WhatsApp : DOWN"
    fi

    # Test n8n
    N8N_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5678 2>/dev/null || echo "000")
    if [ "$N8N_CODE" != "000" ]; then
        log "✅ n8n : OK"
    else
        warn "❌ n8n : DOWN"
    fi
}

# ─── LOGS : Voir les logs ───────────────────────────────────────────────────
logs() {
    cd $APP_DIR
    SERVICE=${2:-app}
    docker compose -f $COMPOSE_FILE logs -f --tail=100 $SERVICE
}

# ─── BACKUP : Sauvegarder la DB ─────────────────────────────────────────────
backup() {
    log "═══ BACKUP BASE DE DONNÉES ═══"
    cd $APP_DIR
    BACKUP_FILE="backup_flexbox_$(date +%Y%m%d_%H%M%S).sql.gz"
    docker compose -f $COMPOSE_FILE exec -T db pg_dump -U flexbox_user flexbox | gzip > "$BACKUP_FILE"
    log "Backup créé : $APP_DIR/$BACKUP_FILE"
}

# ─── RESTORE : Restaurer un backup ──────────────────────────────────────────
restore() {
    BACKUP_FILE=$2
    [ -z "$BACKUP_FILE" ] && err "Usage: ./deploy.sh restore backup_file.sql.gz"
    [ ! -f "$BACKUP_FILE" ] && err "Fichier non trouvé : $BACKUP_FILE"

    warn "Ceci va ÉCRASER la base de données actuelle !"
    read -p "Continuer ? (y/N) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0

    cd $APP_DIR
    gunzip -c "$BACKUP_FILE" | docker compose -f $COMPOSE_FILE exec -T db psql -U flexbox_user -d flexbox
    log "Restore terminé."
}

# ─── Main ────────────────────────────────────────────────────────────────────
case "${1:-}" in
    setup)   setup ;;
    deploy)  deploy ;;
    update)  update ;;
    status)  status ;;
    logs)    logs "$@" ;;
    backup)  backup ;;
    restore) restore "$@" ;;
    *)
        echo "Usage: ./deploy.sh [setup|deploy|update|status|logs|backup|restore]"
        echo ""
        echo "  setup   - Premier déploiement (installe Docker, firewall, etc.)"
        echo "  deploy  - Build + lance tous les services"
        echo "  update  - Pull + rebuild app seulement"
        echo "  status  - État de tous les services"
        echo "  logs    - Logs (défaut: app). Ex: ./deploy.sh logs whatsapp"
        echo "  backup  - Sauvegarde PostgreSQL"
        echo "  restore - Restaurer un backup. Ex: ./deploy.sh restore backup.sql.gz"
        ;;
esac
