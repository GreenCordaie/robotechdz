const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

// Lire DATABASE_URL depuis .env
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const match = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
const DATABASE_URL = match ? match[1] : null;

if (!DATABASE_URL) { console.error('DATABASE_URL introuvable'); process.exit(1); }

const sql = postgres(DATABASE_URL);

(async () => {
    // Remettre en print_pending tous les jobs failed + ceux not_required récents (24h)
    const r = await sql`
        UPDATE orders
        SET print_status = 'print_pending'
        WHERE print_status IN ('failed')
           OR (print_status = 'not_required' AND created_at > NOW() - INTERVAL '1 hour')
        RETURNING id, order_number, print_status
    `;
    console.log(`${r.length} job(s) remis en print_pending:`, r.map(x => `#${x.order_number}`).join(', ') || 'aucun');
    await sql.end();
})();
