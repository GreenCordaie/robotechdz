const postgres = require('postgres');
const sql = postgres("postgres://user:password@localhost:5435/flexbox");

async function migrate() {
    try {
        console.log('Starting migration...');

        // 1. Add columns to product_variants
        await sql`
            ALTER TABLE IF EXISTS product_variants 
            ADD COLUMN IF NOT EXISTS is_sharing BOOLEAN DEFAULT false NOT NULL,
            ADD COLUMN IF NOT EXISTS total_slots INTEGER DEFAULT 1 NOT NULL;
        `;
        console.log('Added columns to product_variants');

        // 2. Create digital_code_slot_status enum
        // We catch error in case it already exists
        try {
            await sql`CREATE TYPE digital_code_slot_status AS ENUM ('DISPONIBLE', 'VENDU');`;
            console.log('Created digital_code_slot_status enum');
        } catch (e) {
            console.log('Enum digital_code_slot_status already exists or error:', e.message);
        }

        // 3. Create digital_code_slots table
        await sql`
            CREATE TABLE IF NOT EXISTS digital_code_slots (
                id SERIAL PRIMARY KEY,
                digital_code_id INTEGER REFERENCES digital_codes(id) ON DELETE CASCADE NOT NULL,
                slot_number INTEGER NOT NULL,
                status digital_code_slot_status DEFAULT 'DISPONIBLE' NOT NULL,
                order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;
        console.log('Created digital_code_slots table');

        // 4. Create indexes
        await sql`CREATE INDEX IF NOT EXISTS dcs_digital_code_id_idx ON digital_code_slots (digital_code_id);`;
        await sql`CREATE INDEX IF NOT EXISTS dcs_status_idx ON digital_code_slots (status);`;
        await sql`CREATE INDEX IF NOT EXISTS dcs_order_item_id_idx ON digital_code_slots (order_item_id);`;
        console.log('Created indexes');

        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await sql.end();
    }
}

migrate();
