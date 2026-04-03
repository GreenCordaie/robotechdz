import postgres from 'postgres';
const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const rows = await sql`
            SELECT o.customer_phone, cl.telephone, o.id as order_id
            FROM digital_codes dc
            JOIN order_items oi ON dc.order_item_id = oi.id
            JOIN orders o ON oi.order_id = o.id
            LEFT JOIN clients cl ON o.client_id = cl.id
            WHERE dc.id = 344
        `;
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
