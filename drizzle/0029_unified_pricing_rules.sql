-- Migration 0029 — Unified resale pricing rules.
--
-- Collapses the two identical per-source rule tables (bsv_pricing_rules,
-- g2bulk_pricing_rules) into one `pricing_rules` table discriminated by a
-- `source` column, and adds a third markup_type 'fixed_price' (absolute resale
-- price in DZD) alongside 'pct' (basis points) and 'fixed_dzd' (margin added).
--
-- The old tables are LEFT IN PLACE (rollback safety); they are backfilled into
-- the new table here. A later migration can drop them once the new admin UI
-- and reseller call-sites are fully cut over.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "pricing_rules" (
  "id"            serial PRIMARY KEY,
  "source"        text NOT NULL,                          -- 'bsv' | 'g2bulk' | 'iptv' | '*'
  "scope_type"    text NOT NULL,                          -- 'global' | 'category' | 'brand' | 'sku'
  "scope_value"   text NOT NULL,                          -- '*' for global
  "markup_type"   text NOT NULL,                          -- 'pct' | 'fixed_dzd' | 'fixed_price'
  "markup_value"  numeric(12, 2) NOT NULL,
  "notes"         text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "updated_at"    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pricing_rules_source_scope_lookup"
  ON "pricing_rules" ("source", "scope_type", "scope_value");

-- Backfill from bsv_pricing_rules (source='bsv'). Guard against double-run by
-- only inserting when the new table has no 'bsv' rows yet.
INSERT INTO "pricing_rules" ("source", "scope_type", "scope_value", "markup_type", "markup_value", "notes", "is_active", "created_at", "updated_at")
SELECT 'bsv', "scope_type", "scope_value", "markup_type", "markup_value", "notes", "is_active", "created_at", "updated_at"
FROM "bsv_pricing_rules"
WHERE NOT EXISTS (SELECT 1 FROM "pricing_rules" WHERE "source" = 'bsv');

-- Backfill from g2bulk_pricing_rules (source='g2bulk').
INSERT INTO "pricing_rules" ("source", "scope_type", "scope_value", "markup_type", "markup_value", "notes", "is_active", "created_at", "updated_at")
SELECT 'g2bulk', "scope_type", "scope_value", "markup_type", "markup_value", "notes", "is_active", "created_at", "updated_at"
FROM "g2bulk_pricing_rules"
WHERE NOT EXISTS (SELECT 1 FROM "pricing_rules" WHERE "source" = 'g2bulk');

-- Ensure an all-sources global fallback exists so the engine never throws
-- "no rule" for a brand-new source (e.g. iptv) before it is configured.
INSERT INTO "pricing_rules" ("source", "scope_type", "scope_value", "markup_type", "markup_value", "notes", "is_active")
SELECT '*', 'global', '*', 'pct', 2000, 'Default 20% resale markup (all sources)', true
WHERE NOT EXISTS (
  SELECT 1 FROM "pricing_rules" WHERE "source" = '*' AND "scope_type" = 'global' AND "scope_value" = '*'
);
