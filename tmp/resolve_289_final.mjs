import crypto from 'crypto';
import fs from 'fs';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

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

async function run() {
    const data = JSON.parse(fs.readFileSync('tmp/all_accounts_279_v2.json', 'utf8'));
    const acc = data.find(a => a.id === 289);
    if (!acc) {
        console.log('Account 289 not found in file');
        return;
    }

    console.log(`\n--- Analyse Compte ID 289 (#${acc.order_number}) ---`);
    const fullCode = decrypt(acc.code);
    const [netflixEmail] = fullCode.split('|').map(s => s.trim());
    const outlookPass = decrypt(acc.outlook_password);

    console.log(`Email Netflix: ${netflixEmail}`);
    console.log(`Outlook Password: ${outlookPass}`);

    const client = new ImapFlow({
        host: 'outlook.office365.com',
        port: 993,
        secure: true,
        auth: { user: netflixEmail, pass: outlookPass },
        logger: false
    });

    try {
        await client.connect();
        console.log('Connecté à Outlook IMAP !');
        const lock = await client.getMailboxLock('INBOX');
        try {
            const since = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
            console.log('Recherche emails depuis 1h...');
            for await (const message of client.fetch({ since }, { source: true, envelope: true })) {
                console.log(`Email trouvé: ${message.envelope.subject}`);
                if (message.envelope.subject.toLowerCase().includes('netflix')) {
                    const parsed = await simpleParser(message.source);
                    const body = parsed.text + " " + parsed.html;
                    const cleanText = body.replace(/https?:\/\/[^\s<>"]+/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
                    const match4 = cleanText.match(/\b(\d{4})\b/);
                    if (match4) {
                        console.log(`✅ CODE NETFLIX TROUVÉ: ${match4[1]}`);
                        return;
                    }
                }
            }
            console.log('❌ Aucun code trouvé dans les emails récents.');
        } finally {
            lock.release();
        }
    } catch (e) {
        console.error("IMAP Error:", e.message);
    } finally {
        await client.logout().catch(() => { });
        process.exit();
    }
}

run();
