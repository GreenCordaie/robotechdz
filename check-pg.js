const postgres = require('postgres');
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function main() {
    try {
        const res = await sql`SELECT * FROM shop_settings`;
        console.log(JSON.stringify(res, null, 2));
    } catch (err) {
        console.error("Error:", err.message);
    } finally {
        process.exit(0);
    }
}

main();
