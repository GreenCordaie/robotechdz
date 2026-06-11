-- Denormalize the streaming activation URL onto the slot row so the
-- (sync) WhatsApp delivery formatter can include it without a DB join.
-- The canonical source is still `slot_activation_tokens.token` — this
-- column is a convenience cache populated at token creation.

ALTER TABLE digital_code_slots
  ADD COLUMN IF NOT EXISTS activation_url text;

CREATE INDEX IF NOT EXISTS dcs_activation_url_idx
  ON digital_code_slots (activation_url)
  WHERE activation_url IS NOT NULL;
