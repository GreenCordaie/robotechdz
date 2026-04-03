import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`SELECT id, ms_status, ms_account_email, ms_refresh_token FROM digital_codes WHERE id = 344 OR ms_account_email = 'arahamplin5568@outlook.com'`;
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
