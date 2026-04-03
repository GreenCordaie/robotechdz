import postgres from 'postgres';
import crypto from 'crypto';
import fs from 'fs';

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

async function refreshAccessToken(refreshToken) {
    const clientId = "2b71f1d3-e2f6-47db-b97e-7bb028c6d3b4";
    const clientSecret = "jdV8Q~CChK1ktwQS6AuztfO4uFpGt~MSgPYC~bk9";
    const tenantId = "consumers";

    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            scope: "https://graph.microsoft.com/Mail.Read"
        }),
    });

    const data = await response.json();
    if (!data.access_token) {
        console.error('Refresh Error:', JSON.stringify(data, null, 2));
        throw new Error("Échec rafraîchissement token.");
    }
    return data.access_token;
}

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const [acc] = await sql`SELECT ms_refresh_token FROM digital_codes WHERE id = 344`;
        const refreshToken = decrypt(acc.ms_refresh_token);

        const accessToken = await refreshAccessToken(refreshToken);
        console.log('AccessToken obtenu !');

        const webhookUrl = "http://localhost:5678/webhook/flexbox-gateway";
        const payload = {
            eventName: "NETFLIX_GRAPH_RESOLVE",
            config: {},
            data: {
                netflixEmail: "arahamplin5568@outlook.com",
                msAccessToken: accessToken,
                timestamp: new Date().toISOString()
            }
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('Résultat n8n:', JSON.stringify(result, null, 2));

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        process.exit();
    }
}

run();
