const postgres = require('postgres');

const sql = postgres("postgres://user:password@localhost:5435/flexbox");

async function inspectProducts() {
    try {
        console.log("--- Products & Variants Inspection ---");
        const results = await sql`
            SELECT p.name as product_name, pv.name as variant_name, pv.sale_price_dzd
            FROM products p
            JOIN product_variants pv ON p.id = pv.product_id
            LIMIT 20
        `;
        console.table(results);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.end();
    }
}

inspectProducts();
