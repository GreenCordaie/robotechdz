-- Active-code refund-request workflow: reseller requests a refund on a delivered
-- active-code order, an admin approves/rejects. On approval the reseller wallet is
-- credited and (flag-gated) the code is returned to LoadBrain inventory stock.
-- Idempotent: safe to re-run.

DO $$ BEGIN
  CREATE TYPE "active_code_refund_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "active_code_refund_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "active_code_order_id" integer NOT NULL,
  "local_order_id" integer NOT NULL,
  "reseller_id" integer NOT NULL,
  "provider" text DEFAULT 'niveausat' NOT NULL,
  "plan_id" text NOT NULL,
  "plan_label" text,
  "lb_order_id" text NOT NULL,
  "code" text,
  "price_dzd" numeric(12, 2) NOT NULL,
  "reason" text,
  "status" "active_code_refund_status" DEFAULT 'PENDING' NOT NULL,
  "reusable" boolean,
  "decision_reason" text,
  "decided_by" integer,
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "active_code_refund_requests"
    ADD CONSTRAINT "acrr_active_code_order_id_fk"
    FOREIGN KEY ("active_code_order_id") REFERENCES "active_code_orders"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "active_code_refund_requests"
    ADD CONSTRAINT "acrr_local_order_id_fk"
    FOREIGN KEY ("local_order_id") REFERENCES "orders"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "active_code_refund_requests"
    ADD CONSTRAINT "acrr_reseller_id_fk"
    FOREIGN KEY ("reseller_id") REFERENCES "resellers"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "acrr_pending_idx"
  ON "active_code_refund_requests" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "acrr_order_idx"
  ON "active_code_refund_requests" ("active_code_order_id");
-- Money-safety: at most one PENDING request per order (blocks the double-approval race).
CREATE UNIQUE INDEX IF NOT EXISTS "acrr_one_pending_per_order_idx"
  ON "active_code_refund_requests" ("active_code_order_id") WHERE "status" = 'PENDING';
