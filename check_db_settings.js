const { Pool } = require('pg');
require('dotenv').config();

async function check() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        const res = await pool.query('SELECT telegram_bot_token, telegram_chat_id FROM shop_settings LIMIT 1');
        console.log("Database Settings:");
        console.log(JSON.stringify(res.rows[0], null, 2));
    } catch (err) {
        console.error("DB Query Error:", err);
    } finally {
        await pool.end();
    }
}

check();
