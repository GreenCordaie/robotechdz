const postgres = require('postgres');
const crypto = require('crypto');

const ENCRYPTION_KEY = "874a44c2839a42a9762d8f75d62c4246d335fdc1ecf1eaa3fa22ff2fa6f4d36c";
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

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function main() {
    try {
        const codes = await sql`SELECT id, code, ms_status, ms_account_email FROM digital_codes`;
        let found = false;
        for (const c of codes) {
            const decryptedCode = decrypt(c.code);
            if (decryptedCode && decryptedCode.toLowerCase().includes('arahamplin')) {
                console.log(`TROUVE! ID: ${c.id} | Email: ${decryptedCode} | ms_status: ${c.ms_status} | ms_account_email: ${c.ms_account_email}`);
                found = true;
            }
        }
        if (!found) console.log("Aucun compte Arahamplin5568 trouvé.");
    } catch (e) {
        console.error(e);
    } finally {
        await sql.end();
    }
}
main();
