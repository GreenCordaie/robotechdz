import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const [settings] = await sql`SELECT microsoft_client_id, microsoft_client_secret FROM shop_settings LIMIT 1`;
        console.log(JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
