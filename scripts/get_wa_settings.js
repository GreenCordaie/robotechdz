const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:password@localhost:5432/robotech' });

async function extract() {
    try {
        await client.connect();
        const res = await client.query('SELECT whatsapp_api_url, whatsapp_api_key, whatsapp_instance_name FROM shop_settings LIMIT 1');
        console.log(JSON.stringify(res.rows[0], null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
extract();
