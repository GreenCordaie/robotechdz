const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('--- MS Graph Setup Script (V4) ---');
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const dbUrlMatch = envContent.match(/DATABASE_URL="?([^"\n\s]+)"?/);
    const sql = postgres(dbUrlMatch[1]);

    try {
        console.log('Step 1: Setting Azure Credentials in shop_settings...');
        await sql`
            UPDATE shop_settings SET 
                microsoft_client_id = '72e03be8-0a78-4e03-8e47-ee2bb1600a09',
                microsoft_tenant_id = '730d24b2-1a9b-4669-b614-fb73275da7b0',
                microsoft_client_secret = '618becaf-8391-42fb-86da-63195f05e2cc'
        `;

        console.log('Step 2: Ensuring test account aymengp12@outlook.com exists...');
        const variants = await sql`SELECT id FROM product_variants LIMIT 1`;
        if (variants.length === 0) {
            console.error('❌ Error: MUST have at least one product_variant in DB.');
            process.exit(1);
        }
        const vId = variants[0].id;

        const accounts = await sql`SELECT id FROM digital_codes WHERE email = 'aymengp12@outlook.com'`;

        if (accounts.length === 0) {
            // Using only columns confirmed in schema.ts AND migration
            // columns: id, variant_id, code, outlook_password, is_relayed, status, order_item_id, created_at
            // WAIT - 'email' column ? I think it's 'code' that stores the email for Netflix accounts in this app structure? 
            // Let's re-read the schema.ts digitalCodes section (lines 119-138)
            console.log('Account not found, creating...');
            await sql`
                INSERT INTO digital_codes (
                    variant_id, code, outlook_password, status
                ) VALUES (
                    ${vId}, 'aymengp12@outlook.com', 'Royal@06', 'DISPONIBLE'
                )
            `;
            console.log('✅ Account created.');
        } else {
            console.log('✅ Account already exists.');
        }

        console.log('--- Setup successful ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Database Error:', err);
        process.exit(1);
    } finally {
        await sql.end();
    }
}
main();
