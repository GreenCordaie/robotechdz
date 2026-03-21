const { spawn, execSync } = require('child_process');
const fs = require('fs');
const postgres = require('postgres');
const path = require('path');

/** 
 * ROBOTECH ORCHESTRATOR PRO v3.0
 * Automates: Next.js + n8n + 2x Cloudflare Tunnels + Config Sync
 */

// 1. Dependency Check
try {
    execSync('cloudflared --version', { stdio: 'ignore' });
} catch (e) {
    console.error("❌ ERREUR: 'cloudflared' n'est pas installé ou n'est pas dans le PATH.");
    process.exit(1);
}

// 2. Load Config from .env
const envPath = path.join(__dirname, '..', '.env');
const envConfig = {};
function readEnv() {
    try {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach(line => {
            const m = line.trim().match(/^([^=]+)=(.*)$/);
            if (m) envConfig[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
        });
    } catch (e) { }
}
readEnv();

function updateEnv(key, value) {
    let content = fs.readFileSync(envPath, 'utf-8');
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (content.match(regex)) {
        content = content.replace(regex, `${key}="${value}"`);
    } else {
        content += `\n${key}="${value}"`;
    }
    fs.writeFileSync(envPath, content, 'utf-8');
    process.stdout.write(`📝 .env updated: ${key}\n`);
}

const DATABASE_URL = envConfig['DATABASE_URL'] || process.env.DATABASE_URL;
const TELEGRAM_SECRET_TOKEN = envConfig['TELEGRAM_SECRET_TOKEN'] || "flexbox_secure_token_2026";

if (!DATABASE_URL) {
    console.error("❌ ERREUR: DATABASE_URL manquant.");
    process.exit(1);
}

// 3. Start Processes
console.log("🚀 [1/3] Lancement des services...");

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

// A. Next.js
const nextProcess = spawn(npmCmd, ['run', 'dev'], { stdio: 'inherit', shell: true });

// B. Cloudflared App Tunnel
console.log("🌐 [2/3] Initialisation des tunnels Cloudflare...");
const appTunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:1556'], { shell: true });

// C. Cloudflared n8n Tunnel (Optional but recommended)
const n8nTunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:5678'], { shell: true });

let appUrl = null;
let n8nUrl = null;

async function onAppUrlDetected(url) {
    appUrl = url;
    console.log(`\n✅ APP URL : ${url}`);
    updateEnv('NEXT_PUBLIC_APP_URL', url);
    await syncSystem();
}

async function onN8nUrlDetected(url) {
    n8nUrl = url;
    console.log(`✅ n8n URL : ${url}`);
    updateEnv('N8N_WEBHOOK_URL', `${url}/webhook/flexbox`);
    await syncSystem();
}

appTunnel.stderr.on('data', (d) => {
    const text = d.toString();
    if (text.includes("ERR")) process.stdout.write(`[AppTunnel ERROR] ${text}`);
    const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (m && !appUrl) onAppUrlDetected(m[0]);
});

n8nTunnel.stderr.on('data', (d) => {
    const text = d.toString();
    const m = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (m && !n8nUrl) onN8nUrlDetected(m[0]);
});

async function syncSystem() {
    if (!appUrl) return; // We need at least the app URL

    const sql = postgres(DATABASE_URL);
    try {
        const settings = await sql`SELECT * FROM shop_settings LIMIT 1`;
        if (settings.length === 0) return;
        const current = settings[0];

        // 1. Update Database URLs
        const updates = {
            webhook_url: appUrl,
            whatsapp_webhook_url: `${appUrl}/api/webhooks/whatsapp`
        };
        if (n8nUrl) {
            updates.n8n_webhook_url = `${n8nUrl}/webhook/flexbox`;
        }

        await sql`UPDATE shop_settings SET ${sql(updates)} WHERE id = ${current.id}`;
        console.log("✅ Base de données synchronisée.");

        // 2. Telegram Webhook sync
        if (current.telegram_bot_token) {
            const webhookEndpoint = `${appUrl}/api/telegram/webhook`;
            await fetch(`https://api.telegram.org/bot${current.telegram_bot_token}/setWebhook?url=${webhookEndpoint}&secret_token=${TELEGRAM_SECRET_TOKEN}`);
            console.log("✅ Webhook Telegram mis à jour.");
        }

        // 3. Evolution API Webhook sync
        const waUrl = (current.whatsapp_api_url || "http://127.0.0.1:3001").replace(/\/$/, '');
        const waKey = current.whatsapp_api_key || "abc";
        const waInstance = current.whatsapp_instance_name || "FLEXBOX_APP";

        try {
            const waReq = waUrl.includes('localhost') ? waUrl.replace('localhost', '127.0.0.1') : waUrl;
            await fetch(`${waReq}/webhook/instance/${waInstance}`, {
                method: 'POST',
                headers: { 'apikey': waKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: `${appUrl}/api/webhooks/whatsapp`,
                    enabled: true,
                    events: ["MESSAGES_UPSERT"]
                })
            });
            console.log("✅ Webhook WhatsApp synchronisé.");
        } catch (e) { }

    } catch (e) {
        console.error("❌ Erreur Sync:", e.message);
    } finally {
        await sql.end();
    }
}

process.on('SIGINT', () => {
    console.log("\nArrêt...");
    [nextProcess, appTunnel, n8nTunnel].forEach(p => p && p.kill());
    process.exit();
});
