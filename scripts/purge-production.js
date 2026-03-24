/**
 * PRODUCTION PURGE SCRIPT
 * Removes all test/dummy data: products, suppliers, orders, clients, codes.
 * Preserves: users, shop_settings.
 * 
 * Run: node scripts/purge-production.js
 */
const postgres = require('postgres');
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5435/flexbox';
const sql = postgres(DATABASE_URL);

async function main() {
    console.log('⚠️  PREPARING PRODUCTION PURGE...');
    console.log('   This will delete ALL products, suppliers, orders, clients and codes.\n');

    const tables = [
        'digital_code_slots',
        'digital_codes',
        'order_items',
        'orders',
        'product_variant_suppliers',
        'product_variants',
        'products',
        'supplier_transactions',
        'suppliers',
        'categories',
        'clients',
        'client_payments',
        'reseller_transactions',
        'reseller_wallets',
        'resellers',
        'webhook_events',
        'audit_logs',
        'api_logs',
        'support_tickets',
        'whatsapp_faqs'
    ];

    try {
        for (const table of tables) {
            process.stdout.write(`   Cleaning ${table}... `);
            // TRUNCATE with RESTART IDENTITY reset sequences
            await sql.unsafe(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
            console.log('DONE');
        }

        console.log('\n✅ DATABASE PURGED SUCCESSFULLY.');
        console.log('   Preserved: users, shop_settings.');
        console.log('   You are now ready for production data entry.');

    } catch (e) {
        console.error('\n❌ PURGE FAILED:', e.message);
    } finally {
        await sql.end();
    }
}

main();
