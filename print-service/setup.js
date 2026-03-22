'use strict';
/**
 * ROBOTECH PRINT SETUP
 * Détecte les imprimantes Windows et met à jour config.json automatiquement.
 * Lance avec : node setup.js
 */
const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');
const readline     = require('readline');

const CFG_PATH = path.join(__dirname, 'config.json');

function getPrinters() {
    try {
        const out = execSync(
            'wmic printer get Name,PortName,Default /format:csv',
            { shell: 'cmd.exe', encoding: 'utf8' }
        );
        const lines = out.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));
        return lines.map(line => {
            const parts = line.split(',');
            return {
                default: parts[1]?.trim() === 'TRUE',
                name:    parts[3]?.trim() || '',
                port:    parts[2]?.trim() || '',
            };
        }).filter(p => p.name);
    } catch (e) {
        console.error('Impossible de lister les imprimantes :', e.message);
        return [];
    }
}

async function main() {
    console.log('\n══════════════════════════════════════════════');
    console.log('  ROBOTECH PRINT SERVICE — Configuration');
    console.log('══════════════════════════════════════════════\n');

    const printers = getPrinters();
    if (!printers.length) {
        console.log('❌ Aucune imprimante trouvée dans Windows.\n');
        console.log('→ Installez le driver Xprinter XP-80C puis relancez setup.js\n');
        process.exit(1);
    }

    console.log('Imprimantes détectées :\n');
    printers.forEach((p, i) => {
        const def = p.default ? ' [PAR DÉFAUT]' : '';
        console.log(`  ${i + 1}. ${p.name}${def}`);
        console.log(`     Port : ${p.port}`);
    });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = q => new Promise(r => rl.question(q, r));

    const choice = await ask('\nNuméro de l\'imprimante à utiliser (ex: 1) : ');
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= printers.length) {
        console.log('Choix invalide.'); rl.close(); process.exit(1);
    }

    const selected = printers[idx];
    console.log(`\n✅ Sélectionné : ${selected.name} (Port: ${selected.port})\n`);

    // Lire config existante et mettre à jour
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch {}

    const secret = await ask('Secret partagé (Entrée = garder actuel) : ');
    if (secret.trim()) cfg.secret = secret.trim();

    cfg.printerPort = selected.port;
    cfg.printerName = selected.name;

    fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    console.log('\n✅ config.json mis à jour :');
    console.log(JSON.stringify(cfg, null, 2));

    // Test d'impression
    const test = await ask('\nEnvoyer un ticket de test ? (o/N) : ');
    if (test.trim().toLowerCase() === 'o') {
        const { generateTicket } = require('./ticket');
        const { execSync: ex } = require('child_process');
        const os   = require('os');
        const buf  = generateTicket({
            orderNumber: 'TEST',
            date: new Date().toLocaleDateString('fr-FR'),
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            customer: { name: 'Test Client', phone: '0555000000' },
            items: [{
                productName: 'Netflix Premium',
                credentials: [
                    { label: 'Email',  value: 'test@email.com' },
                    { label: 'Pass',   value: 'MotDePasse123' },
                    { label: 'Profil', value: '1' },
                    { label: 'Code',   value: '5678' },
                ]
            }],
            trackingUrl: `https://robotechdz.com/suivi/TEST`
        });

        const tmp = path.join(os.tmpdir(), 'rbt_test.bin');
        fs.writeFileSync(tmp, buf);
        try {
            ex(`copy /b "${tmp}" ${selected.port}:`, { shell: 'cmd.exe' });
            console.log('\n✅ Ticket de test envoyé !');
        } catch (e) {
            console.log('\n❌ Erreur test :', e.message);
            console.log('→ Vérifiez que l\'imprimante est allumée et connectée.');
        }
        try { fs.unlinkSync(tmp); } catch {}
    }

    console.log('\n══════════════════════════════════════════════');
    console.log('  Configuration terminée !');
    console.log('  Lance : node server.js  (ou RobotechPrint.exe)');
    console.log('══════════════════════════════════════════════\n');
    rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
