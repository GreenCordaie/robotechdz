import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`SELECT id, code, ms_status FROM digital_codes WHERE ms_status = 'CONNECTED' AND id != 344`;
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
