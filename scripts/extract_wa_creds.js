const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function extract() {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const dbUrlMatch = envContent.match(/DATABASE_URL=["']?(.*?)["']?(\r?\n|$)/);
    if (!dbUrlMatch) {
        console.error("DATABASE_URL not found in .env");
        return;
    }
    const dbUrl = dbUrlMatch[1];

    const sql = postgres(dbUrl);
    try {
        const settings = await sql`SELECT whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name FROM shop_settings LIMIT 1`;
        console.log("CREDENTIALS_START");
        console.log(JSON.stringify(settings[0], null, 2));
        console.log("CREDENTIALS_END");
    } catch (err) {
        console.error("Extraction Error:", err.message);
    } finally {
        await sql.end();
    }
}
extract();
