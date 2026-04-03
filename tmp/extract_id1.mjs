import postgres from 'postgres';
import fs from 'fs';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`SELECT * FROM digital_codes WHERE id = 1`;
        fs.writeFileSync('tmp/account_1.json', JSON.stringify(rows, null, 2));
        console.log('Compte ID 1 écrit dans tmp/account_1.json');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
