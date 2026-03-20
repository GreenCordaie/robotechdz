const postgres = require('postgres');
const sql = postgres("postgres://user:password@localhost:5435/flexbox");

async function main() {
    try {
        // Check if rate_limits table exists
        const tables = await sql`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `;
        console.log("=== ALL TABLES ===");
        tables.forEach(t => console.log(" -", t.table_name));

        // Check rate_limits specifically
        const rl = tables.find(t => t.table_name === 'rate_limits');
        if (rl) {
            console.log("\n✅ rate_limits table EXISTS");
            const cols = await sql`
                SELECT column_name, data_type FROM information_schema.columns 
                WHERE table_name = 'rate_limits' ORDER BY ordinal_position
            `;
            console.log("Columns:", cols.map(c => `${c.column_name} (${c.data_type})`).join(', '));
        } else {
            console.log("\n❌ rate_limits table DOES NOT EXIST!");
        }

        // Also check audit_logs
        const al = tables.find(t => t.table_name === 'audit_logs');
        if (al) {
            console.log("\n✅ audit_logs table EXISTS");
        } else {
            console.log("\n❌ audit_logs table DOES NOT EXIST!");
        }

    } catch (e) {
        console.log("ERROR:", e.message);
    } finally {
        await sql.end();
    }
}

main();
