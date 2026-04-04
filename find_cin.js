const postgres = require('postgres');

const DATABASE_URL = "postgres://user:password@localhost:5435/flexbox";

async function findCin() {
    const sql = postgres(DATABASE_URL);

    try {
        console.log('Searching for column "cin" in all tables...');
        const res = await sql`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE column_name = 'cin';
        `;

        if (res.length > 0) {
            console.log('Found "cin" column in tables:');
            console.log(res.map(r => r.table_name).join(', '));
        } else {
            console.log('No column "cin" found in any table.');
        }

        console.log('Searching for column "ein" in all tables...');
        const res2 = await sql`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE column_name = 'ein';
        `;
        if (res2.length > 0) {
            console.log('Found "ein" column in tables:');
            console.log(res2.map(r => r.table_name).join(', '));
        }

    } catch (err) {
        console.error('Error searching DB:', err.message);
    } finally {
        await sql.end();
    }
}

findCin();
