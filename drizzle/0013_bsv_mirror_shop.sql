-- Lot 3 — BSV Mirror Shop
-- Additive only: new enum + 2 new tables. No changes to existing tables.

CREATE TYPE "bsv_order_status" AS ENUM (
    'PENDING_LOADBRAIN',
    'COMPLETED',
    'FAILED',
    'REFUNDED'
);

CREATE TABLE IF NOT EXISTS "bsv_orders" (
    "id" serial PRIMARY KEY NOT NULL,
    "local_order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "reseller_id" integer NOT NULL REFERENCES "resellers"("id") ON DELETE CASCADE,
    "listing_id" text NOT NULL,
    "quantity" integer NOT NULL,
    "price_paid_dzd" numeric(12, 2) NOT NULL,
    "lb_order_id" text,
    "status" "bsv_order_status" DEFAULT 'PENDING_LOADBRAIN' NOT NULL,
    "won_snapshot" jsonb,
    "completed_at" timestamp,
    "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "bsv_orders_local_order_idx" ON "bsv_orders" ("local_order_id");
CREATE INDEX IF NOT EXISTS "bsv_orders_lb_order_idx" ON "bsv_orders" ("lb_order_id");
CREATE INDEX IF NOT EXISTS "bsv_orders_reseller_idx" ON "bsv_orders" ("reseller_id");

CREATE TABLE IF NOT EXISTS "bsv_delivered_codes" (
    "id" serial PRIMARY KEY NOT NULL,
    "bsv_order_id" integer NOT NULL REFERENCES "bsv_orders"("id") ON DELETE CASCADE,
    "code" text NOT NULL,
    "redemption_url" text,
    "pin" text,
    "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "bsv_delivered_codes_bsv_order_idx" ON "bsv_delivered_codes" ("bsv_order_id");
