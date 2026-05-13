## EPIC 1 — Phase 1.A : DB schema + migration manuelle

Migration SQL idempotente pour ajouter `reseller_tiers`, `tier_id` sur resellers, et `reseller_visible/reseller_price_override_dzd` sur product_variants. Application via psql (pas drizzle-kit, à cause du drift journal pré-existant).