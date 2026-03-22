const postgres = require('postgres');
async function run() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        const res = await sql`SELECT chatbot_enabled, n8n_webhook_url FROM shop_settings`;
        console.log(JSON.stringify(res[0], null, 2));
    } finally {
        await sql.end();
    }
}
run();
