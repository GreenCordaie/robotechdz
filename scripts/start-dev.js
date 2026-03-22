const { spawn, execSync } = require('child_process');
const fs = require('fs');
const postgres = require('postgres');
const path = require('path');

/**
 * ROBOTECH ORCHESTRATOR v6.0
 * Démarrage 1-click : Next.js + Cloudflare + Sync DB/Waha/Telegram
 *
 * Nouveautés v6 :
 *  - Notification Telegram avec le nouveau lien Cloudflare à chaque démarrage
 *  - Waha : attend le statut WORKING après reconfiguration (robuste)
 *  - Waha : vérifie le webhook host.docker.internal (fixe, ne dépend pas de Cloudflare)
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
    let content = fs.readFileSync(envPath, 'utf-8');
    const regex = new RegExp(`^${key}=.*`, 'm');
    content = content.match(regex)
        ? content.replace(regex, `${key}="${value}"`)
        : content + `\n${key}="${value}"`;
    fs.writeFileSync(envPath, content, 'utf-8');
    console.log(`   📝 .env → ${key}=${value}`);
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
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
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
            if (targetStatuses.includes(r.data.status)) return r.data;
        } catch (e) { }
        process.stdout.write('.');
        await sleep(3000);
    }
    return null;
}

// ─── Waha : sync session + webhook ───────────────────────────────────────────
async function syncWaha() {
    // Le webhook utilise host.docker.internal — fixe, ne dépend pas de Cloudflare
    const wahaWebhookUrl = `http://host.docker.internal:${APP_PORT}/api/webhooks/whatsapp`;

    try {
        // 1. Attendre que Waha soit accessible (endpoint /api/sessions)
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

        // 2. Vérifier le statut initial
        const { data: session } = await fetchJson(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
            headers: { 'X-Api-Key': WAHA_API_KEY }
        });

        if (session.status === 'STOPPED' || session.status === 'FAILED' || !session.status) {
            await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}/start`, {
                method: 'POST',
                headers: { 'X-Api-Key': WAHA_API_KEY, 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(8000)
            });
            console.log("   🔄 Waha : session démarrée");
        }

        // 3. Configurer le webhook (PUT cause un redémarrage de la session)
        await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
            method: 'PUT',
            headers: { 'X-Api-Key': WAHA_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config: {
                    webhooks: [{
                        url: wahaWebhookUrl,
                        events: ['message'],
                        customHeaders: [{ name: 'x-api-key', value: WAHA_API_KEY }],
                        retries: { delaySeconds: 2, attempts: 3 }
                    }]
                }
            }),
            signal: AbortSignal.timeout(8000)
        });

        console.log(`   🔄 Waha webhook → ${wahaWebhookUrl}`);
        console.log(`   ⏳ Attente reconnexion Waha`);

        // 4. Attendre que Waha revienne WORKING (le PUT provoque un redémarrage)
        const finalStatus = await waitWahaStatus(['WORKING', 'SCAN_QR_CODE'], 90000);
        console.log('');

        if (!finalStatus) {
            console.log("   ⚠️  Waha : timeout après reconfiguration");
            return false;
        }

        if (finalStatus.status === 'WORKING') {
            console.log(`   ✅ Waha WORKING : ${finalStatus.me?.id || 'connecté'}`);
            return true;
        }

        if (finalStatus.status === 'SCAN_QR_CODE') {
            // Sauvegarder le QR sur le bureau
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

    } catch (e) {
        console.log(`   ⚠️  Waha erreur : ${e.message}`);
        return false;
    }
}

// ─── Lancement des processus ──────────────────────────────────────────────────
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  🤖 ROBOTECH ORCHESTRATOR v6.0 - Démarrage...");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// 0. Docker
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

// 1. Print Service local (127.0.0.1:6543)
const printServicePath = path.join(__dirname, '..', 'print-service', 'server.js');
let printProcess = null;
if (fs.existsSync(printServicePath)) {
    console.log(`\n🖨️  [1/5] Print Service local (port 6543)...`);
    printProcess = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..', 'print-service'),
        stdio: 'pipe',
        shell: false
    });
    printProcess.stdout.on('data', d => process.stdout.write(`[Print] ${d}`));
    printProcess.stderr.on('data', d => process.stdout.write(`[Print] ${d}`));
    printProcess.on('exit', code => {
        if (code !== 0) console.warn(`⚠️  Print Service arrêté (code ${code})`);
    });
} else {
    console.log(`\n⚠️  [1/5] print-service/server.js introuvable, impression navigateur utilisée`);
}

// 2. Next.js
console.log(`\n🚀 [2/5] Next.js dev sur le port ${APP_PORT}...`);
const nextProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true
});

// 3. Tunnel App
console.log(`🌐 [3/5] Tunnel Cloudflare → localhost:${APP_PORT}...`);
const appTunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${APP_PORT}`], {
    shell: true
});

// 4. Tunnel n8n
console.log(`🌐 [4/5] Tunnel Cloudflare → n8n:${N8N_PORT}...`);
const n8nTunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${N8N_PORT}`], {
    shell: true
});

// ─── Détection des URLs ───────────────────────────────────────────────────────
let appUrl = null;
let n8nUrl = null;
let synced = false;

function extractCloudflareUrl(text) {
    const m = text.match(/https:\/\/[a-zA-Z0-9\-]+\.trycloudflare\.com/);
    return m ? m[0] : null;
}

appTunnel.stderr.on('data', async (d) => {
    const text = d.toString();
    if (text.toLowerCase().includes('err') && !text.includes('ERR Visit')) {
        process.stdout.write(`[AppTunnel] ${text}`);
    }
    const url = extractCloudflareUrl(text);
    if (url && !appUrl) {
        appUrl = url;
        console.log(`\n✅ APP URL détectée : ${appUrl}`);
        updateEnv('NEXT_PUBLIC_APP_URL', appUrl);
        await syncAll();
    }
});

n8nTunnel.stderr.on('data', async (d) => {
    const url = extractCloudflareUrl(d.toString());
    if (url && !n8nUrl) {
        n8nUrl = url;
        console.log(`✅ n8n URL détectée  : ${n8nUrl}`);
    }
});

// ─── Sync tout ───────────────────────────────────────────────────────────────
async function syncAll() {
    if (!appUrl || synced) return;
    synced = true;

    console.log("\n🔄 [4/4] Synchronisation de toutes les configurations...");
    const sql = postgres(DATABASE_URL);

    try {
        const rows = await sql`SELECT * FROM shop_settings LIMIT 1`;
        if (!rows.length) { console.error("❌ Pas de shop_settings en DB"); return; }
        const s = rows[0];

        // 1. DB
        await sql`
            UPDATE shop_settings SET
                webhook_url = ${appUrl},
                whatsapp_webhook_url = ${appUrl + '/api/webhooks/whatsapp'}
            WHERE id = ${s.id}
        `;
        console.log("   ✅ DB → webhook_url + whatsapp_webhook_url mis à jour");

        // 2. Telegram webhook (bot reçoit les commandes)
        if (s.telegram_bot_token) {
            const tgWebhookUrl = `${appUrl}/api/telegram/webhook`;
            const res = await fetch(
                `https://api.telegram.org/bot${s.telegram_bot_token}/setWebhook?url=${tgWebhookUrl}&secret_token=${TELEGRAM_SECRET}`
            );
            const data = await res.json();
            console.log(`   ${data.ok ? '✅' : '❌'} Telegram webhook → ${tgWebhookUrl}`);
        }

        // 3. Waha
        const wahaOk = await syncWaha();

        // 4. Notification Telegram avec le nouveau lien
        const now = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Algiers' });
        const wahaStatus = wahaOk ? '✅ WhatsApp connecté' : '⚠️ WhatsApp déconnecté';
        const telegramChatId = s.telegram_chat_id_admin || s.telegram_chat_id;

        if (s.telegram_bot_token && telegramChatId) {
            const msg = [
                `🚀 <b>ROBOTECH — Serveur démarré</b>`,
                ``,
                `📅 <b>Date :</b> ${now}`,
                ``,
                `🌍 <b>Lien Admin :</b>`,
                `<code>${appUrl}/admin</code>`,
                ``,
                `📱 <b>WhatsApp :</b> ${wahaStatus}`,
                n8nUrl ? `⚙️ <b>n8n :</b> ${n8nUrl}` : '',
                ``,
                `<i>Ce lien est valide jusqu'au prochain redémarrage.</i>`
            ].filter(Boolean).join('\n');

            console.log(`\n📨 Envoi notification Telegram...`);
            await sendTelegram(s.telegram_bot_token, telegramChatId, msg);
        } else {
            console.log(`   ℹ️  Pas de chat_id admin Telegram configuré, notification skippée`);
        }

        // 5. Résumé final
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("  ✅ SYSTÈME PRÊT");
        console.log(`  🌍 App         : ${appUrl}`);
        console.log(`  🔗 Admin       : ${appUrl}/admin`);
        console.log(`  🖨️  Print       : http://127.0.0.1:6543  (local)`);
        console.log(`  📱 WA Bot      : http://localhost:3001  (Waha dashboard)`);
        if (n8nUrl) console.log(`  ⚙️  n8n UI      : ${n8nUrl}`);
        console.log(`  🤖 n8n API     : http://localhost:${N8N_PORT}  (local)`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    } catch (e) {
        console.error("❌ Erreur sync:", e.message);
    } finally {
        await sql.end();
    }
}

// ─── Arrêt propre ─────────────────────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log("\n🛑 Arrêt de tous les services...");
    [printProcess, nextProcess, appTunnel, n8nTunnel].forEach(p => { try { p?.kill(); } catch (e) { } });
    process.exit(0);
});

process.on('exit', () => {
    [printProcess, nextProcess, appTunnel, n8nTunnel].forEach(p => { try { p?.kill(); } catch (e) { } });
});
