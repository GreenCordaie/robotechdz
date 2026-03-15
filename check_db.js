const postgres = require('postgres');
const connectionString = "postgres://user:password@localhost:5435/flexbox";
const sql = postgres(connectionString);

async function check() {
    try {
        console.log("Checking tables...");
        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;
        console.log("Tables found:", tables.map(t => t.table_name));

        const suppliersCount = await sql`SELECT count(*) FROM suppliers`;
        console.log("Suppliers count:", suppliersCount[0].count);

        if (tables.some(t => t.table_name === 'supplier_transactions')) {
            const transCount = await sql`SELECT count(*) FROM supplier_transactions`;
            console.log("Transactions count:", transCount[0].count);
        } else {
            console.log("supplier_transactions table NOT found!");
        }
    } catch (e) {
        console.error("Connection failed:", e.message);
    } finally {
        await sql.end();
    }
}

check();
