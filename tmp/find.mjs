import postgres from 'postgres';
import crypto from 'crypto';

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

const ENCRYPTION_KEY = '874a44c2839a42a9762d8f75d62c4246d335fdc1ecf1eaa3fa22ff2fa6f4d36c';
const ALGORITHM = "aes-256-gcm";

function decrypt(encryptedText) {
    if (!encryptedText || !encryptedText.includes(".")) return encryptedText;

    try {
        const [ivHex, authTagHex, encryptedDataHex] = encryptedText.split(".");
        if (!ivHex || !authTagHex || !encryptedDataHex) return encryptedText;

        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const encryptedData = Buffer.from(encryptedDataHex, "hex");

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedData, undefined, "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch (error) {
        return null;
    }
}

async function run() {
    try {
        const codes = await sql`
      SELECT digital_codes.id, digital_codes.code, digital_codes.ms_status 
      FROM digital_codes 
      JOIN product_variants ON digital_codes.variant_id = product_variants.id 
      JOIN products ON product_variants.product_id = products.id 
      WHERE products.name ILIKE '%Netflix%' AND digital_codes.ms_status = 'NONE'
      LIMIT 10
    `;

        console.log(`Found ${codes.length} codes`);
        for (let rc of codes) {
            if (rc.code) {
                const dec = decrypt(rc.code);
                if (dec) {
                    const parts = dec.split('|');
                    console.log(`ID: ${rc.id} | Email: ${parts[0]} | Pass: ${parts[1]} | MS_Status: ${rc.ms_status}`);
                }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
