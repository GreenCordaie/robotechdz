-- 0027 — manual_products + manual_orders
--
-- Chef-managed catalogue for items the reseller can buy but the
-- operator has to fulfil by hand (no external panel, no SDK). Mirrors
-- the active_code_orders shape: every purchase has a local `orders`
-- row that carries the wallet debit, plus a per-line manual_orders
-- row that the chef walks through a small kanban (PENDING_DELIVERY
-- → DELIVERED, with a free-text note for the credentials handed over).
--
-- Idempotent migration: safe to apply on prod.

DO $$ BEGIN
    CREATE TYPE manual_order_status AS ENUM (
        'PENDING_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS manual_products (
    id           SERIAL PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT,
    category     TEXT,
    price_dzd    NUMERIC(12, 2) NOT NULL CHECK (price_dzd >= 0),
    image_url    TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER NOT NULL DEFAULT 100,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mp_active_idx ON manual_products (is_active, sort_order);
CREATE INDEX IF NOT EXISTS mp_category_idx ON manual_products (category);

CREATE TABLE IF NOT EXISTS manual_orders (
    id                       SERIAL PRIMARY KEY,
    local_order_id           INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    reseller_id              INTEGER NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
    manual_product_id        INTEGER REFERENCES manual_products(id) ON DELETE SET NULL,
    product_title_snapshot   TEXT NOT NULL,
    price_paid_dzd           NUMERIC(12, 2) NOT NULL,
    customer_phone           TEXT,
    customer_note            TEXT,
    delivery_note            TEXT,
    status                   manual_order_status NOT NULL DEFAULT 'PENDING_DELIVERY',
    delivered_at             TIMESTAMP,
    delivered_by_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mo_reseller_idx ON manual_orders (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mo_status_idx ON manual_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS mo_local_order_idx ON manual_orders (local_order_id);
