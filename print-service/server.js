'use strict';

/**
 * ROBOTECH PRINT SERVICE v2.0
 * ─────────────────────────────────────────────────────────────────────
 * Serveur HTTP local d'impression ESC/POS — 127.0.0.1 uniquement
 * Approche Windows pure JS (sans bindings natifs) — compatible pkg .exe
 *
 * Méthode : génère les bytes ESC/POS → temp .bin → copy /b → port printer
 * Compatible : Xprinter XP-80C, toute imprimante avec port Windows (USB001, etc.)
 * ─────────────────────────────────────────────────────────────────────
 */

const express        = require('express');
const crypto         = require('crypto');
const fs             = require('fs');
const path           = require('path');
const os             = require('os');
const { execSync }   = require('child_process');
const { generateTicket } = require('./ticket');

// ─── Config (lue depuis config.json au même niveau que l'exe) ─────────────────
function loadConfig() {
    // Cherche config.json à côté de l'exe (pkg) ou du script (node)
    const baseDir = process.pkg
        ? path.dirname(process.execPath)   // Mode exe packagé
        : __dirname;                        // Mode node script

    const cfgPath = path.join(baseDir, 'config.json');
    try {
        return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
        console.error(`[CONFIG] Impossible de lire config.json : ${e.message}`);
        console.error(`[CONFIG] Attendu à : ${cfgPath}`);
        process.exit(1);
    }
}

const cfg          = loadConfig();
const PORT         = cfg.port         || 6543;
const HOST         = '127.0.0.1';                    // JAMAIS 0.0.0.0
const PRINT_SECRET = cfg.secret       || 'change-moi';
const PRINTER_PORT = cfg.printerPort  || 'USB001';   // Port Windows printer
const LOG_FILE     = path.join(path.dirname(process.execPath || __dirname), 'print.log');
const LOG_MAX      = 512 * 1024; // Rotation à 512 Ko

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '512kb' }));

// Sécurité 1 : Localhost uniquement
app.use((req, res, next) => {
    const ip = req.socket.remoteAddress;
    const ok = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!ok) { log(`REJECT IP: ${ip}`); return res.status(403).end(); }
    next();
});

// Sécurité 2 : Header secret (timing-safe)
function checkSecret(req, res, next) {
    const provided = String(req.headers['x-print-secret'] || '');
    const expected = PRINT_SECRET;
    let ok = false;
    try {
        const a = Buffer.alloc(128, 0); Buffer.from(provided).copy(a);
        const b = Buffer.alloc(128, 0); Buffer.from(expected).copy(b);
        ok = crypto.timingSafeEqual(a, b) && provided === expected;
    } catch { ok = false; }
    if (!ok) { log('REJECT: secret invalide'); return res.status(401).json({ error: 'Unauthorized' }); }
    next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
    res.json({ status: 'ok', printer: PRINTER_PORT, time: new Date().toISOString() });
});

app.post('/print', checkSecret, async (req, res) => {
    const data = req.body;
    if (!data?.orderNumber || !Array.isArray(data?.items)) {
        return res.status(400).json({ error: 'orderNumber et items requis' });
    }
    log(`PRINT #${data.orderNumber} — ${data.items.length} article(s)`);
    try {
        const buffer = generateTicket(data);
        await sendToPrinter(buffer);
        log(`OK    #${data.orderNumber}`);
        res.json({ success: true });
    } catch (err) {
        log(`ERR   #${data.orderNumber}: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Impression Windows (pure JS, zéro natif) ─────────────────────────────────

/**
 * Envoie un buffer ESC/POS au port Windows de l'imprimante.
 *
 * Stratégie (essaie dans l'ordre) :
 * 1. Écriture directe sur le port device  \\.\USB001
 * 2. Commande copy /b via cmd.exe (fallback universel)
 */
function sendToPrinter(buffer) {
    return new Promise((resolve, reject) => {
        // Chemin device Windows : \\.\USB001
        const devicePath = PRINTER_PORT.startsWith('\\\\.\\')
            ? PRINTER_PORT
            : `\\\\.\\${PRINTER_PORT}`;

        // Stratégie 1 : écriture directe (le plus rapide)
        try {
            fs.writeFileSync(devicePath, buffer);
            return resolve();
        } catch (e1) {
            log(`Direct write failed (${e1.message}), trying copy /b...`);
        }

        // Stratégie 2 : copy /b via un fichier temporaire
        const tmpFile = path.join(os.tmpdir(), `rbt_${Date.now()}.bin`);
        try {
            fs.writeFileSync(tmpFile, buffer);
            // copy /b "fichier.bin" PORT: → envoie bytes bruts au port printer Windows
            execSync(`copy /b "${tmpFile}" ${PRINTER_PORT}:`, { shell: 'cmd.exe', timeout: 8000 });
            return resolve();
        } catch (e2) {
            reject(new Error(`Impossible d'imprimer sur le port ${PRINTER_PORT}. Vérifiez config.json. (${e2.message})`));
        } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
        }
    });
}

// ─── Logging avec rotation ────────────────────────────────────────────────────
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line);
    try {
        if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX) {
            fs.renameSync(LOG_FILE, LOG_FILE + '.old');
        }
        fs.appendFileSync(LOG_FILE, line, 'utf8');
    } catch {}
}

// ─── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
    log('═'.repeat(52));
    log('  ROBOTECH PRINT SERVICE v2.0');
    log(`  URL     : http://${HOST}:${PORT}`);
    log(`  Port    : ${PRINTER_PORT}`);
    log(`  Log     : ${LOG_FILE}`);
    log('═'.repeat(52));
    log('  Prêt pour imprimer.');
});

process.on('SIGINT',  () => { log('Arrêt (SIGINT)');  process.exit(0); });
process.on('SIGTERM', () => { log('Arrêt (SIGTERM)'); process.exit(0); });
