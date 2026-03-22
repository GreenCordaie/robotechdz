const postgres = require('postgres');

async function update() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        await sql`UPDATE shop_settings SET n8n_webhook_url = 'http://localhost:5678/webhook/flexbox'`;
        console.log('Update successful');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.end();
    }
}

update();
