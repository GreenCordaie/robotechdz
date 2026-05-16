-- EPIC 1 / Phase E — Reseller signup public + admin approval queue
-- Additive only, idempotent.

CREATE TABLE IF NOT EXISTS "reseller_signup_requests" (
    "id" serial PRIMARY KEY NOT NULL,
    "email" text NOT NULL,
    "company_name" text NOT NULL,
    "contact_phone" text NOT NULL,
    "nif" text,
    "rc_number" text,
    "message" text,
    "status" text NOT NULL DEFAULT 'PENDING',
    "rejected_reason" text,
    "processed_at" timestamp,
    "processed_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
    "created_reseller_id" integer REFERENCES "resellers"("id") ON DELETE SET NULL,
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "rsr_status_idx" ON "reseller_signup_requests" ("status");
CREATE INDEX IF NOT EXISTS "rsr_email_idx" ON "reseller_signup_requests" ("email");
CREATE INDEX IF NOT EXISTS "rsr_created_at_idx" ON "reseller_signup_requests" ("created_at");
