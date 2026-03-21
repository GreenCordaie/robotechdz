const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');
async function run() {
    const result = await sql`SELECT telegram_bot_token, telegram_chat_id, telegram_chat_id_admin, telegram_chat_id_caisse, telegram_chat_id_traiteur FROM shop_settings LIMIT 1`;
    console.log(JSON.stringify(result[0], null, 2));
    process.exit(0);
}
run().catch(err => {
    console.error(err);
    process.exit(1);
});
