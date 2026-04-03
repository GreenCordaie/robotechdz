import postgres from 'postgres';
import crypto from 'crypto';

const sql = postgres('postgres://user:password@localhost:5435/flexbox');

const ENCRYPTION_KEY = '874a44c2839a42a9762d8f75d62c4246d335fdc1ecf1eaa3fa22ff2fa6f4d36c';
const ALGORITHM = "aes-256-gcm";

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}.${authTag}.${encrypted}`;
}

async function run() {
    try {
        const email = 'arahamplin5568@outlook.com';
        const pass = 'suiRssO358844';
        const encryptedPass = encrypt(pass);

        console.log(`Mise à jour du mot de passe pour ${email} (ID 344)...`);
        await sql`UPDATE digital_codes SET outlook_password = ${encryptedPass} WHERE id = 344`;

        console.log("Recherche du refresh token...");
        const rows = await sql`SELECT ms_refresh_token FROM digital_codes WHERE id = 344`;
        const msRefreshToken = rows[0]?.ms_refresh_token;

        if (!msRefreshToken) {
            console.error("ERREUR: Pas de refresh token trouvé pour ID 344. L'OAuth n'est pas complet?");
            process.exit(1);
        }

        // On va tenter d'importer le service via dynamic import (Next.js context might fail here, better use direct fetch to n8n if needed or mock)
        // Mais on peut essayer de relancer la résolution via le workflow n8n directement si on a les clés.

        console.log("Tentative de résolution via Graph (simulation d'appel n8n)...");
        // On va appeler directement le webhook n8n pour voir s'il répond bien pour ce compte.
        const settings = await sql`SELECT n8n_webhook_url, microsoft_client_id, microsoft_client_secret FROM shop_settings LIMIT 1`;
        const s = settings[0];

        // Pour rafraîchir le token, on a besoin du client_id/secret.
        console.log("Paramètres Microsoft:", { clientId: s.microsoft_client_id ? 'OK' : 'MISSING' });

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
