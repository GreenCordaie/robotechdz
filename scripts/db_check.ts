import postgres from 'postgres';

async function check() {
    const sql = postgres('postgres://user:password@localhost:5435/flexbox');
    try {
        const settings = await sql`SELECT * FROM shop_settings LIMIT 1`;
        console.log('SHOP_SETTINGS:', JSON.stringify(settings, null, 2));
        process.exit(0);
    } catch (e) {
        console.error('Error checking settings:', e);
        process.exit(1);
    }
}

check();
