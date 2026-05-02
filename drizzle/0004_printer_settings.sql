ALTER TABLE "shop_settings"
  ADD COLUMN IF NOT EXISTS "printer_paper_width" integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "printer_auto_cut" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "printer_auto_print_paid" boolean NOT NULL DEFAULT false;
