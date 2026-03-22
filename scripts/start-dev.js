const { spawn, execSync } = require('child_process');
const fs = require('fs');
const postgres = require('postgres');
const path = require('path');

/**
 * ROBOTECH ORCHESTRATOR v5.0
 * Un seul click : Next.js + Cloudflare Tunnel + Sync automatique de toutes les URLs
 *
 * À chaque démarrage, capture la nouvelle URL Cloudflare et met à jour :
 *  - .env (NEXT_PUBLIC_APP_URL)
 *  - DB shop_settings (webhook_url, whatsapp_webhook_url)
 *  - Waha webhook (host.docker.internal, avec x-api-key header)
 *  - Telegram webhook
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

// ─── Lancement des processus ──────────────────────────────────────────────────
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  🤖 ROBOTECH ORCHESTRATOR v5.0 - Démarrage...");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// 0. Docker services (Waha, n8n, DB, Redis, Mongo)
console.log(`\n🐳 [0/3] Démarrage des services Docker...`);
try {
    execSync('docker compose up -d', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        shell: true
    });
    console.log(`   ✅ Docker services démarrés`);
} catch (e) {
    console.log(`   ⚠️  Docker non disponible ou erreur : ${e.message?.slice(0, 80)}`);
    console.log(`   ℹ️  Continuer sans Docker...`);
}

// A. Next.js
console.log(`\n🚀 [1/3] Next.js dev sur le port ${APP_PORT}...`);
const nextProcess = spawn(npmCmd, ['run', 'dev'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true
});

// B. Tunnel Cloudflare → App Next.js
console.log(`🌐 [2/3] Tunnel Cloudflare → localhost:${APP_PORT}...`);
const appTunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${APP_PORT}`], {
    shell: true
});

// C. Tunnel Cloudflare → n8n
console.log(`🌐 [3/3] Tunnel Cloudflare → n8n:${N8N_PORT}...`);
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

// ─── Sync Waha : session + webhook config ────────────────────────────────────
async function syncWaha() {
    // Webhook local fixe (host.docker.internal ne change jamais)
    const wahaWebhookUrl = `http://host.docker.internal:${APP_PORT}/api/webhooks/whatsapp`;

    try {
        // Attendre que Waha soit prêt
        let wahaReady = false;
        for (let i = 0; i < 15; i++) {
            try {
                const r = await fetch(`${WAHA_URL}/api/health`, { headers: { 'X-Api-Key': WAHA_API_KEY } });
                if (r.ok) { wahaReady = true; break; }
            } catch (e) { }
            if (i === 0) process.stdout.write('   ⏳ Attente Waha');
            process.stdout.write('.');
            await new Promise(r => setTimeout(r, 2000));
        }
        if (!wahaReady) process.stdout.write('\n');

        if (!wahaReady) {
            console.log("   ⚠️  Waha inaccessible, skip sync");
            return;
        }

        // Vérifier le statut de la session
        const sessionRes = await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
            headers: { 'X-Api-Key': WAHA_API_KEY }
        });
        const session = await sessionRes.json().catch(() => ({}));
        const status = session.status;

        if (status === 'STOPPED' || status === 'FAILED' || !status) {
            // Démarrer la session si nécessaire
            await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}/start`, {
                method: 'POST',
                headers: { 'X-Api-Key': WAHA_API_KEY, 'Content-Type': 'application/json' }
            });
            console.log("   🔄 Waha : session démarrée");
        }

        // Configurer le webhook avec x-api-key header (persisté dans le volume)
        const putRes = await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
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
            })
        });

        if (putRes.ok) {
            console.log(`   ✅ Waha webhook → ${wahaWebhookUrl} (x-api-key: ${WAHA_API_KEY})`);
        } else {
            const err = await putRes.json().catch(() => ({}));
            console.log(`   ⚠️  Waha webhook (${putRes.status}): ${JSON.stringify(err).slice(0, 100)}`);
        }

        // Vérifier si connecté (WORKING) ou besoin de scanner le QR
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
            headers: { 'X-Api-Key': WAHA_API_KEY }
        });
        const statusData = await statusRes.json().catch(() => ({}));

        if (statusData.status === 'WORKING') {
            console.log(`   ✅ Waha connecté : ${statusData.me?.id || 'OK'}`);
        } else if (statusData.status === 'SCAN_QR_CODE') {
            // Sauvegarder le QR sur le bureau
            try {
                const qrRes = await fetch(`${WAHA_URL}/api/screenshot?session=${WAHA_SESSION}`, {
                    headers: { 'X-Api-Key': WAHA_API_KEY }
                });
                const buf = await qrRes.arrayBuffer();
                const desktopPath = isWindows
                    ? `${process.env.USERPROFILE}\\Desktop\\waha-qr.png`
                    : `${process.env.HOME}/Desktop/waha-qr.png`;
                fs.writeFileSync(desktopPath, Buffer.from(buf));
                console.log(`   📱 QR Code sauvegardé : ${desktopPath}`);
                console.log(`   ⚠️  Scanne le QR avec WhatsApp pour reconnecter !`);
            } catch (e) {
                console.log(`   ⚠️  Waha : scan QR requis → ouvre http://localhost:3001`);
            }
        } else {
            console.log(`   ℹ️  Waha status : ${statusData.status}`);
        }

    } catch (e) {
        console.log(`   ⚠️  Waha sync erreur : ${e.message}`);
    }
}

// ─── Synchronisation de toutes les configs ───────────────────────────────────
async function syncAll() {
    if (!appUrl || synced) return;
    synced = true;

    console.log("\n🔄 Synchronisation de toutes les configurations...");
    const sql = postgres(DATABASE_URL);

    try {
        const rows = await sql`SELECT * FROM shop_settings LIMIT 1`;
        if (!rows.length) { console.error("❌ Pas de shop_settings en DB"); return; }
        const s = rows[0];

        // 1. DB ───────────────────────────────────────────────────────────────
        await sql`
            UPDATE shop_settings SET
                webhook_url = ${appUrl},
                whatsapp_webhook_url = ${appUrl + '/api/webhooks/whatsapp'}
            WHERE id = ${s.id}
        `;
        console.log("   ✅ DB → webhook_url + whatsapp_webhook_url mis à jour");

        // 2. Telegram ─────────────────────────────────────────────────────────
        if (s.telegram_bot_token) {
            const tgUrl = `${appUrl}/api/telegram/webhook`;
            const res = await fetch(
                `https://api.telegram.org/bot${s.telegram_bot_token}/setWebhook?url=${tgUrl}&secret_token=${TELEGRAM_SECRET}`
            );
            const data = await res.json();
            console.log(`   ${data.ok ? '✅' : '❌'} Telegram webhook → ${tgUrl}`);
        }

        // 3. Waha ─────────────────────────────────────────────────────────────
        await syncWaha();

        // 4. Résumé ──────────────────────────────────────────────────────────
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("  ✅ SYSTÈME PRÊT");
        console.log(`  🌍 App         : ${appUrl}`);
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
    [nextProcess, appTunnel, n8nTunnel].forEach(p => { try { p.kill(); } catch (e) { } });
    process.exit(0);
});

process.on('exit', () => {
    [nextProcess, appTunnel, n8nTunnel].forEach(p => { try { p.kill(); } catch (e) { } });
});
