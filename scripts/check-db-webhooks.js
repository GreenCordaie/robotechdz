const postgres = require('postgres');
require('dotenv').config();

const sql = postgres({
    host: 'localhost',
    port: 5435, // Match docker-compose port for 'db'
    database: 'flexbox',
    username: 'user',
    password: 'password',
});

async function check() {
    const settings = await sql`SELECT n8n_webhook_url, chatbot_enabled, whatsapp_instance_name FROM shop_settings LIMIT 1`;
    console.log('--- DB SETTINGS ---');
    console.log(JSON.stringify(settings[0], null, 2));
    process.exit(0);
}

check().catch(e => {
    console.error(e);
    process.exit(1);
});
