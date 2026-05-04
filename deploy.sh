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

# ─── DEPLOY-WITH-BACKUP : Auto-deploy used by GitHub Actions ────────────────
# Workflow:
#   1. Snapshot current SHA + DB
#   2. Tag current image as `previous` and `<short-sha>`
#   3. Checkout target ref + build new image
#   4. Restart app + run migrations
#   5. Health-check; rollback automatically on failure
#   6. Cleanup old backups (keep 10) + old images (keep 5)
deploy_with_backup() {
    local TARGET_REF="${2:-}"
    [ -z "$TARGET_REF" ] && err "Usage: ./deploy.sh deploy-with-backup <ref>"
    log "═══ DEPLOY WITH BACKUP — target=$TARGET_REF ═══"
    cd $APP_DIR

    # 1. Snapshot current state
    PREV_SHA=$(git rev-parse HEAD)
    PREV_SHORT=$(git rev-parse --short HEAD)
    log "Current: $PREV_SHORT"

    # 2. Fetch + checkout target (idempotent if already there)
    git fetch origin --tags
    git checkout "$TARGET_REF" 2>&1 | tail -3
    NEW_SHA=$(git rev-parse HEAD)
    NEW_SHORT=$(git rev-parse --short HEAD)
    log "New: $NEW_SHORT"

    if [ "$PREV_SHA" = "$NEW_SHA" ]; then
        log "Already at $NEW_SHORT — nothing to do."
        return 0
    fi

    # 3. DB backup
    BACKUP_DIR="$APP_DIR/backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/pre_${PREV_SHORT}_to_${NEW_SHORT}_$(date +%Y%m%d_%H%M%S).sql.gz"
    log "DB backup → $BACKUP_FILE"
    if ! docker compose -f $COMPOSE_FILE exec -T db \
        pg_dump -U flexbox_user flexbox 2>/dev/null | gzip > "$BACKUP_FILE"; then
        warn "DB backup failed — aborting deploy, restoring git HEAD"
        git checkout "$PREV_SHA"
        return 1
    fi

    # 4. Tag current image as previous + sha (for rollback)
    docker tag robotech-app:latest "robotech-app:$PREV_SHORT" 2>/dev/null || true
    docker tag robotech-app:latest robotech-app:previous 2>/dev/null || true

    # 5. Build new image
    log "Building image..."
    set -a; source .env.production; set +a
    if ! docker compose -f $COMPOSE_FILE build app; then
        warn "Build failed — restoring previous git HEAD (image untouched)"
        git checkout "$PREV_SHA"
        return 1
    fi
    docker tag robotech-app:latest "robotech-app:$NEW_SHORT" 2>/dev/null || true

    # 6. Restart app
    log "Restarting app..."
    docker compose -f $COMPOSE_FILE up -d app

    # 7. Run migrations
    sleep 5
    log "Running migrations..."
    if ! docker compose -f $COMPOSE_FILE exec -T app npx drizzle-kit push 2>&1 | tail -10; then
        warn "Migration failed — rolling back to $PREV_SHORT"
        rollback_to "$PREV_SHORT"
        return 1
    fi

    # 8. Health check (5 retries with backoff)
    log "Health check..."
    HTTP=000
    for i in 1 2 3 4 5; do
        sleep 3
        HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
        [ "$HTTP" = "200" ] && break
        log "  attempt $i: HTTP $HTTP"
    done
    if [ "$HTTP" != "200" ]; then
        warn "Health check FAILED (HTTP $HTTP) — rolling back to $PREV_SHORT"
        rollback_to "$PREV_SHORT"
        return 1
    fi
    log "✅ Health check OK"

    # 9. Cleanup: keep last 10 DB backups
    ls -t "$BACKUP_DIR"/pre_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm

    # 10. Cleanup: keep last 5 SHA-tagged images (preserve latest + previous)
    docker images robotech-app --format "{{.Tag}}" \
        | grep -v -E "^(latest|previous|<none>)$" \
        | tail -n +6 \
        | xargs -r -I {} docker rmi "robotech-app:{}" 2>/dev/null || true

    log "═══ ✅ DEPLOY OK — $PREV_SHORT → $NEW_SHORT ═══"
}

# ─── ROLLBACK : Revert to previous (or specified) version ────────────────────
rollback_to() {
    local TARGET="${1:-previous}"
    log "═══ ROLLBACK to $TARGET ═══"
    cd $APP_DIR

    # If target is an image tag we have, use it. Else rebuild from git ref.
    if docker image inspect "robotech-app:$TARGET" > /dev/null 2>&1; then
        log "Using cached image robotech-app:$TARGET"
        docker tag "robotech-app:$TARGET" robotech-app:latest
    else
        warn "No cached image for $TARGET — rebuilding from git"
        git fetch origin --tags
        git checkout "$TARGET"
        set -a; source .env.production; set +a
        docker compose -f $COMPOSE_FILE build app
        SHORT=$(git rev-parse --short HEAD)
        docker tag robotech-app:latest "robotech-app:$SHORT" 2>/dev/null || true
    fi

    docker compose -f $COMPOSE_FILE up -d app

    sleep 5
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
    if [ "$HTTP" = "200" ]; then
        log "✅ Rollback OK to $TARGET"
    else
        err "Rollback health check FAILED (HTTP $HTTP) — manual intervention required"
    fi
}

# ─── RESTORE-DB : Restore a specific gzipped pg_dump ────────────────────────
restore_db() {
    local BACKUP_FILE="$2"
    local FORCE="${3:-}"
    [ -z "$BACKUP_FILE" ] && err "Usage: ./deploy.sh restore-db <backup.sql.gz> [--force]"
    [ ! -f "$BACKUP_FILE" ] && err "File not found: $BACKUP_FILE"

    if [ "$FORCE" != "--force" ]; then
        warn "This will OVERWRITE the current database with $BACKUP_FILE!"
        read -p "Continue? (y/N) " -n 1 -r; echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && { log "Cancelled."; return 0; }
    fi

    cd $APP_DIR
    log "Restoring DB from $BACKUP_FILE..."
    gunzip -c "$BACKUP_FILE" | docker compose -f $COMPOSE_FILE exec -T db \
        psql -U flexbox_user -d flexbox > /dev/null 2>&1
    log "✅ DB restore done."
}

# ─── LIST-BACKUPS : Show available pre-deploy backups ───────────────────────
list_backups() {
    cd $APP_DIR
    log "═══ AVAILABLE BACKUPS ═══"
    if [ -d "backups" ]; then
        ls -lh backups/pre_*.sql.gz 2>/dev/null | awk '{print $9, "("$5", "$6, $7, $8")"}'  || log "(none)"
    else
        log "(no backups directory)"
    fi
    echo ""
    log "═══ AVAILABLE IMAGES ═══"
    docker images robotech-app --format "table {{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" | head -20
}

# ─── Main ────────────────────────────────────────────────────────────────────
case "${1:-}" in
    setup)                setup ;;
    deploy)               deploy ;;
    update)               update ;;
    deploy-with-backup)   deploy_with_backup "$@" ;;
    rollback)             rollback_to "${2:-previous}" ;;
    restore-db)           restore_db "$@" ;;
    list-backups)         list_backups ;;
    status)               status ;;
    logs)                 logs "$@" ;;
    backup)               backup ;;
    restore)              restore "$@" ;;
    *)
        echo "Usage: ./deploy.sh <command> [args]"
        echo ""
        echo "  setup                       Premier déploiement (Docker, firewall, etc.)"
        echo "  deploy                      Build + lance tous les services"
        echo "  update                      Pull + rebuild app seulement"
        echo "  deploy-with-backup <ref>    Auto-deploy avec backup DB + image + rollback auto si échec"
        echo "  rollback [<sha>|previous]   Revenir à une version précédente"
        echo "  restore-db <file.sql.gz>    Restaurer un backup DB (--force pour skip prompt)"
        echo "  list-backups                Lister backups DB + images disponibles"
        echo "  status                      État de tous les services"
        echo "  logs [service]              Logs (défaut: app)"
        echo "  backup                      Snapshot DB manuel"
        echo "  restore <file.sql.gz>       Restore DB (legacy interactive)"
        ;;
esac
