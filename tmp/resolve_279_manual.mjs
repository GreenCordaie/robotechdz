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
        console.error("Decryption failed:", error.message);
        return null;
    }
}

async function fetchLatestNetflixEmail(netflixEmail, imapUser, imapPass, imapHost) {
    console.log(`Tentative IMAP pour ${netflixEmail} via ${imapHost}...`);
    const client = new ImapFlow({
        host: imapHost,
        port: 993,
        secure: true,
        auth: { user: imapUser, pass: imapPass },
        logger: false
    });

    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const since = new Date(Date.now() - 30 * 60 * 1000); // 30 mins
            let found = null;
            for await (const message of client.fetch({ since }, { source: true, envelope: true })) {
                const subject = message.envelope.subject || "";
                if (subject.toLowerCase().includes("netflix") && (subject.toLowerCase().includes("code") || subject.toLowerCase().includes("vérif") || subject.toLowerCase().includes("foyer"))) {
                    found = message;
                }
            }
            if (!found) return null;
            const parsed = await simpleParser(found.source);
            return parsed.text + " " + parsed.html;
        } finally {
            lock.release();
        }
    } catch (e) {
        console.error("IMAP Error:", e.message);
        return null;
    } finally {
        await client.logout().catch(() => { });
    }
}

function extractCode(content) {
    if (!content) return null;
    const cleanText = content.replace(/https?:\/\/[^\s<>"]+/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const codeRegex = /\b(\d{4})\b/; // Code Netflix Foyer à 4 chiffres
    const match4 = cleanText.match(codeRegex);
    if (match4) return match4[1];

    const codeRegex6 = /\b(\d{6})\b/; // Code login à 6 chiffres
    const match6 = cleanText.match(codeRegex6);
    if (match6) return match6[1];

    return null;
}

async function run() {
    const data = JSON.parse(fs.readFileSync('tmp/all_accounts_279_v2.json', 'utf8'));

    for (const acc of data) {
        console.log(`\n--- Analyse Compte ID ${acc.id} (#${acc.order_number}) ---`);
        const fullCode = decrypt(acc.code);
        if (!fullCode) continue;

        const [netflixEmail, netflixPass] = fullCode.split('|').map(s => s.trim());
        const outlookPass = decrypt(acc.outlook_password) || netflixPass;

        console.log(`Email Netflix: ${netflixEmail}`);

        const host = netflixEmail.endsWith('@gmail.com') ? 'imap.gmail.com' : 'outlook.office365.com';
        const body = await fetchLatestNetflixEmail(netflixEmail, netflixEmail, outlookPass, host);

        if (body) {
            const code = extractCode(body);
            if (code) {
                console.log(`✅ CODE TROUVÉ: ${code}`);
            } else {
                console.log(`❌ Email trouvé mais aucun code extrait.`);
            }
        } else {
            console.log(`❌ Aucun email Netflix récent trouvé.`);
        }
    }
    process.exit();
}

run();
