const postgres = require('postgres');
async function run() {
    const sql = postgres("postgres://user:password@localhost:5435/flexbox");
    try {
        const res = await sql`SELECT * FROM shop_settings LIMIT 1`;
        console.log('Columns:', Object.keys(res[0]));
        if (res[0].ai_system_instructions) {
            console.log('AI Instructions found:', res[0].ai_system_instructions.substring(0, 100));
        }
    } finally {
        await sql.end();
    }
}
run();
