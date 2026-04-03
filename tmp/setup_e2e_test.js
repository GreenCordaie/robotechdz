const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function encrypt(text, encryptionKey) {
    if (!text) return text;
    const key = crypto.createHash('sha256').update(encryptionKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}.${authTag}.${encrypted}`;
}

async function main() {
    console.log('--- MS Graph E2E Setup (Tenant SPECIFIC + MASTER account) ---');
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const getVar = (name) => {
        const re = new RegExp(`^${name}="?([^"\\n\\s]+)"?`, 'm');
        const m = envContent.match(re);
        return m ? m[1] : null;
    };

    const dbUrl = getVar('DATABASE_URL');
    const encKey = getVar('ENCRYPTION_KEY') || getVar('SESSION_SECRET');

    if (!dbUrl || !encKey) {
        process.exit(1);
    }

    const sql = postgres(dbUrl);

    try {
        console.log('Step 1: Restoring Azure Credentials (Specific Tenant)...');
        await sql`
            UPDATE shop_settings SET 
                microsoft_client_id = '72e03be8-0a78-4e03-8e47-ee2bb1600a09',
                microsoft_tenant_id = '730d24b2-1a9b-4669-b614-fb73275da7b0',
                microsoft_client_secret = '618becaf-8391-42fb-86da-63195f05e2cc'
        `;

        console.log('Step 2: Finding variant...');
        const vResult = await sql`SELECT id FROM product_variants WHERE is_sharing = true LIMIT 1`;
        let vId = vResult.length > 0 ? vResult[0].id : 1;

        console.log('Step 3: Ensuring MASTER account aymengp12@outlook.com...');
        await sql`DELETE FROM digital_codes WHERE ms_account_email = 'Arahamplin5568@outlook.com'`;
        await sql`DELETE FROM digital_codes WHERE ms_account_email = 'aymengp12@outlook.com'`;

        const fullCode = 'aymengp12@outlook.com | Royal@06';
        const encryptedCode = encrypt(fullCode, encKey);
        const encryptedPass = encrypt('Royal@06', encKey);

        await sql`
            INSERT INTO digital_codes (
                variant_id, code, outlook_password, status, ms_status, ms_account_email, is_relayed
            ) VALUES (
                ${vId}, ${encryptedCode}, ${encryptedPass}, 'DISPONIBLE', 'NONE', 'aymengp12@outlook.com', false
            )
        `;

        console.log('--- Setup successful! READY ---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    } finally {
        await sql.end();
    }
}
main();
