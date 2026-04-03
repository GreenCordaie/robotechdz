import postgres from 'postgres';
import fs from 'fs';

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`
            SELECT dc.id, dc.code, dc.outlook_password, dc.ms_refresh_token, dc.ms_status, o.order_number, o.customer_phone
            FROM digital_codes dc
            JOIN digital_code_slots dcs ON dc.id = dcs.digital_code_id
            JOIN order_items oi ON dcs.order_item_id = oi.id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.order_number LIKE '%279%' OR o.id = 279
        `;

        fs.writeFileSync('tmp/all_accounts_279_v2.json', JSON.stringify(rows, null, 2));
        console.log('Nb comptes trouvés:', rows.length);
        console.log('Données écrites dans tmp/all_accounts_279_v2.json');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
