# ENV Variables Audit — 100-pc-IA

**Date:** 2026-05-27
**Scope:** Every `process.env.*` read in `src/` + `scripts/`, cross-referenced with every `.env*` file present in the repo.

## Summary

| Metric | Count |
|---|---|
| Unique env vars referenced in code | **43** |
| Categories | **17** |
| Vars set in `.env` (current prod local) | 26 |
| Vars set in `.env.example` (old) | 41 |
| **Vars missing from `.env` but required by code** | **9** |
| **Vars in `.env.example` but never read by code** | **5** |
| Inconsistent naming detected | 4 pairs |

## Top 3 urgent operator actions

### 1. Add these to `.env` (currently missing — features broken or degraded)
```
MICROSOFT_CLIENT_SECRET=...    # primary Graph app — without it, Netflix mailbox worker fails to refresh tokens
PUBLIC_URL=https://boutique.nexusbox.tech    # shared accounts activation URLs default to localhost otherwise
NEXTAUTH_URL=https://boutique.nexusbox.tech  # used by /admin/monitoring backlink
N8N_CALLBACK_SECRET=$(openssl rand -hex 32)  # else /api/admin/n8n/callback is wide open
RECONCILER_SECRET=$CRON_SECRET               # alias; if absent the IPTV/G2Bulk reconciler endpoints require login
WAHA_API_URL=$WHATSAPP_API_URL               # n8n.service.ts reads this fallback name
ENABLE_DEBUG_ROUTES=false                    # explicit-off so /api/debug-codes stays closed
STREAMING_DEEPLINK_MODE=true                 # without it the watcher worker doesn't boot
LOADBRAIN_USE_V2=true                        # otherwise legacy lbClient path is used
```

### 2. Remove from `.env*` (referenced nowhere — dead config)
- `LOADBRAIN_BASE_URL` — the code uses `LOADBRAIN_URL`. The `_BASE_URL` variant is a naming drift from older docs. Remove from all `.env*`.
- `GROQ_API_KEY` — no source file consumes it.
- `MICROSOFT_REDIRECT_URI` — now computed from `NEXT_PUBLIC_APP_URL`.
- `WHATSAPP_SESSION` — Baileys direct session, not used (we route through WAHA HTTP).
- `WAHA_API_KEY` (in `.env.production.example`) — code uses `WHATSAPP_API_KEY` exclusively.

### 3. Rename / consolidate aliases (single source of truth)
| Both exist | Code reads | Action |
|---|---|---|
| `LOADBRAIN_URL` vs `LOADBRAIN_BASE_URL` | `LOADBRAIN_URL` | Drop `_BASE_URL` |
| `WHATSAPP_API_URL` vs `WAHA_API_URL` | both | Keep `WHATSAPP_API_URL`, set `WAHA_API_URL=$WHATSAPP_API_URL` until n8n.service.ts is patched to drop the legacy name |
| `NEXT_PUBLIC_APP_URL` vs `NEXT_PUBLIC_BASE_URL` vs `PUBLIC_URL` | all three | Pick `NEXT_PUBLIC_APP_URL`, alias others to it |
| `CRON_SECRET` vs `RECONCILER_SECRET` | both | Set the same value, document in code that they're equivalent |

---

## Full inventory by category

### Core (3)
| Var | Required | Used in |
|---|---|---|
| `NODE_ENV` | yes | db/index.ts, middleware.ts, lib/auth.ts, lib/redis.ts |
| `NEXT_RUNTIME` | implicit | lib/queue.ts, instrumentation.ts |
| `HOME` / `USERPROFILE` | OS | drizzle.config detection |

### Database + Redis (4)
| Var | Required |
|---|---|
| `DATABASE_URL` | yes — crash on boot |
| `REDIS_URL` | optional — defaults to localhost:6379 |
| `UPSTASH_REDIS_REST_URL` | optional — REST path |
| `UPSTASH_REDIS_REST_TOKEN` | optional — paired |

### App URLs (4)
| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | yes | used in webhook + deeplink URLs |
| `NEXT_PUBLIC_BASE_URL` | no | legacy alias |
| `PUBLIC_URL` | no | another legacy alias |
| `NEXTAUTH_URL` | no | currently unused but referenced |

### Crypto / auth (3)
| Var | Required |
|---|---|
| `SESSION_SECRET` | yes |
| `ENCRYPTION_KEY` | yes |
| (`SESSION_SECRET` is the fallback for `ENCRYPTION_KEY`) | — |

### Cron / reconciler (3)
| Var | Required |
|---|---|
| `CRON_SECRET` | yes — gates 5 admin routes |
| `RECONCILER_SECRET` | optional alias |
| `N8N_CALLBACK_SECRET` | optional |

### LoadBrain (5)
| Var | Required |
|---|---|
| `LOADBRAIN_URL` | yes |
| `LOADBRAIN_API_KEY` | yes |
| `LOADBRAIN_WEBHOOK_SECRET` | yes |
| `LOADBRAIN_SITE_URL` | optional |
| `LOADBRAIN_USE_V2` | optional |

### Microsoft Graph (4)
| Var | DB fallback |
|---|---|
| `MICROSOFT_CLIENT_ID` | shop_settings.microsoft_client_id |
| `MICROSOFT_CLIENT_SECRET` | shop_settings.microsoft_client_secret |
| `MICROSOFT_CLIENT_ID_2` | — |
| `MICROSOFT_CLIENT_SECRET_2` | — |

### WhatsApp (4)
| Var | DB fallback |
|---|---|
| `WHATSAPP_API_URL` | shop_settings.whatsapp_api_url |
| `WHATSAPP_API_KEY` | shop_settings.whatsapp_api_key |
| `WAHA_API_URL` | legacy alias |
| `WHATSAPP_WEBHOOK_SECRET` | env only |

### Telegram (1)
| Var | Notes |
|---|---|
| `TELEGRAM_SECRET_TOKEN` | webhook verification (env only) |

### n8n (1)
| Var | Notes |
|---|---|
| `N8N_WEBHOOK_URL` | DB fallback `shop_settings.n8n_webhook_url` |

### Cloudflare Turnstile (2)
| Var | Side |
|---|---|
| `TURNSTILE_SECRET_KEY` | backend |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | client |

### R2 storage (6)
| Var | Required if image upload used |
|---|---|
| `R2_ACCOUNT_ID` | yes |
| `R2_ACCESS_KEY_ID` | yes |
| `R2_SECRET_ACCESS_KEY` | yes |
| `R2_BUCKET_NAME` | yes |
| `R2_PUBLIC_URL` | yes |
| `R2_ENDPOINT` | yes |

### Print service (2)
| Var | Notes |
|---|---|
| `PRINT_SERVICE_URL` | defaults to 127.0.0.1:6543 |
| `PRINT_SECRET` | has a hardcoded default — CHANGE IT |

### Misc (5)
| Var | Notes |
|---|---|
| `STREAMING_DEEPLINK_MODE` | enables mailbox watcher |
| `ENABLE_DEBUG_ROUTES` | exposes debug endpoints in prod |

---

## What lives in DB instead of env (shop_settings table)

These are managed via `/admin/settings`, not env. If both env and DB are set, **DB wins**.

| DB column | Purpose |
|---|---|
| `telegram_bot_token`, `telegram_chat_id_*` | Bot for admin alerts |
| `whatsapp_instance_name`, `whatsapp_sender_number`, `whatsapp_message_template` | WAHA instance config |
| `whatsapp_webhook_url`, `whatsapp_verify_token` | WhatsApp inbound |
| `gemini_api_key` | Chatbot LLM |
| `chatbot_enabled`, `chatbot_greeting`, `chatbot_role` | Chatbot config |
| `microsoft_client_id`, `microsoft_client_secret`, `microsoft_tenant_id`, `microsoft_redirect_uri` | Microsoft Graph (env is fallback) |
| `netflix_resolver_email`, `netflix_resolver_password` | Netflix shared-account credentials |
| `shop_name`, `accent_color`, `logo_url`, etc. | Shop branding |
| `usd_exchange_rate` | DZD conversion |
| `is_b2b_enabled`, `is_maintenance_mode` | Feature flags |

---

## NOT in scope (lives in LoadBrain repo, not 100-pc-IA)

These are mentioned a lot in past sessions but they're consumed by LoadBrain backend, not the boutique:

- `CAPMONSTER_API_KEY`, `CAPSOLVER_API_KEY`, `IBOSOL_CAPSOLVER_API_KEY` — captcha solvers used by IPTV provisioning modules
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` — IronMax telegram bot for code→credentials
- `KINGUIN_API_BASE_URL`, `KINGUIN_API_KEY` — Kinguin upstream
- `INTERNAL_TOKEN`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` — LoadBrain gateway auth
- `ATLASPRO_FLARESOLVERR_URL`, `FLARESOLVERR_URL` — anti-bot bypass
- `BSV_DEEP_MODE`, `G2BULK_MAX_HOURLY_SPEND_USD` — module behavior toggles

The boutique only needs `LOADBRAIN_URL` + `LOADBRAIN_API_KEY` + `LOADBRAIN_WEBHOOK_SECRET` to talk to LoadBrain. Everything else above stays on the LoadBrain box.
