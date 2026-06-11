-- Streaming Auto-Code Deeplink — activation tokens, slot events, lifecycle.
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS "slot_activation_tokens" (
    "id" serial PRIMARY KEY NOT NULL,
    "token" varchar(16) NOT NULL UNIQUE,
    "slot_id" integer NOT NULL REFERENCES "digital_code_slots"("id") ON DELETE CASCADE,
    "valid_from" timestamp NOT NULL DEFAULT now(),
    "valid_until" timestamp NOT NULL,
    "last_seen_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sat_token_idx" ON "slot_activation_tokens" ("token");
CREATE INDEX IF NOT EXISTS "sat_slot_idx" ON "slot_activation_tokens" ("slot_id");
CREATE INDEX IF NOT EXISTS "sat_last_seen_idx" ON "slot_activation_tokens" ("last_seen_at");

CREATE TABLE IF NOT EXISTS "slot_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "slot_id" integer REFERENCES "digital_code_slots"("id") ON DELETE SET NULL,
    "digital_code_id" integer NOT NULL REFERENCES "digital_codes"("id") ON DELETE CASCADE,
    "event_type" varchar(20) NOT NULL CHECK ("event_type" IN ('OTP_CODE', 'HOUSEHOLD_LINK')),
    "value_encrypted" text NOT NULL,
    "source_email_id" text,
    "delivered_to_session" boolean DEFAULT false NOT NULL,
    "delivered_at" timestamp,
    "received_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "se_dedup_idx" ON "slot_events" ("digital_code_id", "source_email_id") WHERE "source_email_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "se_received_idx" ON "slot_events" ("received_at");
CREATE INDEX IF NOT EXISTS "se_slot_idx" ON "slot_events" ("slot_id");

CREATE TABLE IF NOT EXISTS "slot_lifecycle" (
    "slot_id" integer PRIMARY KEY REFERENCES "digital_code_slots"("id") ON DELETE CASCADE,
    "first_activated_at" timestamp,
    "last_household_at" timestamp,
    "next_household_expected_at" timestamp,
    "monitoring_intensity" varchar(10) DEFAULT 'NORMAL' NOT NULL CHECK ("monitoring_intensity" IN ('HIGH', 'NORMAL', 'LOW')),
    "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "digital_codes" ADD COLUMN IF NOT EXISTS "has_extra_member" boolean DEFAULT false NOT NULL;
