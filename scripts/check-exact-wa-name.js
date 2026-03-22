const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function check() {
    try {
        const res = await sql`SELECT whatsapp_instance_name, LENGTH(whatsapp_instance_name) as len FROM shop_settings`;
        console.log(JSON.stringify(res, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

check();
