import postgres from 'postgres';
import crypto from 'crypto';

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

async function refreshAccessToken(refreshToken) {
    const clientId = "2b71f1d3-e2f6-47db-b97e-7bb028c6d3b4";
    const clientSecret = "jdV8Q~CChK1ktwQS6AuztfO4uFpGt~MSgPYC~bk9";
    const tenantId = "consumers";
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId, client_secret: clientSecret,
            refresh_token: refreshToken, grant_type: "refresh_token",
            scope: "https://graph.microsoft.com/Mail.Read"
        }),
    });
    const data = await response.json();
    return data.access_token;
}

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

async function run() {
    try {
        const [acc] = await sql`SELECT ms_refresh_token FROM digital_codes WHERE id = 1`;
        const refreshToken = decrypt(acc.ms_refresh_token);
        const accessToken = await refreshAccessToken(refreshToken);

        const response = await fetch("https://graph.microsoft.com/v1.0/me/messages?$orderby=receivedDateTime desc&$top=5", {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();

        console.log('--- DERNIERS EMAILS COMPTE ID 1 ---');
        data.value.forEach(m => console.log(`[${m.receivedDateTime}] ${m.subject}`));

    } catch (e) {
        console.error('ERROR:', e.message);
    } finally {
        process.exit();
    }
}
run();
