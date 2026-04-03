import postgres from 'postgres';
import crypto from 'crypto';

const ENCRYPTION_KEY = "874a44c2839a42a9762d8f75d62c4246d335fdc1ecf1eaaa3fa22ff2fa6f4d36c";

function decrypt(text) {
    if (!text) return null;
    try {
        const [ivHex, encryptedHex] = text.split('.');
        if (!ivHex || !encryptedHex) return null;

        const iv = Buffer.from(ivHex, 'hex');
        const encryptedText = Buffer.from(encryptedHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        return null;
    }
}

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const [row] = await sql`SELECT code, outlook_password FROM digital_codes WHERE id = 216`;
        if (!row) {
            console.log('Account not found');
            return;
        }

        const fullCode = decrypt(row.code);
        const outlookPass = decrypt(row.outlook_password);

        console.log('Decrypted Info:');
        console.log('Full Code:', fullCode);
        console.log('Outlook Pass:', outlookPass);

        // Try to find the code via IMAP since ms_status is NONE
        const [email, pass] = fullCode.split('|').map(s => s.trim());

        console.log('\n--- Tentative de résolution via IMAP ---');
        // I can't easily run the full ImapFlow here without dependencies
        // But I will output the credentials so I can at least tell the user how to login if I fail.

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
