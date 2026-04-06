import postgres from 'postgres';
import crypto from 'crypto';

const sql = postgres('postgres://user:password@localhost:5435/flexbox');
const ENCRYPTION_KEY = crypto.createHash('sha256').update('flexbox-secret-key-2024').digest('base64').substring(0, 32);
const IV_LENGTH = 16;

function decrypt(text) {
    if (!text) return null;
    let textParts = text.split('.');
    let iv = Buffer.from(textParts[0], 'hex');
    let encryptedText = Buffer.from(textParts[2], 'hex');
    let decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
    decipher.setAuthTag(Buffer.from(textParts[1], 'hex'));
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

async function run() {
    try {
        const codes = await sql`
      SELECT digital_codes.id, digital_codes.code, digital_codes.ms_status 
      FROM digital_codes 
      JOIN product_variants ON digital_codes.variant_id = product_variants.id 
      JOIN products ON product_variants.product_id = products.id 
      WHERE products.name ILIKE '%Netflix%' AND digital_codes.status = 'DISPONIBLE'
      LIMIT 10
    `;

        for (let rc of codes) {
            if (rc.code) {
                try {
                    const dec = decrypt(rc.code);
                    const parts = dec.split('|');
                    console.log(`ID: ${rc.id} | Email: ${parts[0]} | Pass: ${parts[1]} | MS_Status: ${rc.ms_status}`);
                } catch (e) { }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
