const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

// Basic .env parser
const envPath = path.join(__dirname, '.env');
const envConfig = {};
try {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const m = line.trim().match(/^([^=]+)=(.*)$/);
        if (m) envConfig[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
} catch (e) { }

const DATABASE_URL = envConfig['DATABASE_URL'] || process.env.DATABASE_URL;

async function check() {
    if (!DATABASE_URL) {
        console.error("DATABASE_URL not found");
        return;
    }
    const sql = postgres(DATABASE_URL);
    try {
        const rows = await sql`SELECT webhook_url, n8n_webhook_url, whatsapp_webhook_url FROM shop_settings LIMIT 1`;
        console.log("Database Webhook Settings:");
        console.log(JSON.stringify(rows[0], null, 2));
    } catch (err) {
        console.error("DB Query Error:", err.message);
    } finally {
        await sql.end();
    }
}

check();
