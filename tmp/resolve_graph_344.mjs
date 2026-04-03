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
        console.error("Decryption failed:", error.message);
        return null;
    }
}

async function refreshAccessToken(refreshToken) {
    // Client ID and Secret from your previous turn or settings
    const clientId = "72e03be8-0a78-4e03-8e47-ee2bb1600a09";
    const tenantId = "consumers";

    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            scope: "https://graph.microsoft.com/Mail.Read"
        }),
    });

    const data = await response.json();
    if (!data.access_token) {
        console.error('Refresh Error:', data);
        throw new Error("Échec rafraîchissement token.");
    }
    return data.access_token;
}

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const [acc] = await sql`SELECT ms_refresh_token FROM digital_codes WHERE id = 344`;
        if (!acc?.ms_refresh_token) {
            console.log('Account 344 refresh token not found');
            return;
        }

        const refreshToken = decrypt(acc.ms_refresh_token);
        console.log('Refresh token décodé. Tentative de rafraîchissement accessToken...');

        const accessToken = await refreshAccessToken(refreshToken);
        console.log('AccessToken obtenu ! Tentative d\'appel n8n...');

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
