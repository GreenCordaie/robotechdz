-- EPIC 1 / Phase G3 — Webhook Dead Letter Queue.
-- Persiste les tentatives de livraison ratées pour retry exp backoff
-- (60s, 5min, 30min, 2h, 6h) et DLQ admin après 5 échecs.

CREATE TABLE IF NOT EXISTS "webhook_delivery_attempts" (
    "id" SERIAL PRIMARY KEY,
    "webhook_id" INTEGER NOT NULL REFERENCES "reseller_webhooks"("id") ON DELETE CASCADE,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RETRYING',
    "last_error" TEXT,
    "last_status_code" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "wda_webhook_id_idx" ON "webhook_delivery_attempts" ("webhook_id");
CREATE INDEX IF NOT EXISTS "wda_status_next_idx" ON "webhook_delivery_attempts" ("status", "next_attempt_at");
