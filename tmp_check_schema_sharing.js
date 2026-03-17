require('dotenv').config();
const { postgres } = require('postgres');
const client = require('postgres')(process.env.DATABASE_URL);

async function checkSchema() {
    try {
        const columns = await client`
            SELECT table_name, column_name 
            FROM information_schema.columns 
            WHERE table_name IN ('product_variants', 'digital_code_slots')
        `;
        console.log('Columns found:', columns);

        const tables = await client`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'digital_code_slots'
        `;
        console.log('Tables found:', tables);

    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        await client.end();
    }
}

checkSchema();
