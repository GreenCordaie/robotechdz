const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function checkEvents() {
    try {
        const res = await sql`SELECT payload, processed_at FROM webhook_events WHERE provider = 'whatsapp' ORDER BY processed_at DESC LIMIT 5`;
        console.log(JSON.stringify(res, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

checkEvents();
