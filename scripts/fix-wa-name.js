const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function fix() {
    try {
        const res = await sql`UPDATE shop_settings SET whatsapp_instance_name = 'robotech'`;
        console.log('--- INSTANCE NAME FIXED ---', res);
    } catch (e) {
        console.error('DB ERROR:', e.message);
    } finally {
        process.exit(0);
    }
}
fix();
