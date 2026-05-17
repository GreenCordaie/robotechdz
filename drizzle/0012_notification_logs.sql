-- EPIC 1 / Phase L2 — Notification logs (audit + debug envois WhatsApp reseller).

CREATE TABLE IF NOT EXISTS "notification_logs" (
    "id" SERIAL PRIMARY KEY,
    "event_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "reseller_id" INTEGER REFERENCES "resellers"("id") ON DELETE SET NULL,
    "contact_phone" TEXT,
    "delivered" BOOLEAN NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "nl_created_at_idx" ON "notification_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "nl_event_key_idx" ON "notification_logs" ("event_key");
CREATE INDEX IF NOT EXISTS "nl_reseller_id_idx" ON "notification_logs" ("reseller_id");
