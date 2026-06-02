#!/usr/bin/env sh
# LoadBrain integration reliability tick — see DEPLOY.md §7b.
#
# Calls the CRON_SECRET-protected admin endpoints that keep the LoadBrain
# integration consistent. Two cadences:
#
#   Short cadence (called from `all` — runs as often as you crontab it):
#     - webhook DLQ retries (re-delivers failed outbound reseller webhooks)
#     - g2bulk + iptv reconcilers (catch orders stuck PENDING_LOADBRAIN when
#       an inbound webhook was missed)
#     - external supplier balance refresh (CapSolver / 2Captcha / AntiCaptcha,
#       low-balance alerts)
#
#   Daily cadence (called from `daily`):
#     - iptv-expiry        Telegram alerts on lines about to expire
#     - scan-expiry        digital codes / slot expiry scan + n8n notif
#     - webhook-cleanup    prune old webhook_delivery_attempts + notification_logs
#
# All endpoints are idempotent (FOR UPDATE + status guards / SKIP LOCKED), so
# running this alongside another scheduler (e.g. n8n) is safe — no double
# refund, no duplicate delivery.
#
# Usage:  cron-tick.sh [retries|reconcile|balances|all|iptv-expiry|scan-expiry|webhook-cleanup|daily]
#         (default: all)
# Env:    CRON_APP_URL   public origin of the app (default: $NEXT_PUBLIC_APP_URL
#                        or http://localhost:3050)
#         CRON_SECRET    [required] shared secret for the cron/reconciler routes

set -eu

MODE="${1:-all}"
BASE="${CRON_APP_URL:-${NEXT_PUBLIC_APP_URL:-http://localhost:3050}}"
BASE="${BASE%/}"

if [ -z "${CRON_SECRET:-}" ]; then
    echo "[cron-tick] CRON_SECRET not set — aborting" >&2
    exit 1
fi

# $1 label · $2 method · $3 path · $4 auth header
hit() {
    code=$(curl -sS -o /dev/null -w '%{http_code}' \
        -X "$2" "$BASE$3" -H "$4" --max-time 60 2>/dev/null || true)
    if [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 300 ] 2>/dev/null; then
        echo "[cron-tick] $1 OK ($code)"
    else
        echo "[cron-tick] $1 FAILED ($code)" >&2
    fi
}

run_retries() {
    hit "webhook-retries" GET "/api/admin/cron/webhook-retries" "Authorization: Bearer $CRON_SECRET"
}

run_reconcile() {
    hit "g2bulk-reconcile" POST "/api/admin/g2bulk/reconcile" "x-cron-secret: $CRON_SECRET"
    hit "iptv-reconcile" POST "/api/admin/iptv/reconcile" "x-cron-secret: $CRON_SECRET"
}

run_balances() {
    hit "refresh-balances" GET "/api/admin/cron/refresh-balances" "Authorization: Bearer $CRON_SECRET"
}

run_iptv_expiry() {
    hit "iptv-expiry" GET "/api/admin/cron/iptv-expiry" "Authorization: Bearer $CRON_SECRET"
}

run_scan_expiry() {
    hit "scan-expiry" GET "/api/admin/cron/scan-expiry" "Authorization: Bearer $CRON_SECRET"
}

run_webhook_cleanup() {
    hit "webhook-cleanup" GET "/api/admin/cron/webhook-cleanup" "Authorization: Bearer $CRON_SECRET"
}

case "$MODE" in
    retries) run_retries ;;
    reconcile) run_reconcile ;;
    balances) run_balances ;;
    iptv-expiry) run_iptv_expiry ;;
    scan-expiry) run_scan_expiry ;;
    webhook-cleanup) run_webhook_cleanup ;;
    all) run_retries; run_reconcile; run_balances ;;
    daily) run_iptv_expiry; run_scan_expiry; run_webhook_cleanup ;;
    *) echo "[cron-tick] unknown mode '$MODE' (use retries|reconcile|balances|iptv-expiry|scan-expiry|webhook-cleanup|all|daily)" >&2; exit 2 ;;
esac
