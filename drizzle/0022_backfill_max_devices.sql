-- =============================================================================
-- Migration 0022 — Backfill max_devices on already-sold digital_code_slots
-- =============================================================================
--
-- RATIONALE:
--   Migration 0021 added the device-quota columns (max_devices,
--   devices_activated, last_device_at) to digital_code_slots but left them
--   NULL for every existing row. New slots produced after 0021 receive
--   max_devices via the action default (set in the slot-assignment server
--   action), so only rows that already had a status != 'DISPONIBLE' at the
--   time of the rollout need a manual backfill.
--
--   We set max_devices = 3 on those sold/in-flight slots so the Netflix
--   auto-approve gateway in LoadBrain can enforce a per-slot ceiling
--   immediately, without retroactively touching unsold inventory.
--
-- IDEMPOTENCY:
--   The WHERE clause (`max_devices IS NULL`) guarantees that re-running this
--   script is a safe no-op — once a slot has a quota set, this UPDATE will
--   skip it. Safe to run multiple times against the same database.
--
-- ROLLBACK:
--   UPDATE digital_code_slots SET max_devices = NULL
--   WHERE max_devices = 3 AND devices_activated = 0;
--   (Or drop the columns entirely — see 0021 rollback in the runbook.)
-- =============================================================================

UPDATE digital_code_slots
SET max_devices = 3
WHERE max_devices IS NULL
  AND status != 'DISPONIBLE';
