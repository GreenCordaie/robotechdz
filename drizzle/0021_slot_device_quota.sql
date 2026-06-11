-- Slot device quota — Option C hybrid design.
--
-- Each `digital_code_slots` row gets a usage cap on the number of distinct
-- devices the customer can activate over the slot's lifetime. A "device"
-- here is a page session: every time the customer opens his activation URL
-- on a new device (or after >60 min of inactivity on the same device), the
-- counter bumps. When `devices_activated >= max_devices`, the activation
-- page returns 410 Gone and refuses to surface new codes — protecting
-- against link sharing.
--
-- All columns are nullable / defaulted so existing rows keep working
-- (effectively unlimited until the operator picks a cap).

ALTER TABLE "digital_code_slots"
  ADD COLUMN IF NOT EXISTS "max_devices" integer;

ALTER TABLE "digital_code_slots"
  ADD COLUMN IF NOT EXISTS "devices_activated" integer NOT NULL DEFAULT 0;

ALTER TABLE "digital_code_slots"
  ADD COLUMN IF NOT EXISTS "last_device_at" timestamp;

CREATE INDEX IF NOT EXISTS "dcs_devices_activated_idx"
  ON "digital_code_slots" ("devices_activated");
