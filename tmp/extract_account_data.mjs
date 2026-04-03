import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`
            SELECT dc.id, dc.code, dc.outlook_password, dc.ms_refresh_token, dc.ms_status
            FROM digital_codes dc
            JOIN digital_code_slots dcs ON dc.id = dcs.digital_code_id
            JOIN order_items oi ON dcs.order_item_id = oi.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.order_number LIKE '%279%' OR o.id = 279
        `;

        console.log('Nb comptes trouvés:', rows.length);
        if (rows.length > 0) {
            // Write to a file to avoid terminal mangling
            import('fs').then(fs => {
                fs.writeFileSync('tmp/raw_account_data.json', JSON.stringify(rows[0], null, 2));
                console.log('Données brutes écrites dans tmp/raw_account_data.json');
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        // Wait a bit for file writing
        setTimeout(() => process.exit(), 1000);
    }
}
run();
