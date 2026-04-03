import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const logs = await sql`SELECT id, action, entity_id, new_data, created_at FROM audit_logs WHERE action = 'NETFLIX_RESOLVE_AUTO' ORDER BY created_at DESC LIMIT 5`;
        console.log(JSON.stringify(logs, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
