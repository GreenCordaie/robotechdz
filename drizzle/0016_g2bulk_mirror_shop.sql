-- G2Bulk Mirror Shop — orders + delivered codes
-- Mirrors drizzle/0014_bsv_mirror_shop.sql. Additive only.

CREATE TYPE "g2bulk_order_status" AS ENUM (
    'PENDING_LOADBRAIN',
    'COMPLETED',
    'FAILED',
    'REFUNDED'
);

CREATE TABLE IF NOT EXISTS "g2bulk_orders" (
    "id" serial PRIMARY KEY NOT NULL,
    "local_order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "reseller_id" integer NOT NULL REFERENCES "resellers"("id") ON DELETE CASCADE,
    "product_id" text NOT NULL,
    "quantity" integer NOT NULL,
    "price_paid_dzd" numeric(12, 2) NOT NULL,
    "lb_order_id" text,
    "status" "g2bulk_order_status" DEFAULT 'PENDING_LOADBRAIN' NOT NULL,
    "won_snapshot" jsonb,
    "completed_at" timestamp,
    "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "g2bulk_orders_local_order_idx" ON "g2bulk_orders" ("local_order_id");
CREATE INDEX IF NOT EXISTS "g2bulk_orders_lb_order_idx" ON "g2bulk_orders" ("lb_order_id");
CREATE INDEX IF NOT EXISTS "g2bulk_orders_reseller_idx" ON "g2bulk_orders" ("reseller_id");

CREATE TABLE IF NOT EXISTS "g2bulk_delivered_codes" (
    "id" serial PRIMARY KEY NOT NULL,
    "g2bulk_order_id" integer NOT NULL REFERENCES "g2bulk_orders"("id") ON DELETE CASCADE,
    "code" text NOT NULL,
    "redemption_url" text,
    "pin" text,
    "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "g2bulk_delivered_codes_g2bulk_order_idx" ON "g2bulk_delivered_codes" ("g2bulk_order_id");
