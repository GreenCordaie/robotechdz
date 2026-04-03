const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function main() {
    try {
        await sql`UPDATE shop_settings SET microsoft_tenant_id = 'consumers'`;
        console.log('Tenant ID mis à jour vers consumers');
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

main();
