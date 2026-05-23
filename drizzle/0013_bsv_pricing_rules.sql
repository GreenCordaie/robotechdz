-- Lot 2 — BSV Mirror Shop: pricing rules for listings sourced from LoadBrain/BSV.
-- Scope precedence (resolved in service layer): sku > brand > category > global.
-- markup_type 'pct'       => markup_value stored as BASIS POINTS (1500 = 15%).
-- markup_type 'fixed_dzd' => markup_value stored as absolute DZD added on top of cost.

CREATE TABLE IF NOT EXISTS "bsv_pricing_rules" (
    "id" SERIAL PRIMARY KEY,
    "scope_type" TEXT NOT NULL,
    "scope_value" TEXT NOT NULL,
    "markup_type" TEXT NOT NULL,
    "markup_value" NUMERIC(12, 2) NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Lookup index for the most common access pattern (pickRule).
CREATE INDEX IF NOT EXISTS "bsv_pricing_rules_scope_lookup"
    ON "bsv_pricing_rules" ("scope_type", "scope_value");

-- Only one active rule allowed per (scope_type, scope_value) pair.
-- Soft-deleted/inactive rules may coexist (historical audit).
CREATE UNIQUE INDEX IF NOT EXISTS "bsv_pricing_rules_scope_unique"
    ON "bsv_pricing_rules" ("scope_type", "scope_value")
    WHERE "is_active" = true;

-- Seed default global fallback rule (15% markup).
INSERT INTO "bsv_pricing_rules" ("scope_type", "scope_value", "markup_type", "markup_value", "notes")
SELECT 'global', '*', 'pct', 1500, 'Default global markup 15% (seeded)'
WHERE NOT EXISTS (
    SELECT 1 FROM "bsv_pricing_rules"
    WHERE "scope_type" = 'global' AND "scope_value" = '*' AND "is_active" = true
);
