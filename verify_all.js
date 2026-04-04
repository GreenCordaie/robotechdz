const postgres = require('postgres');

const DATABASE_URL = "postgres://user:password@localhost:5435/flexbox";

async function verify() {
    const sql = postgres(DATABASE_URL);

    try {
        console.log('Querying current schema of shop_settings...');
        const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'shop_settings'
            ORDER BY ordinal_position;
        `;

        console.log('Columns in shop_settings:');
        columns.forEach(c => {
            console.log(`- ${c.column_name} (${c.data_type})`);
        });

        // Search for anything containing 'in'
        const inMatch = columns.filter(c => c.column_name.includes('in'));
        console.log('Columns matching "*in*":', inMatch.map(c => c.column_name).join(', '));

    } catch (err) {
        console.error('Error during verification:', err.message);
    } finally {
        await sql.end();
    }
}

verify();
