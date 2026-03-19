
const { Client } = require('pg');

async function migrate() {
    const client = new Client({
        connectionString: "postgres://user:password@localhost:5435/flexbox"
    });

    try {
        await client.connect();
        console.log("Connected to DB");

        // Add whatsapp_sent_at to orders
        await client.query(`
            ALTER TABLE IF EXISTS orders 
            ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMP;
        `);
        console.log("Column whatsapp_sent_at ensured in orders table.");

    } catch (err) {
        console.error("Migration error:", err.message);
    } finally {
        await client.end();
    }
}

migrate();
