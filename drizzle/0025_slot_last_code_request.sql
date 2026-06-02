-- 0025 — Add `last_code_request_at` to digital_code_slots.
--
-- The customer clicks "Voir mon code" on the magic-link page when they've
-- just pressed "envoyer le code" on Netflix. The watcher uses this
-- timestamp to disambiguate which of N concurrent slots on the same
-- master Outlook should receive the next OTP — without parsing a
-- profile name we don't actually have in the email.
--
-- Idempotent: safe to apply on prod.

ALTER TABLE digital_code_slots
    ADD COLUMN IF NOT EXISTS last_code_request_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS dcs_last_code_request_idx
    ON digital_code_slots (last_code_request_at)
    WHERE last_code_request_at IS NOT NULL;
