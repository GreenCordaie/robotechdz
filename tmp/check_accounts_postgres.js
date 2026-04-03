const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function main() {
    try {
        const codes = await sql`
      SELECT id, code, outlook_password, ms_status, ms_account_email, ms_refresh_token
      FROM digital_codes
    `;

        console.log(`Found ${codes.length} codes.`);
        codes.forEach(c => {
            // Just print a part to avoid huge outputs if encrypted
            const cTrunc = c.code ? c.code.substring(0, 30) + '...' : 'null';
            const pTrunc = c.outlook_password ? '***' : 'null';
            const rtTrunc = c.ms_refresh_token ? '***' : 'null';
            console.log(`ID: ${c.id} | EmailMS: ${c.ms_account_email} | StatusMS: ${c.ms_status} | Code: ${cTrunc} | Pass: ${pTrunc} | RT: ${rtTrunc}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

main();
