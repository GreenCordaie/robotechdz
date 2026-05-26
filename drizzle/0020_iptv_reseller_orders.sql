-- IPTV reseller mirror: ownership + lifecycle of every sold line/code/device
-- across the four LoadBrain IPTV providers. LoadBrain does NOT know which
-- reseller bought what (all share the robotech tenant), so this table is the
-- single source of truth for "who owns line X" — every reseller-side query
-- joins on it before talking to LoadBrain.
--
-- Idempotent and additive. Safe to re-run.

DO $$ BEGIN
    CREATE TYPE "reseller_iptv_provider" AS ENUM ('panelking365','atlaspro','ironmax','ibosol');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "reseller_iptv_order_status" AS ENUM (
        'PENDING_LOADBRAIN',
        'ACTIVE',
        'FROZEN',
        'EXPIRED',
        'CANCELLED',
        'FAILED',
        'REFUNDED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "reseller_iptv_orders" (
    "id" serial PRIMARY KEY,
    "local_order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
    "reseller_id" integer NOT NULL REFERENCES "resellers"("id") ON DELETE CASCADE,
    "provider" "reseller_iptv_provider" NOT NULL,

    -- Upstream identifiers — at least one of these is set depending on provider.
    "lb_task_id" text UNIQUE,        -- gateway v2 provision task id
    "lb_order_id" text,              -- gateway v2 order id (panelking/atlaspro)
    "upstream_line_id" text,         -- ironmax line id, ibosol device id
    "provider_account_id" text,      -- xtream username / device mac / etc.

    -- Purchase snapshot (immutable after creation).
    "product_id" text NOT NULL,      -- LB product id (e.g. iptv:panelking:1m)
    "product_name" text NOT NULL,    -- human label at purchase time
    "product_snapshot" jsonb,        -- full LB product payload for audit
    "quantity" integer NOT NULL DEFAULT 1,
    "price_paid_dzd" numeric(12,2) NOT NULL,

    "status" "reseller_iptv_order_status" NOT NULL DEFAULT 'PENDING_LOADBRAIN',
    "last_status_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_synced_at" timestamp with time zone,
    "expires_at" timestamp with time zone,

    -- Reseller-set metadata (their notes, customer phone for delivery, etc.).
    "customer_label" text,
    "customer_phone" text,
    "notes" text,

    -- Diagnostics
    "last_error" text,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,

    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rio_reseller_idx"
    ON "reseller_iptv_orders" ("reseller_id");
CREATE INDEX IF NOT EXISTS "rio_reseller_status_idx"
    ON "reseller_iptv_orders" ("reseller_id", "status");
CREATE INDEX IF NOT EXISTS "rio_provider_idx"
    ON "reseller_iptv_orders" ("provider");
CREATE INDEX IF NOT EXISTS "rio_expires_idx"
    ON "reseller_iptv_orders" ("expires_at")
    WHERE "expires_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "rio_lb_order_idx"
    ON "reseller_iptv_orders" ("lb_order_id")
    WHERE "lb_order_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "rio_upstream_line_idx"
    ON "reseller_iptv_orders" ("provider", "upstream_line_id")
    WHERE "upstream_line_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "rio_pending_idx"
    ON "reseller_iptv_orders" ("reseller_id", "created_at")
    WHERE "status" = 'PENDING_LOADBRAIN';
