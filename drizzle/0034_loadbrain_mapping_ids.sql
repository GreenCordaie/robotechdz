-- 0034 — Mirror mapping: LoadBrain account/slot UUIDs on boutique tables.
--
-- Additive only. Lets the boutique correlate its mirror rows with the
-- LoadBrain system-of-record (netflix.accounts / netflix.slots) without
-- changing any existing read/write path. NULL until backfilled by import
-- or set by webhook/allocate (later phases).
--
-- Idempotent: safe to apply on prod.

ALTER TABLE digital_codes
    ADD COLUMN IF NOT EXISTS lb_account_id TEXT;
CREATE INDEX IF NOT EXISTS dc_lb_account_id_idx
    ON digital_codes (lb_account_id) WHERE lb_account_id IS NOT NULL;

ALTER TABLE digital_code_slots
    ADD COLUMN IF NOT EXISTS lb_slot_id TEXT;
CREATE INDEX IF NOT EXISTS dcs_lb_slot_id_idx
    ON digital_code_slots (lb_slot_id) WHERE lb_slot_id IS NOT NULL;
