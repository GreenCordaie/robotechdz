const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
}

const sql = postgres(connectionString);

async function main() {
    try {
        const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'digital_code_slots'
      ORDER BY ordinal_position;
    `;
        console.log("COLUMNS_START");
        console.log(JSON.stringify(columns, null, 2));
        console.log("COLUMNS_END");
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

main();
