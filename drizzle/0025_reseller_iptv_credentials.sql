-- Persist the LoadBrain credentials on the reseller IPTV mirror so the lines
-- table can show m3u/password without depending on a live per-row poll (some
-- providers — atlaspro, ironmax — are reached via lb_order_id, not lb_task_id,
-- and the live read skipped them). Values are AES-256-GCM encrypted at rest via
-- the Drizzle `encryptedText` type (column SQL type stays text); only reads
-- through Drizzle see plaintext. username already lives in provider_account_id.
ALTER TABLE "reseller_iptv_orders" ADD COLUMN IF NOT EXISTS "m3u_url" text;
ALTER TABLE "reseller_iptv_orders" ADD COLUMN IF NOT EXISTS "epg_url" text;
ALTER TABLE "reseller_iptv_orders" ADD COLUMN IF NOT EXISTS "credentials_password" text;
