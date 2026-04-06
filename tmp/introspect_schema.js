const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function main() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const dbUrlMatch = envContent.match(/DATABASE_URL="?([^"\n\s]+)"?/);
    const sql = postgres(dbUrlMatch[1]);

    try {
        console.log('--- Digital Codes Columns ---');
        const dcCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'digital_codes'`;
        console.log(dcCols.map(c => c.column_name).join(', '));

        console.log('\n--- Shop Settings Columns ---');
        const ssCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'shop_settings'`;
        console.log(ssCols.map(c => c.column_name).join(', '));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}
main();
