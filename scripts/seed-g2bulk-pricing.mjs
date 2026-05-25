import pkg from "@next/env";
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());
const pg = (await import("postgres")).default;
const sql = pg(process.env.DATABASE_URL);

// Inspect
const before = await sql`SELECT scope_type, count(*)::int AS n FROM g2bulk_pricing_rules GROUP BY scope_type`;
console.log("Rules before:", before);

// Seed default global rule if none exists (markup 15% = 1500 bps)
await sql`
  INSERT INTO g2bulk_pricing_rules (scope_type, scope_value, markup_type, markup_value, notes, is_active)
  SELECT 'global', '*', 'pct', 1500, 'default seed — 15% markup', true
  WHERE NOT EXISTS (
    SELECT 1 FROM g2bulk_pricing_rules WHERE scope_type = 'global' AND is_active = true
  )
`;

const after = await sql`SELECT id, scope_type, scope_value, markup_type, markup_value, is_active FROM g2bulk_pricing_rules`;
console.log("Rules after:", after);

await sql.end();
