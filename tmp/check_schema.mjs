import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
    try {
        const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'categories';
    `;
        console.log(JSON.stringify(columns, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

main();
