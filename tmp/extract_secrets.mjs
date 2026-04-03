import postgres from 'postgres';
import fs from 'fs';

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const [settings] = await sql`SELECT microsoft_client_id, microsoft_client_secret FROM shop_settings LIMIT 1`;
        fs.writeFileSync('tmp/microsoft_settings.json', JSON.stringify(settings, null, 2));
        console.log('Secrets écrits dans tmp/microsoft_settings.json');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
