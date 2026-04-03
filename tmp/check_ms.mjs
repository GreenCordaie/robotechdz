import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    const res = await sql`SELECT id, microsoft_client_id, microsoft_tenant_id FROM shop_settings LIMIT 1`;
    console.log(res);
    process.exit(0);
}
run();
