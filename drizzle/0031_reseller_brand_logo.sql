-- White-label v2: reseller logo shown on the public magic-link page.
ALTER TABLE "resellers" ADD COLUMN IF NOT EXISTS "brand_logo_url" text;
