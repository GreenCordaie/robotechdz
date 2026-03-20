const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const newUrl = process.argv[2];
if (!newUrl) {
    console.error("Usage: node sync_tunnel_db.js <new_url>");
    process.exit(1);
}

async function sync() {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const dbUrl = envContent.match(/DATABASE_URL=["']?(.*?)["']?(\r?\n|$)/)[1];

    const sql = postgres(dbUrl);
    try {
        const settings = await sql`SELECT id FROM shop_settings LIMIT 1`;
        if (settings.length > 0) {
            const id = settings[0].id;
            const waWebhook = `${newUrl}/api/webhooks/whatsapp`;

            await sql`UPDATE shop_settings SET 
                webhook_url = ${newUrl}, 
                whatsapp_webhook_url = ${waWebhook} 
                WHERE id = ${id}`;

            console.log(`✅ DB Settings synced: ${newUrl}`);
        }
    } catch (err) {
        console.error("DB Sync Error:", err.message);
    } finally {
        await sql.end();
    }
}

sync();
