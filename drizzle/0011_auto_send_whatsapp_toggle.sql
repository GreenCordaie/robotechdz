-- EPIC 2 / Phase A — Toggle admin pour l'envoi auto WhatsApp kiosk post-paiement.

ALTER TABLE "shop_settings"
ADD COLUMN IF NOT EXISTS "auto_send_whatsapp" BOOLEAN NOT NULL DEFAULT TRUE;
