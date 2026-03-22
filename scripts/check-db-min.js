const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function check() {
    try {
        const settings = await sql`SELECT n8n_webhook_url, chatbot_enabled, whatsapp_instance_name FROM shop_settings LIMIT 1`;
        console.log('--- DB SETTINGS ---');
        console.log(JSON.stringify(settings[0], null, 2));
    } catch (e) {
        console.error('DB ERROR:', e.message);
    } finally {
        process.exit(0);
    }
}
check();
