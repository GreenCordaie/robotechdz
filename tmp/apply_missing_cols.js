const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function main() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const dbUrlMatch = envContent.match(/DATABASE_URL="?([^"\n\s]+)"?/);
    const sql = postgres(dbUrlMatch[1]);

    try {
        console.log('Adding missing columns to shop_settings...');
        await sql`ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS microsoft_tenant_id text`;
        await sql`ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS microsoft_redirect_uri text`;
        console.log('✅ Columns added.');

        console.log('Verification:');
        const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'shop_settings'`;
        console.log(cols.map(c => c.column_name).join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}
main();
