const postgres = require('postgres');
async function run() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        const res = await sql`SELECT id, n8n_webhook_url FROM shop_settings`;
        console.log('Results:', res);
    } finally {
        await sql.end();
    }
}
run();
