const postgres = require('postgres');
async function run() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        await sql`UPDATE shop_settings SET chatbot_role = 'TEST PROMPT: You are a helpful bot.', chatbot_greeting = 'Hello from testing!'`;
        console.log('DB Updated with test prompts');
    } finally {
        await sql.end();
    }
}
run();
