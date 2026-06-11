-- 0026 — active_code_orders
--
-- Per-line tracking for Niveausat-backed Active Code purchases. Mirrors
-- the g2bulk_orders pattern: linked to a local `orders` row that carries
-- the wallet debit + reseller context, with the LoadBrain orderId /
-- taskId on the side so the storefront can resync status after the
-- 60s polling window if needed.
--
-- Idempotent migration: safe to apply on prod.

DO $$ BEGIN
    CREATE TYPE active_code_order_status AS ENUM (
        'PENDING_LOADBRAIN',
        'DELIVERED',
        'FAILED',
        'REFUNDED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS active_code_orders (
    id                   SERIAL PRIMARY KEY,
    local_order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    reseller_id          INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
    plan_id              TEXT NOT NULL,
    plan_label           TEXT NOT NULL,
    price_paid_dzd       NUMERIC(12, 2) NOT NULL,
    lb_order_id          TEXT NOT NULL,
    lb_task_id           TEXT,
    code                 TEXT,
    status               active_code_order_status NOT NULL DEFAULT 'PENDING_LOADBRAIN',
    error                TEXT,
    created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aco_reseller_idx ON active_code_orders (reseller_id);
CREATE INDEX IF NOT EXISTS aco_local_order_idx ON active_code_orders (local_order_id);
CREATE INDEX IF NOT EXISTS aco_lb_order_idx ON active_code_orders (lb_order_id);
CREATE INDEX IF NOT EXISTS aco_status_idx ON active_code_orders (status);
