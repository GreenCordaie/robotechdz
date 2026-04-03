import crypto from 'crypto';
import fs from 'fs';

const ENCRYPTION_KEY = "874a44c2839a42a9762d8f75d62c4246d335fdc1ecf1eaa3fa22ff2fa6f4d36c";
const ALGORITHM = "aes-256-gcm";

function decrypt(encryptedText) {
    if (!encryptedText || !encryptedText.includes(".")) return encryptedText;
    try {
        const [ivHex, authTagHex, encryptedDataHex] = encryptedText.split(".");
        const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const encryptedData = Buffer.from(encryptedDataHex, "hex");
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedData, undefined, "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (error) { return null; }
}

const data = JSON.parse(fs.readFileSync('tmp/account_1.json', 'utf8'));
const acc = data[0];
console.log('ID:', acc.id);
console.log('Credentials Netfix:', decrypt(acc.code));
console.log('MS Status:', acc.ms_status);
