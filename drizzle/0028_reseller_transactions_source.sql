-- 0028 — Source column + backfill on reseller_transactions
--
-- Adds a TEXT `source` column to tag every wallet transaction with its
-- upstream origin (BSV, G2BULK, IPTV, ACTIVE_CODE, MANUAL, ADMIN_RECHARGE,
-- UPSTREAM_REFUND, LEGACY). Backfills existing rows from `description` and
-- `type`. Idempotent — every step uses IF NOT EXISTS / WHERE source IS NULL.

ALTER TABLE reseller_transactions
    ADD COLUMN IF NOT EXISTS source TEXT;

-- Backfill from existing description / type. Order matters: more specific
-- first, fallback LEGACY last.
UPDATE reseller_transactions SET source = 'BSV'
    WHERE source IS NULL AND description ILIKE 'Achat BSV%';
UPDATE reseller_transactions SET source = 'G2BULK'
    WHERE source IS NULL AND (description ILIKE 'Achat G2Bulk%' OR description ILIKE 'Top-up %');
UPDATE reseller_transactions SET source = 'ACTIVE_CODE'
    WHERE source IS NULL AND description ILIKE 'Active Code%';
UPDATE reseller_transactions SET source = 'MANUAL'
    WHERE source IS NULL AND (description ILIKE 'Manual %' OR description ILIKE 'Manual—%' OR description ILIKE 'Manual refund%');
UPDATE reseller_transactions SET source = 'IPTV'
    WHERE source IS NULL AND description ILIKE '%IPTV%';
UPDATE reseller_transactions SET source = 'ADMIN_RECHARGE'
    WHERE source IS NULL AND type = 'RECHARGE';
UPDATE reseller_transactions SET source = 'UPSTREAM_REFUND'
    WHERE source IS NULL AND type = 'REFUND' AND (description ILIKE '%refund%' OR description ILIKE '%emboursement%');
UPDATE reseller_transactions SET source = 'LEGACY'
    WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS rt_source_idx ON reseller_transactions (source);
CREATE INDEX IF NOT EXISTS rt_wallet_created_idx ON reseller_transactions (wallet_id, created_at DESC);
