const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function main() {
    try {
        const webhooks = await sql`SELECT * FROM webhook_events ORDER BY processed_at DESC LIMIT 5`;
        console.log("RECENT WEBHOOK EVENTS:");
        console.log(JSON.stringify(webhooks, null, 2));

        const audits = await sql`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5`;
        console.log("\nRECENT AUDIT LOGS:");
        console.log(JSON.stringify(audits, null, 2));
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        process.exit(0);
    }
}

main();
