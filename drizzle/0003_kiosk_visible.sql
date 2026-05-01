ALTER TABLE "product_variants" ADD COLUMN "kiosk_visible" boolean DEFAULT true NOT NULL;
UPDATE "product_variants" SET "kiosk_visible" = false WHERE "loadbrain_slug" IN ('ibo-check', 'ibo-inject');
