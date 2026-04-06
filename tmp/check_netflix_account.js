const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgres://user:password@localhost:5435/flexbox',
});

async function main() {
    const client = await pool.connect();
    try {
        // Vérifier les tables disponibles
        const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);
        console.log('Tables disponibles:', tables.rows.map(r => r.table_name).join(', '));

        // Chercher les comptes partagés
        const tables2 = tables.rows.map(r => r.table_name);
        let accountTable = null;
        for (const t of tables2) {
            if (t.includes('account') || t.includes('shared') || t.includes('digital')) {
                accountTable = t;
                console.log(`\n→ Table potentielle: ${t}`);
                const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${t}' ORDER BY ordinal_position`);
                console.log('  Colonnes:', cols.rows.map(r => r.column_name).join(', '));
            }
        }
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(console.error);
