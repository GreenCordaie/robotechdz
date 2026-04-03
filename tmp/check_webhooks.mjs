import postgres from 'postgres';
import fs from 'fs';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const events = await sql`
      SELECT id, provider, external_id, payload 
      FROM webhook_events 
      WHERE provider = 'whatsapp' AND payload IS NOT NULL AND payload->>'event' = 'message'
      ORDER BY id DESC
      LIMIT 10
    `;
        fs.writeFileSync('tmp/logs.json', JSON.stringify(events, null, 2));
        console.log("Logs écrits dans tmp/logs.json");
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
