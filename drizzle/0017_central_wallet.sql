-- Central B2B Wallet — singleton wallet for admin top-ups; resellers
-- get credited from this central pool. Additive and idempotent.

CREATE TABLE IF NOT EXISTS "central_wallet" (
    "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
    "balance" numeric(12, 2) DEFAULT '0' NOT NULL,
    "total_topped_up" numeric(12, 2) DEFAULT '0' NOT NULL,
    "total_disbursed" numeric(12, 2) DEFAULT '0' NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "central_wallet_singleton_chk" CHECK ("id" = 1)
);

-- Ensure the singleton row exists.
INSERT INTO "central_wallet" ("id", "balance", "total_topped_up", "total_disbursed")
VALUES (1, 0, 0, 0)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "central_wallet_transactions" (
    "id" serial PRIMARY KEY NOT NULL,
    "type" text NOT NULL,
    "amount_dzd" numeric(12, 2) NOT NULL,
    "balance_after" numeric(12, 2) NOT NULL,
    "reseller_id" integer REFERENCES "resellers"("id") ON DELETE SET NULL,
    "admin_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "reference" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "central_wallet_tx_type_chk" CHECK ("type" IN ('admin_topup','reseller_credit','adjustment'))
);

CREATE INDEX IF NOT EXISTS "cwt_type_idx" ON "central_wallet_transactions" ("type");
CREATE INDEX IF NOT EXISTS "cwt_reseller_idx" ON "central_wallet_transactions" ("reseller_id");
CREATE INDEX IF NOT EXISTS "cwt_created_at_idx" ON "central_wallet_transactions" ("created_at");
