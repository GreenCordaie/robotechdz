const postgres = require('postgres');
const connectionString = process.env.DATABASE_URL || "postgres://user:password@localhost:5435/flexbox";
const sql = postgres(connectionString);

async function reset() {
    console.log("Dropping ALL tables referencing suppliers to force UUID change...");
    try {
        await sql`DROP TABLE IF EXISTS "digital_codes" CASCADE`;
        await sql`DROP TABLE IF EXISTS "order_items" CASCADE`;
        await sql`DROP TABLE IF EXISTS "supplier_transactions" CASCADE`;
        await sql`DROP TABLE IF EXISTS "product_variant_suppliers" CASCADE`;
        await sql`DROP TABLE IF EXISTS "suppliers" CASCADE`;
        console.log("Success! Database cleared for clean sync.");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

reset();
