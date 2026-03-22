const postgres = require('postgres');

async function check() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        const res = await sql`SELECT chatbot_enabled, n8n_webhook_url FROM shop_settings LIMIT 1`;
        console.log('Settings:', res[0]);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

check();
