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

async function getTokens() {
    const params = new URLSearchParams({
        client_id: '2b71f1d3-e2f6-47db-b97e-7bb028c6d3b4',
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || 'Z.g8Q~z4j-GEXh3jT~s2~X~B-0W.J9lZqE.3-ajE',
        refresh_token: process.env.REFRESH_TOKEN,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Mail.Read'
    });

    const res = await fetch(`https://login.microsoftonline.com/consumers/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });
    return res.json();
}

async function run() {
    try {
        const codes = await sql`
      SELECT id, code, ms_refresh_token, ms_status FROM digital_codes 
      WHERE ms_status = 'CONNECTED' AND ms_refresh_token IS NOT NULL
    `;

        let targetToken = null;
        for (let rc of codes) {
            const decCode = decrypt(rc.code);
            if (decCode && decCode.includes('arahamplin5568@outlook.com')) {
                targetToken = decrypt(rc.ms_refresh_token);
                break;
            }
        }

        if (!targetToken) {
            console.log("Compte 'arahamplin5568@outlook.com' introuvable ou non connecté via OAuth.");
            process.exit(0);
        }

        process.env.REFRESH_TOKEN = targetToken;
        const tokens = await getTokens();
        if (!tokens.access_token) {
            console.error("Erreur de rafraîchissement:", tokens);
            process.exit(0);
        }

        console.log("Access Token obtenu. Récupération des emails...");
        const mailRes = await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=5&$select=subject,bodyPreview,body,receivedDateTime&$filter=from/emailAddress/address eq 'info@account.netflix.com' or from/emailAddress/address eq 'info@mailer.netflix.com'&$orderby=receivedDateTime desc", {
            headers: { "Authorization": `Bearer ${tokens.access_token}` }
        });
        const mails = await mailRes.json();

        if (!mails.value || mails.value.length === 0) {
            console.log("Aucun email récent de Netflix trouvé.");
        } else {
            console.log(`Trouvé ${mails.value.length} emails de Netflix.`);
            const latest = mails.value[0];
            console.log(`-- SUJET: ${latest.subject} (${latest.receivedDateTime})`);

            // Recherche du code à 4 chiffres (ex: 1234) ou d'un lien
            let codeMatch = latest.bodyPreview.match(/\b\d{4}\b/);
            if (codeMatch) {
                console.log(`✅ CODE TROUVÉ : ${codeMatch[0]}`);
            } else {
                console.log("⚠️ Preview : " + latest.bodyPreview);
                // Si le code temporaire est dans le body en HTML
                let bodyCodeMatch = latest.body.content.match(/>(\d{4})</);
                if (bodyCodeMatch) {
                    console.log(`✅ CODE TROUVÉ (HTML) : ${bodyCodeMatch[1]}`);
                }
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
run();
