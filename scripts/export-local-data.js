const postgres = require("postgres");
require("dotenv").config();

async function exportData() {
    // Local DB URL (hardcoded for export safety)
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");

    try {
        console.log("Fetching local data...");

        const tables = ["users", "categories", "products", "product_variants", "clients", "suppliers", "shop_settings"];
        const data = {};

        for (const table of tables) {
            console.log(`- Fetching ${table}...`);
            data[table] = await sql`SELECT * FROM ${sql(table)}`;
        }

        const fs = require("fs");
        fs.writeFileSync("local_data_dump.json", JSON.stringify(data, null, 2));
        console.log("Export complete! Data saved to local_data_dump.json");

    } catch (error) {
        console.error("Export failed:", error);
    } finally {
        await sql.end();
    }
}

exportData();
