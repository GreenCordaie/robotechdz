const { spawn, execSync } = require('child_process');
const fs = require('fs');
const postgres = require('postgres');
const path = require('path');
const crypto = require('crypto');

// Minimal mirror of src/lib/encryption.ts decrypt() — telegram_bot_token is now
// encrypted at rest, but this dev script reads it via raw SQL (bypassing the
// Drizzle decrypt). Returns cleartext unchanged when it isn't in our format.
function decryptSecret(value) {
    if (!value || typeof value !== 'string' || !value.includes('.')) return value;
    const [ivHex, authTagHex, dataHex] = value.split('.');
    if (!ivHex || !authTagHex || !dataHex) return value;
    const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
    if (!secret) return value;
    try {
        const key = crypto.createHash('sha256').update(secret).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        return decipher.update(Buffer.from(dataHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
    } catch {
        return value;
    }
}

/**
 * ROBOTECH ORCHESTRATOR v6.1 (Resilient)
 * Démarrage 1-click : Next.js + Cloudflare + Sync DB/Waha/Telegram
 */

const APP_PORT = 1556;
const N8N_PORT = 5678;
const WAHA_URL = 'http://localhost:3001';
const WAHA_API_KEY = 'abc';
const WAHA_SESSION = 'default';

// ─── Dépendances ──────────────────────────────────────────────────────────────
try {
    execSync('cloudflared --version', { stdio: 'ignore' });
} catch (e) {
    console.error("❌ 'cloudflared' n'est pas installé ou absent du PATH.");
    process.exit(1);
}

// ─── Lecture du .env ──────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
const envConfig = {};

function readEnv() {
    try {
        fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
            const m = line.trim().match(/^([^#=][^=]*)=(.*)$/);
            if (m) envConfig[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
        });
    } catch (e) { }
}
readEnv();

function updateEnv(key, value) {
    try {
        let content = fs.readFileSync(envPath, 'utf-8');
        const regex = new RegExp(`^${key}=.*`, 'm');
        content = content.match(regex)
            ? content.replace(regex, `${key}="${value}"`)
            : content + `\n${key}="${value}"`;
        fs.writeFileSync(envPath, content, 'utf-8');
        console.log(`   📝 .env → ${key}=${value}`);
    } catch (e) {
        console.log(`   ⚠️  Impossible de mettre à jour le .env: ${e.message}`);
    }
}

const DATABASE_URL = envConfig['DATABASE_URL'] || process.env.DATABASE_URL;
const TELEGRAM_SECRET = envConfig['TELEGRAM_SECRET_TOKEN'] || "flexbox_secure_token_2026";

if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL manquant dans le .env");
    process.exit(1);
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url, opts = {}) {
    try {
        const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
        return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ─── Telegram : envoyer un message ───────────────────────────────────────────
async function sendTelegram(botToken, chatId, text) {
    if (!botToken || !chatId) return;
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
            signal: AbortSignal.timeout(8000)
        });
        const data = await res.json();
        if (data.ok) {
            console.log(`   ✅ Telegram notification envoyée`);
        } else {
            console.log(`   ⚠️  Telegram : ${JSON.stringify(data).slice(0, 100)}`);
        }
    } catch (e) {
        console.log(`   ⚠️  Telegram erreur : ${e.message}`);
    }
}

// ─── Waha : attendre un statut donné ─────────────────────────────────────────
async function waitWahaStatus(targetStatuses, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetchJson(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
                headers: { 'X-Api-Key': WAHA_API_KEY }
            });
            if (r.ok && targetStatuses.includes(r.data.status)) return r.data;
        } catch (e) { }
        process.stdout.write('.');
        await sleep(3000);
    }
    return null;
}

// ─── Waha : sync session + webhook ───────────────────────────────────────────
async function syncWaha() {
    const wahaWebhookUrl = `http://host.docker.internal:${APP_PORT}/api/webhooks/whatsapp`;

    try {
        console.log(`   ⏳ Attente Waha`);
        let wahaReady = false;
        for (let i = 0; i < 20; i++) {
            try {
                const r = await fetch(`${WAHA_URL}/api/sessions`, {
                    headers: { 'X-Api-Key': WAHA_API_KEY },
                    signal: AbortSignal.timeout(3000)
                });
                if (r.ok) { wahaReady = true; break; }
            } catch (e) { }
            process.stdout.write('.');
            await sleep(2000);
        }
        console.log('');
        if (!wahaReady) {
            console.log("   ⚠️  Waha inaccessible, skip sync");
            return false;
        }

        const { data: session } = await fetchJson(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
            headers: { 'X-Api-Key': WAHA_API_KEY }
        });

        if (!session || session.status === 'STOPPED' || session.status === 'FAILED' || !session.status) {
            await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}/start`, {
                method: 'POST',
                headers: { 'X-Api-Key': WAHA_API_KEY, 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(8000)
            });
            console.log("   🔄 Waha : session démarrée");
        }

        await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
            method: 'PUT',
            headers: { 'X-Api-Key': WAHA_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: {
                    webhooks: [{
                        url: wahaWebhookUrl,
                        events: ['message'],
                        customHeaders: [{ name: 'x-api-key', value: WAHA_API_KEY }],
                        retries: { delaySeconds: 2, attempts: 2 }
                    }]
                }
            }),
            signal: AbortSignal.timeout(8000)
        });

        console.log(`   🔄 Waha webhook → ${wahaWebhookUrl}`);
        const finalStatus = await waitWahaStatus(['WORKING', 'SCAN_QR_CODE'], 90000);
        console.log('');

        if (finalStatus?.status === 'WORKING') {
            console.log(`   ✅ Waha WORKING : ${finalStatus.me?.id || 'connecté'}`);
            return true;
        }

        if (finalStatus?.status === 'SCAN_QR_CODE') {
            try {
                const qrRes = await fetch(`${WAHA_URL}/api/screenshot?session=${WAHA_SESSION}`, {
                    headers: { 'X-Api-Key': WAHA_API_KEY },
                    signal: AbortSignal.timeout(8000)
                });
                const buf = await qrRes.arrayBuffer();
                const desktopPath = process.platform === 'win32'
                    ? `${process.env.USERPROFILE}\\Desktop\\waha-qr.png`
                    : `${process.env.HOME}/Desktop/waha-qr.png`;
                fs.writeFileSync(desktopPath, Buffer.from(buf));
                console.log(`   📱 QR sauvegardé : ${desktopPath}`);
            } catch (e) { }
            console.log(`   ⚠️  Waha : scan QR requis → ouvre http://localhost:3001`);
            return false;
        }
        return false;
    } catch (e) {
        console.log(`   ⚠️  Waha erreur : ${e.message}`);
        return false;
    }
}

// ─── Lancement des processus ──────────────────────────────────────────────────
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  🤖 ROBOTECH ORCHESTRATOR v6.1 - Démarrage...");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

console.log(`\n🐳 [0/4] Démarrage des services Docker...`);
try {
    execSync('docker compose up -d', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: true
    });
    console.log(`   ✅ Docker services démarrés`);
} catch (e) {
    console.log(`   ⚠️  Docker : ${e.message?.slice(0, 80)}`);
}

console.log(`\n🖨️  [1/5] Print Service : géré par RobotechPrint.exe sur le PC caisse.`);

console.log(`\n🚀 [2/5] Next.js dev sur le port ${APP_PORT}...`);
const nextProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_OPTIONS: '--dns-result-order=ipv4first' }
});

console.log(`🌐 [3/5] Lancement du tunnel fixe Cloudflare (robotech-boutique)...`);
const mainTunnel = spawn('cloudflared', ['tunnel', 'run', 'robotech-boutique'], { shell: true });

let appUrl = 'https://boutique.nexusbox.tech';
let n8nUrl = 'https://n8n.nexusbox.tech';
let synced = false;

setTimeout(async () => {
    if (!synced) {
        console.log(`\n✅ Domaines fixes détectés : ${appUrl}`);
        updateEnv('NEXT_PUBLIC_APP_URL', appUrl);
        await syncAll();
    }
}, 3000);

// ─── Sync tout ───────────────────────────────────────────────────────────────
async function syncAll(forceWaha = false) {
    if (synced && !forceWaha) return;
    synced = true;

    console.log("\n🔄 [4/4] Synchronisation complète (Services locaux)...");

    let shopSettings = null;
    const sql = postgres(DATABASE_URL, { connect_timeout: 3 });

    // 1. Sync Base de données (Facultatif si DNS fail)
    try {
        console.log("   📡 Tentative de connexion à Supabase...");
        const rows = await sql`SELECT * FROM shop_settings LIMIT 1`;
        if (rows.length) {
            shopSettings = rows[0];
            await sql`
                UPDATE shop_settings SET
                    webhook_url = ${appUrl},
                    whatsapp_webhook_url = ${appUrl + '/api/webhooks/whatsapp'},
                    n8n_webhook_url = ${n8nUrl + '/webhook/flexbox-gateway'},
                    microsoft_redirect_uri = ${appUrl + '/api/auth/microsoft/callback'}
                WHERE id = ${shopSettings.id}
            `;
            console.log("   ✅ DB → Réglages URLs mis à jour sur Supabase");

            const tgBotToken = decryptSecret(shopSettings.telegram_bot_token);
            if (tgBotToken) {
                const tgWebhookUrl = `${appUrl}/api/telegram/webhook`;
                const tgRes = await fetchJson(
                    `https://api.telegram.org/bot${tgBotToken}/setWebhook?url=${tgWebhookUrl}&secret_token=${TELEGRAM_SECRET}`
                );
                console.log(`   ${tgRes.ok ? '✅' : '❌'} Telegram webhook → ${tgWebhookUrl}`);
            }
        }
    } catch (e) {
        console.log(`   ⚠️  DB inaccessible (Supabase DNS?), skip sync DB: ${e.message}`);
    } finally {
        await sql.end();
    }

    // 2. Sync WAHA (WhatsApp)
    const wahaOk = await syncWaha();

    // 3. Notification Telegram de démarrage
    if (shopSettings?.telegram_bot_token) {
        const now = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Algiers' });
        const wahaStatus = wahaOk ? '✅ WhatsApp connecté' : '⚠️ WhatsApp déconnecté';
        const telegramChatId = shopSettings.telegram_chat_id_admin || shopSettings.telegram_chat_id;

        if (telegramChatId) {
            const msg = [
                `🚀 <b>ROBOTECH — Serveur démarré</b>`,
                ``,
                `📅 <b>Date :</b> ${now}`,
                ``,
                `🌍 <b>Lien Admin :</b>`,
                `<code>${appUrl}/admin</code>`,
                ``,
                `📱 <b>WhatsApp :</b> ${wahaStatus}`,
                `⚙️ <b>n8n :</b> ${n8nUrl}`,
                ``,
                `<i>Système hybride (Cloud + Local) actif.</i>`
            ].join('\n');
            await sendTelegram(shopSettings.telegram_bot_token, telegramChatId, msg);
        }
    }

    // Résumé
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  ✅ SYSTÈME PRÊT");
    console.log(`  🌍 App         : ${appUrl}`);
    console.log(`  🔗 Admin       : ${appUrl}/admin`);
    console.log(`  📱 WA Bot      : http://localhost:3001  (Waha dashboard)`);
    console.log(`  🤖 n8n API     : http://localhost:${N8N_PORT}  (local)`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ─── Arrêt propre ─────────────────────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log("\n🛑 Arrêt de tous les services...");
    [nextProcess, mainTunnel].forEach(p => { try { p?.kill(); } catch (e) { } });
    process.exit(0);
});

process.on('exit', () => {
    [nextProcess, mainTunnel].forEach(p => { try { p?.kill(); } catch (e) { } });
});
