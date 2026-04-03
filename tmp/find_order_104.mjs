import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`
            SELECT dcs.id as slot_id, dcs.digital_code_id, dcs.order_item_id, o.order_number, o.customer_phone
            FROM digital_code_slots dcs
            LEFT JOIN order_items oi ON dcs.order_item_id = oi.id
            LEFT JOIN orders o ON oi.order_id = o.id
            WHERE dcs.id = 104
        `;
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
