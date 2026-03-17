const { spawn, execSync } = require('child_process');
const fs = require('fs');
const postgres = require('postgres');
const path = require('path');

// 1. Check if cloudflared is installed
try {
    execSync('cloudflared --version', { stdio: 'ignore' });
} catch (e) {
    console.error("❌ ERREUR: 'cloudflared' n'est pas installé ou n'est pas dans le PATH.");
    console.log("👉 Veuillez installer Cloudflare Tunnel : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
    process.exit(1);
}

// 2. Parse .env file
const envPath = path.join(__dirname, '..', '.env');
const envConfig = {};
try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const cleanLine = line.replace(/\r/g, '').trim();
        const match = cleanLine.match(/^([^=]+)=(.*)$/);
        if (match) {
            envConfig[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '').trim();
        }
    });
} catch (e) {
    console.error("❌ ERREUR: Impossible de lire le fichier .env");
    process.exit(1);
}

const DATABASE_URL = envConfig['DATABASE_URL'] || process.env.DATABASE_URL;
const TELEGRAM_SECRET_TOKEN = envConfig['TELEGRAM_SECRET_TOKEN'] || process.env.TELEGRAM_SECRET_TOKEN || "flexbox_secure_token_2026";

if (!DATABASE_URL) {
    console.error("❌ ERREUR: DATABASE_URL est manquant dans le fichier .env !");
    process.exit(1);
}

// 3. Start Next.js Server
console.log("🚀 [1/3] Lancement du serveur Next.js (Port 1556)...");
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const nextProcess = spawn(npmCmd, ['run', 'dev'], { stdio: 'inherit', shell: true });

// 4. Start Cloudflared Tunnel
console.log("🌐 [2/3] Lancement du tunnel Cloudflare...");
const cloudflaredProcess = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:1556'], { shell: true });

let publicUrl = null;

cloudflaredProcess.stdout.on('data', (data) => processCloudflaredLog(data.toString()));
cloudflaredProcess.stderr.on('data', (data) => processCloudflaredLog(data.toString()));

cloudflaredProcess.on('error', (err) => {
    console.error("❌ Erreur lors du lancement de cloudflared:", err.message);
});

async function processCloudflaredLog(text) {
    // Cloudflared logs everything to stderr usually. Print relevant parts visually.
    if (text.includes("ERR") || text.includes("error")) {
        process.stdout.write(text);
    }

    if (publicUrl) return; // Once found, ignore further logs

    const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (urlMatch) {
        publicUrl = urlMatch[0];
        console.log(`\n✅ URL Publique détectée : ${publicUrl}`);
        console.log("🤖 [3/3] Paramétrage automatique de Telegram en cours...");
        await updateConfigAndTelegram(publicUrl);
    }
}

async function updateConfigAndTelegram(url) {
    const sql = postgres(DATABASE_URL);
    try {
        const settings = await sql`SELECT * FROM shop_settings LIMIT 1`;
        if (settings.length === 0) {
            console.log("⚠️ Aucune configuration 'shop_settings' trouvée. Webhook ignoré.");
            return;
        }

        const currentSettings = settings[0];

        // Update URL in DB
        await sql`UPDATE shop_settings SET webhook_url = ${url} WHERE id = ${currentSettings.id}`;
        console.log("✅ URL enregistrée dans la base de données (shop_settings).");

        // Format dates correctly for Telegram
        const now = new Date().toLocaleString('fr-FR');

        const telegramToken = currentSettings.telegram_bot_token;
        const telegramChatId = currentSettings.telegram_chat_id;

        if (telegramToken && telegramChatId) {
            // A. Set Webhook
            const webhookEndpoint = `${url}/api/telegram/webhook`;
            console.log(`🔗 Configuration du Webhook : ${webhookEndpoint}`);
            const webhookRes = await fetch(`https://api.telegram.org/bot${telegramToken}/setWebhook?url=${webhookEndpoint}&secret_token=${TELEGRAM_SECRET_TOKEN}`, { method: 'POST' });
            const webhookData = await webhookRes.json();

            if (webhookData.ok) {
                console.log("✅ Webhook Telegram configuré et sécurisé avec succès !");
            } else {
                console.error("❌ Erreur Webhook:", webhookData.description);
            }

            // B. Send Notification Message
            const message = `🚀 *FLEXBOX DIRECT - MODE DEV*\n\nLe serveur local a redémarré à ${now} !\n\n🔗 *Nouvelle URL d'accès global / Webhook* :\n${url}\n\n_Le bot est de nouveau prêt à recevoir et imprimer des codes._`;
            const msgRes = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegramChatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });

            if (msgRes.ok) {
                console.log("✅ Message d'alerte envoyé sur le groupe Telegram de l'équipe !");
            }
        } else {
            console.log("⚠️ Token ou Chat ID Telegram manquants. Configuration ignorée.");
        }

    } catch (e) {
        console.error("❌ Erreur DB/API :", e);
    } finally {
        await sql.end();
        console.log("\n🎉 SYSTÈME OPÉRATIONNEL ! Laissez cette fenêtre ouverte.");
        console.log("👉 Accès local : http://localhost:1556");
        console.log(`👉 Accès distant : ${url}\n`);
    }
}

// Nettoyage à l'arrêt (Ctrl+C)
process.on('SIGINT', () => {
    console.log("\nArrêt des processus...");
    if (nextProcess) nextProcess.kill();
    if (cloudflaredProcess) cloudflaredProcess.kill();
    process.exit();
});
