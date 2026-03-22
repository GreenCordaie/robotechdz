const postgres = require('postgres');
async function run() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        const res = await sql`SELECT whatsapp_instance_name, telegram_chat_id_caisse, telegram_chat_id_traiteur, chatbot_enabled FROM shop_settings LIMIT 1`;
        console.log(JSON.stringify(res[0], null, 2));
    } finally {
        await sql.end();
    }
}
run();
