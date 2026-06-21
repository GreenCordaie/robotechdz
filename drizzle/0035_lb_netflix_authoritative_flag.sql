-- 0035 — LB_NETFLIX_AUTHORITATIVE feature flag (sale allocation via LoadBrain).
-- Additive, default false → zero behavior change until explicitly enabled.
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS lb_netflix_authoritative BOOLEAN NOT NULL DEFAULT false;
