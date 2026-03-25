'use strict';

/**
 * ROBOTECH PRINT SERVICE v3.0
 * ─────────────────────────────────────────────────────────────────────
 * Service d'impression ESC/POS — 127.0.0.1 uniquement
 *
 * Architecture :
 *   - Poll l'API Next.js /api/print-queue toutes les POLL_INTERVAL_MS
 *   - Génère les bytes ESC/POS via ticket.js
 *   - Envoie au port Windows (USB001, etc.)
 *   - Ack l'API pour marquer le job comme imprimé
 *   - File d'attente : si le PC est éteint, print_status reste
 *     'print_pending' en DB et s'imprime au redémarrage du service
 * ─────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { generateTicket } = require('./ticket');

// ─── Config ───────────────────────────────────────────────────────────────────
function loadConfig() {
    const baseDir = process.pkg
        ? path.dirname(process.execPath)
        : __dirname;
    const cfgPath = path.join(baseDir, 'config.json');
    try {
        return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
        console.error(`[CONFIG] Impossible de lire config.json : ${e.message}`);
        console.error(`[CONFIG] Attendu à : ${cfgPath}`);
        process.exit(1);
    }
}

const cfg = loadConfig();
const PORT = cfg.port || 6543;
const HOST = '127.0.0.1';
const PRINT_SECRET = cfg.secret || 'robotech-print-secret-change-moi';
const PRINTER_IP = cfg.printerIp || null;
const PRINTER_TCP = cfg.printerPort || 9100;
const SERVER_URL = (cfg.serverUrl || 'http://localhost:1556').replace(/\/$/, '');
const POLL_MS = cfg.pollIntervalMs || 5000;
const LOG_FILE = path.join(path.dirname(process.execPath || __dirname), 'print.log');
const LOG_MAX = 512 * 1024;

// ─── Express (health + manual reprint) ───────────────────────────────────────
const app = express();
app.use(express.json({ limit: '512kb' }));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-print-secret');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

app.use((req, res, next) => {
    const ip = req.socket.remoteAddress;
    const ok = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!ok) { log(`REJECT IP: ${ip}`); return res.status(403).end(); }
    next();
});

function checkSecret(req, res, next) {
    const provided = String(req.headers['x-print-secret'] || '');
    let ok = false;
    try {
        const a = Buffer.alloc(128, 0); Buffer.from(provided).copy(a);
        const b = Buffer.alloc(128, 0); Buffer.from(PRINT_SECRET).copy(b);
        ok = crypto.timingSafeEqual(a, b) && provided === PRINT_SECRET;
    } catch { ok = false; }
    if (!ok) { log('REJECT: secret invalide'); return res.status(401).json({ error: 'Unauthorized' }); }
    next();
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok', printer: PRINTER_PORT, server: SERVER_URL, time: new Date().toISOString() });
});

// Endpoint de reprint manuel (force l'impression d'un job fourni directement)
app.post('/print', checkSecret, async (req, res) => {
    const data = req.body;
    if (!data?.orderNumber || !Array.isArray(data?.items)) {
        return res.status(400).json({ error: 'orderNumber et items requis' });
    }
    log(`PRINT DIRECT #${data.orderNumber} — ${data.items.length} article(s)`);
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

// ─── Poll loop ────────────────────────────────────────────────────────────────

let polling = false;

async function pollAndPrint() {
    if (polling) return;
    polling = true;
    try {
        const jobs = await fetchPendingJobs();
        for (const job of jobs) {
            await processJob(job);
        }
    } catch (err) {
        log(`[POLL] Erreur: ${err.message}`);
    } finally {
        polling = false;
    }
}

async function fetchPendingJobs() {
    const url = `${SERVER_URL}/api/print-queue`;
    const res = await fetchWithTimeout(url, {
        headers: { 'x-print-secret': PRINT_SECRET }
    }, 8000);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${text.slice(0, 100)}`);
    }
    const body = await res.json();
    return Array.isArray(body.jobs) ? body.jobs : [];
}

async function processJob(job) {
    const id = job._orderId;
    log(`PRINT #${job.orderNumber} (orderId=${id})`);
    try {
        const buffer = generateTicket(job);
        await sendToPrinter(buffer);
        await ackJob(id, 'printed');
        log(`OK    #${job.orderNumber}`);
    } catch (err) {
        // Ne pas marquer 'failed' — laisser en print_pending pour réessayer au prochain poll
        log(`ERR   #${job.orderNumber}: ${err.message} — réessai dans ${POLL_MS}ms`);
    }
}

async function ackJob(orderId, status) {
    const url = `${SERVER_URL}/api/print-queue`;
    await fetchWithTimeout(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'x-print-secret': PRINT_SECRET
        },
        body: JSON.stringify({ orderId, status })
    }, 5000);
}

function fetchWithTimeout(url, options, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms) — ${url}`)), timeoutMs);
        // Use built-in fetch (Node 18+) or fallback to http module
        const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
        fetchFn(url, options)
            .then(r => { clearTimeout(timer); resolve(r); })
            .catch(e => { clearTimeout(timer); reject(e); });
    });
}

// ─── Impression LAN TCP (port 9100 raw) ──────────────────────────────────────

const net = require('net');

function sendToPrinter(buffer) {
    return new Promise((resolve, reject) => {
        // Mode 1 : TCP/LAN
        if (PRINTER_IP && PRINTER_IP.includes('.')) {
            log(`MODE TCP: ${PRINTER_IP}:${PRINTER_TCP}`);
            const sock = net.createConnection(PRINTER_TCP, PRINTER_IP);
            sock.setTimeout(8000);
            sock.once('connect', () => {
                sock.write(buffer, (err) => {
                    if (err) { sock.destroy(); return reject(err); }
                    sock.end();
                    resolve();
                });
            });
            sock.once('timeout', () => { sock.destroy(); reject(new Error(`Timeout TCP ${PRINTER_IP}:${PRINTER_TCP}`)); });
            sock.once('error', (err) => reject(new Error(`TCP ${PRINTER_IP}:${PRINTER_TCP} — ${err.message}`)));
            return;
        }

        // Mode 2 : Local Port (USB001, COM1, LPT1, etc.)
        const port = String(cfg.printerPort || '');
        if (port.toUpperCase().startsWith('USB') || port.toUpperCase().startsWith('COM') || port.toUpperCase().startsWith('LPT')) {
            log(`MODE LOCAL PORT: ${port}`);
            const tmp = path.join(os.tmpdir(), `rbt_print_${Date.now()}.bin`);
            try {
                fs.writeFileSync(tmp, buffer);
                const { execSync: ex } = require('child_process');
                // Commande Windows standard pour envoyer du binaire brut à un port
                ex(`copy /b "${tmp}" ${port}:`, { shell: 'cmd.exe', stdio: 'ignore' });
                resolve();
            } catch (err) {
                reject(new Error(`Local Port ${port} — ${err.message}`));
            } finally {
                try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { }
            }
            return;
        }

        reject(new Error('Aucune imprimante valide configurée (besoin de printerIp pour LAN ou printerPort pour USB/COM)'));
    });
}

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line);
    try {
        if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX) {
            fs.renameSync(LOG_FILE, LOG_FILE + '.old');
        }
        fs.appendFileSync(LOG_FILE, line, 'utf8');
    } catch { }
}

// ─── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
    log('═'.repeat(60));
    log('  ROBOTECH PRINT SERVICE v3.0');
    log(`  URL     : http://${HOST}:${PORT}`);
    log(`  Server  : ${SERVER_URL}`);
    log(`  Printer : ${PRINTER_IP}:${PRINTER_TCP} (TCP/LAN)`);
    log(`  Poll    : toutes les ${POLL_MS}ms`);
    log('═'.repeat(60));

    // Poll immédiatement au démarrage (traite les jobs en attente)
    setTimeout(pollAndPrint, 2000);
    setInterval(pollAndPrint, POLL_MS);

    log('  Prêt — en attente de tickets à imprimer.');
});

process.on('SIGINT', () => { log('Arrêt (SIGINT)'); process.exit(0); });
process.on('SIGTERM', () => { log('Arrêt (SIGTERM)'); process.exit(0); });
