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

async function run() {
    try {
        const codes = await sql`SELECT id, code, ms_status, ms_refresh_token FROM digital_codes`;

        let foundCount = 0;
        for (let rc of codes) {
            if (rc.code) {
                const dec = decrypt(rc.code);
                if (dec && dec.includes('arahamplin5568@outlook.com')) {
                    foundCount++;
                    console.log(`-- COMPTE TROUVÉ --`);
                    console.log(`ID en BDD : ${rc.id}`);
                    console.log(`Email/Pass : ${dec}`);
                    console.log(`Statut MS : ${rc.ms_status}`);
                    console.log(`Refresh Token présent ? : ${!!rc.ms_refresh_token}`);

                    if (rc.ms_refresh_token) {
                        const rtoken = decrypt(rc.ms_refresh_token);
                        console.log("-> Le Refresh token est correctement chiffré/déchiffrable.");

                        // Affichons la valeur d'url pour tester OAuth Graph API 
                        console.log(`-> Lien de reconnexion au besoin : https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=2b71f1d3-e2f6-47db-b97e-7bb028c6d3b4&response_type=code&redirect_uri=https://operations-heat-rhode-hockey.trycloudflare.com/api/auth/microsoft/callback&response_mode=query&scope=offline_access+Mail.Read&state=${rc.id}&prompt=select_account`);
                    }
                }
            }
        }

        if (foundCount === 0) {
            console.log("Le compte 'arahamplin5568@outlook.com' n'existe pas dans digital_codes.");
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
run();
