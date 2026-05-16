-- EPIC 1 — Marketplace B2B Foundation (additive only, non-breaking)
-- Toutes les colonnes ajoutées ont des defaults pour ne pas casser les
-- INSERT existants. Les FKs utilisent ON DELETE SET NULL pour rester safe.

-- 1. Nouvelle table reseller_tiers
CREATE TABLE IF NOT EXISTS "reseller_tiers" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "discount_pct" numeric(5, 2) NOT NULL DEFAULT '0',
    "min_monthly_volume_dzd" numeric(12, 2) NOT NULL DEFAULT '0',
    "color" text DEFAULT '#94a3b8',
    "is_default" boolean NOT NULL DEFAULT false,
    "rank" integer NOT NULL DEFAULT 0,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "reseller_tiers_name_unique" UNIQUE("name")
);

-- 2. Ajout tier_id sur resellers
ALTER TABLE "resellers"
    ADD COLUMN IF NOT EXISTS "tier_id" integer
    REFERENCES "reseller_tiers"("id") ON DELETE SET NULL;

-- 3. Ajout reseller_visible + reseller_price_override_dzd sur product_variants
ALTER TABLE "product_variants"
    ADD COLUMN IF NOT EXISTS "reseller_visible" boolean NOT NULL DEFAULT true;

ALTER TABLE "product_variants"
    ADD COLUMN IF NOT EXISTS "reseller_price_override_dzd" numeric(10, 2);

-- 4. Seed des 3 tiers par défaut (idempotent — ON CONFLICT DO NOTHING)
INSERT INTO "reseller_tiers" ("name", "discount_pct", "min_monthly_volume_dzd", "color", "is_default", "rank")
VALUES
    ('BRONZE', 0,    0,      '#cd7f32', true,  1),
    ('SILVER', 5,    50000,  '#c0c0c0', false, 2),
    ('GOLD',   10,   200000, '#ffd700', false, 3)
ON CONFLICT ("name") DO NOTHING;

-- 5. Assigner le tier BRONZE par défaut aux resellers existants sans tier
UPDATE "resellers"
SET "tier_id" = (SELECT "id" FROM "reseller_tiers" WHERE "is_default" = true LIMIT 1)
WHERE "tier_id" IS NULL;
