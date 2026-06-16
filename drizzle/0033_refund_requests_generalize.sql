-- Generalize the active-code refund-request workflow to also cover g2bulk + BSV
-- reseller orders. Adds a `kind` discriminator + generic `source_order_id`,
-- makes `active_code_order_id` nullable (only set for kind='active'), and moves
-- the at-most-one-PENDING money-safety guard onto (kind, source_order_id).
-- Idempotent: safe to re-run.

-- 1. New columns (idempotent).
ALTER TABLE "active_code_refund_requests"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'active';
ALTER TABLE "active_code_refund_requests"
  ADD COLUMN IF NOT EXISTS "source_order_id" integer;

-- 2. Backfill source_order_id for existing (active-code) rows.
UPDATE "active_code_refund_requests"
  SET "source_order_id" = "active_code_order_id"
  WHERE "source_order_id" IS NULL;

-- 3. active_code_order_id is now only set for kind='active' → drop NOT NULL.
ALTER TABLE "active_code_refund_requests"
  ALTER COLUMN "active_code_order_id" DROP NOT NULL;

-- 4. Replace the old per-order partial-unique + listing index with the
--    generalized (kind, source_order_id) variants.
DO $$ BEGIN
  DROP INDEX IF EXISTS "acrr_one_pending_per_order_idx";
EXCEPTION WHEN undefined_object THEN null; END $$;
DO $$ BEGIN
  DROP INDEX IF EXISTS "acrr_order_idx";
EXCEPTION WHEN undefined_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "acrr_source_idx"
  ON "active_code_refund_requests" ("kind", "source_order_id");
-- Money-safety: at most one PENDING request per (kind, source_order_id).
CREATE UNIQUE INDEX IF NOT EXISTS "acrr_one_pending_per_source_idx"
  ON "active_code_refund_requests" ("kind", "source_order_id") WHERE "status" = 'PENDING';
