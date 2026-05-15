-- EPIC 1 / Phase K — Préférences notif reseller (opt-in/opt-out WhatsApp par event type).

ALTER TABLE "resellers"
ADD COLUMN IF NOT EXISTS "notification_preferences" JSONB NOT NULL DEFAULT '{}'::jsonb;
