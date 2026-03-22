const postgres = require('postgres');
async function run() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        const res = await sql`SELECT * FROM shop_settings LIMIT 1`;
        console.log(res[0]);
    } finally {
        await sql.end();
    }
}
run();
