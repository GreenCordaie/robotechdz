const postgres = require('postgres');
async function fix() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        await sql`UPDATE shop_settings SET n8n_webhook_url = 'http://localhost:5678/webhook/flexbox'`;
        const res = await sql`SELECT n8n_webhook_url FROM shop_settings LIMIT 1`;
        console.log('Fixed URL:', res[0].n8n_webhook_url);
    } finally {
        await sql.end();
    }
}
fix();
