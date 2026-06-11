-- Migration 0024 — Supplier external balances (CapSolver, 2Captcha, AntiCaptcha,
-- Mudfish, LoadBrain modules with credit, etc.). Extends `suppliers` table so
-- the `/admin/fournisseurs` page becomes the single hub for monitoring AND
-- topping up all paid services the boutique relies on.
--
-- Design:
--   - `type`         distinguishes internal stock suppliers (current behavior)
--                    from external API-backed services.
--   - `provider_kind` identifies the fetcher to use (capsolver, twocaptcha, ...).
--   - `external_config` is jsonb storing per-provider config (endpoint, key id,
--     refresh interval). Secrets themselves stay in env vars and are looked up
--     by the fetcher — never stored here.
--   - `alert_threshold` triggers a WhatsApp/dashboard alert when balance drops.
--   - `last_balance_at` records when the cron last refreshed the balance.
--
-- All columns are nullable / defaulted so existing rows keep working unchanged.
-- Idempotent: safe to re-run.

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "type"             text         NOT NULL DEFAULT 'INTERNAL_STOCK',
  ADD COLUMN IF NOT EXISTS "provider_kind"    text,
  ADD COLUMN IF NOT EXISTS "external_config"  jsonb,
  ADD COLUMN IF NOT EXISTS "alert_threshold"  numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "last_balance_at"  timestamp;

-- Index for the cron refresh loop (find external suppliers due for refresh).
CREATE INDEX IF NOT EXISTS "suppliers_type_idx"           ON "suppliers" ("type");
CREATE INDEX IF NOT EXISTS "suppliers_last_balance_idx"   ON "suppliers" ("last_balance_at") WHERE "type" = 'EXTERNAL_API';
