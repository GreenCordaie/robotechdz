const postgres = require('postgres');
const crypto = require('crypto');

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

const ENCRYPTION_KEY = '874a44c2839a42a9762d8f75d62c4246d335fdc1ecf1eaa3fa22ff2fa6f4d36c';
const IV_LENGTH = 16;

function decrypt(text) {
    if (!text) return null;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return null;
    }
}

async function main() {
    try {
        const settings = await sql`SELECT * FROM shop_settings LIMIT 1`;
        const s = settings[0];

        const codes = await sql`SELECT ms_refresh_token FROM digital_codes WHERE id = 344`;
        const code = codes[0];

        const refreshToken = decrypt(code.ms_refresh_token);

        console.log('🔄 Rafraichissement de l\'Access Token...');
        const tokenRes = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: s.microsoft_client_id,
                client_secret: s.microsoft_client_secret,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
                scope: "https://graph.microsoft.com/Mail.Read"
            }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            console.error('❌ Echec du rafraichissement:', tokenData);
            process.exit(1);
        }

        console.log('✅ Access Token obtenu!');

        console.log('📬 Appel Microsoft Graph API pour lire les emails Netflix...');
        const graphRes = await fetch(
            "https://graph.microsoft.com/v1.0/me/messages?$search=\"from:info@account.netflix.com\"&$select=subject,bodyPreview,body,receivedDateTime&$top=5",
            {
                headers: {
                    Authorization: `Bearer ${tokenData.access_token}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const graphData = await graphRes.json();

        if (graphData.error) {
            console.error('❌ Erreur Graph API:', graphData.error);
            process.exit(1);
        }

        if (graphData.value && graphData.value.length > 0) {
            console.log(`✅ ${graphData.value.length} emails Netflix trouvés !`);
            const msg = graphData.value[0];
            console.log(`Titre: ${msg.subject}`);
            console.log(`Date: ${msg.receivedDateTime}`);

            // Extraction simple du code pour la démo
            const codeRegex = />\s*(\d{4,6})\s*</;
            const linkRegex = /href="([^"]*update-primary-location[^"]*)"/i;

            const body = msg.body?.content || '';

            const codeMatch = body.match(codeRegex);
            const linkMatch = body.match(linkRegex);

            if (codeMatch) console.log('🎯 Code temporaire extrait:', codeMatch[1]);
            if (linkMatch) console.log('🔗 Lien de mise à jour extrait:', linkMatch[1]);

        } else {
            console.log('⚠️ Aucun email Netflix trouvé. (La recherche a fonctionné mais la boite ne contient pas de message de Netflix récent)');
        }

    } catch (err) {
        console.error('❌ Exception:', err);
    } finally {
        await sql.end();
    }
}

main();
