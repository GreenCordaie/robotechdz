import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`
            SELECT o.id as order_id, o.order_number, o.customer_phone, 
                   oi.id as order_item_id, oi.name as item_name,
                   dcs.id as slot_id, dcs.profile_name,
                   dc.id as code_id, dc.code as account_code, dc.ms_status, dc.ms_refresh_token, dc.outlook_password
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN digital_code_slots dcs ON oi.id = dcs.order_item_id
            JOIN digital_codes dc ON dcs.digital_code_id = dc.id
            WHERE o.id = 279 OR o.order_number = '279' OR o.order_number LIKE '%279%'
        `;
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
