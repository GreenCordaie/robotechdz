import postgres from 'postgres';
import fs from 'fs';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const events = await sql`
      SELECT id, provider, external_id, payload 
      FROM webhook_events 
      WHERE provider = 'whatsapp' AND payload IS NOT NULL AND payload->'payload'->>'fromMe' = 'true'
      ORDER BY id DESC
      LIMIT 5
    `;
        fs.writeFileSync('tmp/answers.json', JSON.stringify(events, null, 2));
        console.log("Answers écrits dans tmp/answers.json");
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
