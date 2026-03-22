const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function checkSettings() {
    try {
        const res = await sql`SELECT chatbot_enabled, gemini_api_key, whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name FROM shop_settings LIMIT 1`;
        console.log(JSON.stringify(res[0], null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

checkSettings();
