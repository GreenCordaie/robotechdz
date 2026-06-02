#!/usr/bin/env sh
# LoadBrain integration reliability tick — see DEPLOY.md §9.
#
# Calls the CRON_SECRET-protected admin endpoints that keep the LoadBrain
# integration consistent:
#   - webhook DLQ retries (re-delivers failed outbound reseller webhooks)
#   - g2bulk + iptv reconcilers (catch orders stuck PENDING_LOADBRAIN when an
#     inbound webhook was missed)
#   - external supplier balance refresh (CapSolver / 2Captcha / AntiCaptcha,
#     low-balance alerts)
#
# All four endpoints are idempotent (FOR UPDATE + status guards / SKIP LOCKED),
# so running this alongside any other scheduler (e.g. n8n) is safe — no double
# refund, no duplicate delivery.
#
# Usage:  cron-tick.sh [retries|reconcile|balances|all]    (default: all)
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

case "$MODE" in
    retries) run_retries ;;
    reconcile) run_reconcile ;;
    balances) run_balances ;;
    all) run_retries; run_reconcile; run_balances ;;
    *) echo "[cron-tick] unknown mode '$MODE' (use retries|reconcile|balances|all)" >&2; exit 2 ;;
esac
