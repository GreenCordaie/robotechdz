-- White-label: reseller branding shown to their own customers on the public
-- magic-link page (/activer/[token]). Idempotent — safe to re-run.
ALTER TABLE "resellers" ADD COLUMN IF NOT EXISTS "brand_name" text;
ALTER TABLE "resellers" ADD COLUMN IF NOT EXISTS "brand_color" text;
ALTER TABLE "resellers" ADD COLUMN IF NOT EXISTS "support_phone" text;
ALTER TABLE "resellers" ADD COLUMN IF NOT EXISTS "support_whatsapp" text;
