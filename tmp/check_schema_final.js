const postgres = require('postgres');
const sql = postgres("postgres://user:password@localhost:5435/flexbox");

async function check() {
    try {
        console.log('Checking database schema...');

        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('digital_code_slots', 'product_variants', 'digital_codes');
        `;
        console.log('Tables found:', tables.map(t => t.table_name));

        const columns = await sql`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_name = 'product_variants' 
            AND column_name IN ('is_sharing', 'total_slots');
        `;
        console.log('Columns found in product_variants:', columns.map(c => c.column_name));

    } catch (error) {
        console.error('Check failed:', error);
    } finally {
        await sql.end();
    }
}

check();
