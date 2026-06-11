-- Per-reseller low-balance alert threshold (DZD). NULL = no alert (opt-in).
-- When a debit takes the wallet below this value, a wallet.low_balance WhatsApp
-- notification fires once (edge-triggered). Idempotent: safe to re-run.
ALTER TABLE "resellers"
    ADD COLUMN IF NOT EXISTS "low_balance_threshold" numeric(12, 2);
