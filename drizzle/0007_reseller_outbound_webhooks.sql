-- EPIC 1 / Phase G — Outbound webhooks reseller (events HTTP signés HMAC-SHA256)
-- Additif, idempotent.

CREATE TABLE IF NOT EXISTS "reseller_webhooks" (
    "id" serial PRIMARY KEY NOT NULL,
    "reseller_id" integer NOT NULL REFERENCES "resellers"("id") ON DELETE CASCADE,
    "url" text NOT NULL,
    "events" text NOT NULL,
    "secret" text NOT NULL,
    "is_active" boolean NOT NULL DEFAULT true,
    "last_fired_at" timestamp,
    "last_status_code" integer,
    "last_error" text,
    "deliveries_ok" integer NOT NULL DEFAULT 0,
    "deliveries_failed" integer NOT NULL DEFAULT 0,
    "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "rw_reseller_id_idx" ON "reseller_webhooks" ("reseller_id");
CREATE INDEX IF NOT EXISTS "rw_is_active_idx" ON "reseller_webhooks" ("is_active");
