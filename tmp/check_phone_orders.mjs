import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`
            SELECT dcs.id as slot_id, dc.id as code_id, dc.ms_status, o.order_number
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN digital_code_slots dcs ON oi.id = dcs.order_item_id
            JOIN digital_codes dc ON dcs.digital_code_id = dc.id
            WHERE o.customer_phone LIKE '%781480740%'
        `;
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
