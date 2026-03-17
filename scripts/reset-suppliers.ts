import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function reset() {
    console.log("Dropping supplier-related tables...");
    try {
        await db.execute(sql`DROP TABLE IF EXISTS "supplier_transactions" CASCADE`);
        await db.execute(sql`DROP TABLE IF EXISTS "suppliers" CASCADE`);
        await db.execute(sql`DROP TABLE IF EXISTS "product_variant_suppliers" CASCADE`);
        console.log("Tables dropped successfully.");
    } catch (e) {
        console.error("Drop failed:", e);
    }
}

reset();
