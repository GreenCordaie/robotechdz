import postgres from 'postgres';
import crypto from 'crypto';

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

const ENCRYPTION_KEY = '874a44c2839a42a9762d8f75d62c4246d335fdc1ecf1eaa3fa22ff2fa6f4d36c';
const ALGORITHM = "aes-256-gcm";

function decrypt(encryptedText) {
    if (!encryptedText || !encryptedText.includes(".")) return encryptedText;
    try {
        const [ivHex, authTagHex, encryptedDataHex] = encryptedText.split(".");
        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
        let decrypted = decipher.update(Buffer.from(encryptedDataHex, "hex"), undefined, "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (e) {
        return null;
    }
}

async function run() {
    try {
        console.log("--- RECHERCHE DANS DIGITAL_CODES ---");
        const codes = await sql`SELECT id, code, ms_account_email, ms_status FROM digital_codes`;
        let found = false;
        for (const r of codes) {
            const decCode = decrypt(r.code);
            const msEmail = r.ms_account_email;
            if ((decCode && decCode.toLowerCase().includes('arahamplin5568')) || (msEmail && msEmail.toLowerCase().includes('arahamplin5568'))) {
                console.log(`TROUVÉ! ID: ${r.id}, msEmail: ${msEmail}, Status MS: ${r.ms_status}, Déchiffré: ${decCode}`);
                found = true;
            }
        }
        if (!found) console.log("Non trouvé dans digital_codes.");

        console.log("\n--- RECHERCHE DANS CLIENTS ---");
        const clientsSearch = await sql`SELECT id, nom_complet, telephone FROM clients`;
        for (const c of clientsSearch) {
            if (c.nom_complet?.toLowerCase().includes('arah') || c.telephone?.includes('5568')) {
                console.log(`MATCH CLIENT? ID: ${c.id}, Nom: ${c.nom_complet}, Tel: ${c.telephone}`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
