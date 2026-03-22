const postgres = require('postgres');
async function run() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        const res = await sql`SELECT chatbot_role, chatbot_greeting FROM shop_settings LIMIT 1`;
        console.log('Role:', res[0].chatbot_role);
        console.log('Greeting:', res[0].chatbot_greeting);
    } finally {
        await sql.end();
    }
}
run();
