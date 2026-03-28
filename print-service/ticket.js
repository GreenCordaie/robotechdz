'use strict';

/**
 * Générateur de ticket ESC/POS pur — Xprinter XP-80C 80mm
 * 48 colonnes en mode caractère standard
 *
 * MASTER DE CONFIGURATION : data.shop (vient de ReceiptSettings dans l'app)
 *   data.shop.name         → Nom commercial affiché en header
 *   data.shop.address      → Adresse (optionnel)
 *   data.shop.tel          → Téléphone (optionnel)
 *   data.shop.footerMessage → Message de pied de page
 *   data.shop.showDateTime → Afficher date/heure
 *   data.shop.showCashier  → Afficher caissier
 */

const COLS = 48;
const SEP = '-'.repeat(COLS);

// ─── Commandes ESC/POS ────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
    INIT: Buffer.from([ESC, 0x40]),
    KANJI_OFF: Buffer.from([0x1c, 0x2e]),          // Désactiver le mode Kanji (fini le chinois)
    CODE_TABLE_PC850: Buffer.from([0x1b, 0x74, 0x02]), // Sélectionner la table de caractères PC850
    ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
    ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
    ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
    BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
    BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
    SIZE_NORMAL: Buffer.from([ESC, 0x21, 0x00]),
    SIZE_2HW: Buffer.from([ESC, 0x21, 0x30]),   // Double hauteur + largeur
    LF: Buffer.from([0x0a]),
    FEED_4: Buffer.from([ESC, 0x64, 0x04]),
    CUT_FULL: Buffer.from([GS, 0x56, 0x00]),
};

// ─── Encodage PC850 (Latino 1 étendu) pour imprimante thermique ───────────────

const MAP_PC850 = {
    'é': 0x82, 'à': 0x85, 'è': 0x8a, 'ç': 0x87, 'ù': 0x97,
    'â': 0x83, 'ê': 0x88, 'î': 0x8c, 'ô': 0x93, 'û': 0x96,
    'ë': 0x89, 'ï': 0x8b, 'ü': 0x81, '°': 0xf8, '€': 0xd5
};

/** Encode une chaîne en Buffer compatible PC850 */
function encodePC850(str) {
    if (!str) return Buffer.alloc(0);
    const buf = Buffer.alloc(str.length);
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (MAP_PC850[char]) {
            buf[i] = MAP_PC850[char];
        } else {
            const code = str.charCodeAt(i);
            // On reste en ASCII si possible, sinon '?'
            buf[i] = (code < 256) ? code : 0x3f;
        }
    }
    return buf;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function txt(str) {
    return Buffer.concat([encodePC850(str), CMD.LF]);
}

function center(str, cols = COLS) {
    const pad = Math.max(0, Math.floor((cols - str.length) / 2));
    return ' '.repeat(pad) + str;
}

function cols2(left, right, total = COLS) {
    const gap = Math.max(1, total - left.length - right.length);
    return left + ' '.repeat(gap) + right;
}

/**
 * Génère les Buffer ESC/POS pour un credential (label normal, valeur en gras).
 * Retour à la ligne + indent si valeur > 32 chars.
 */
function credentialLines(label, value) {
    const parts = [];
    const MAX = 32;
    const indent = '    ';
    const header = `  ${label.padEnd(7)}: `;

    if (value.length <= MAX) {
        parts.push(encodePC850(header));
        parts.push(CMD.BOLD_ON);
        parts.push(Buffer.concat([encodePC850(value), CMD.LF]));
        parts.push(CMD.BOLD_OFF);
    } else {
        parts.push(Buffer.concat([encodePC850(header), CMD.LF]));
        let rem = value;
        while (rem.length > 0) {
            parts.push(CMD.BOLD_ON);
            parts.push(Buffer.concat([encodePC850(indent + rem.slice(0, MAX)), CMD.LF]));
            parts.push(CMD.BOLD_OFF);
            rem = rem.slice(MAX);
        }
    }
    return parts;
}

/** QR Code natif ESC/POS (Model 2, Error M, taille 6) */
function qrCodeBuffer(url) {
    const urlBytes = Buffer.from(url, 'utf8');
    const dataLen = urlBytes.length + 3;
    const pL = dataLen % 256;
    const pH = Math.floor(dataLen / 256);
    return Buffer.concat([
        Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
        Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
        Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
        Buffer.from([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),
        urlBytes,
        Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
    ]);
}

// ─── Générateur principal ─────────────────────────────────────────────────────

/**
 * @param {object} data - PrintData envoyé par Next.js
 *   data.shop.name, data.shop.address, data.shop.tel, data.shop.footerMessage
 *   data.shop.showDateTime, data.shop.showCashier
 */
function generateTicket(data) {
    const p = [];
    const shop = data.shop || {};

    // ── INIT ─────────────────────────────────────────────────────────────────
    p.push(CMD.INIT);
    p.push(CMD.KANJI_OFF);        // Bye bye Chinois
    p.push(CMD.CODE_TABLE_PC850); // Bonjour les accents

    // ── HEADER : Nom boutique (piloté par ReceiptSettings) ───────────────────
    p.push(CMD.ALIGN_CENTER);
    p.push(CMD.SIZE_2HW);
    p.push(CMD.BOLD_ON);
    p.push(txt((shop.name || 'ROBOTECH POS').toUpperCase()));
    p.push(CMD.BOLD_OFF);
    p.push(CMD.SIZE_NORMAL);
    p.push(CMD.LF);

    if (shop.address) {
        p.push(txt(center(shop.address)));
    }
    if (shop.tel) {
        p.push(CMD.BOLD_ON);
        p.push(txt(center('TEL: ' + shop.tel)));
        p.push(CMD.BOLD_OFF);
    }
    p.push(CMD.LF);

    // ── SÉPARATEUR DOUBLE ─────────────────────────────────────────────────────
    p.push(CMD.ALIGN_LEFT);
    p.push(txt('='.repeat(COLS)));

    const orderLeft = `TICKET #${data.orderNumber}`;
    const orderRight = (shop.showDateTime !== false)
        ? `${data.date} ${data.time}`
        : data.date;
    p.push(CMD.BOLD_ON);
    p.push(txt(cols2(orderLeft, orderRight)));
    p.push(CMD.BOLD_OFF);

    if (shop.showCashier && data.cashierName) {
        p.push(txt(`Vendeur  : ${data.cashierName}`));
    }
    if (data.paymentMethod) {
        p.push(txt(`Paiement : ${data.paymentMethod}`));
    }
    p.push(txt('-'.repeat(COLS)));

    // ── CLIENT ────────────────────────────────────────────────────────────────
    if (data.customer?.name || data.customer?.phone) {
        const clientName = (data.customer.name || 'CLIENT COMPTOIR').toUpperCase();
        p.push(txt(`CLIENT   : ${clientName}`));
        if (data.customer.phone) {
            p.push(txt(`TEL      : ${data.customer.phone}`));
        }
        p.push(txt('-'.repeat(COLS)));
    }

    // ── ARTICLES ──────────────────────────────────────────────────────────────
    p.push(CMD.BOLD_ON);
    p.push(txt(cols2('DESIGNATION', 'TOTAL (DZD)')));
    p.push(CMD.BOLD_OFF);
    p.push(txt('-'.repeat(COLS)));

    const ORDER_LABELS = ['Email', 'Pass', 'Profil', 'Code'];

    data.items.forEach((item, idx) => {
        // Ligne 1 : Nom du produit
        const prodName = `${idx + 1}. ${item.productName}`.toUpperCase();
        p.push(CMD.BOLD_ON);
        p.push(txt(prodName));
        p.push(CMD.BOLD_OFF);

        // Ligne 2 : Détails prix et Total ligne
        const itemTotal = item.totalStr || (item.quantity * parseFloat(item.price)).toFixed(2);
        const detailLeft = `   ${item.quantity} x ${parseFloat(item.price).toFixed(2)}`;
        const detailRight = `${itemTotal}`;
        p.push(txt(cols2(detailLeft, detailRight)));

        // Credentials (Infos de compte, codes, etc.)
        const credMap = {};
        (item.credentials || []).forEach(c => { credMap[c.label] = c.value; });

        ORDER_LABELS.forEach(label => {
            if (credMap[label] !== undefined) {
                credentialLines(label, String(credMap[label])).forEach(b => p.push(b));
            }
        });

        (item.credentials || []).forEach(c => {
            if (!ORDER_LABELS.includes(c.label)) {
                credentialLines(c.label, String(c.value)).forEach(b => p.push(b));
            }
        });

        p.push(CMD.LF);
    });

    p.push(txt('='.repeat(COLS)));

    // ── RÉCAPITULATIF FINANCIER ──────────────────────────────────────────────
    if (data.totalAmount || data.netTotal) {
        const brut = parseFloat(data.totalAmount || 0).toFixed(2);
        const remise = parseFloat(data.remise || data.discount || 0).toFixed(2);
        const net = parseFloat(data.netTotal || data.finalTotal || brut).toFixed(2);

        p.push(txt(cols2('TOTAL BRUT', `${brut} DZD`)));
        if (parseFloat(remise) > 0) {
            p.push(CMD.BOLD_ON);
            p.push(txt(cols2('REMISE', `-${remise} DZD`)));
            p.push(CMD.BOLD_OFF);
        }

        const verse = parseFloat(data.montantPaye || data.verse || 0).toFixed(2);
        const reste = parseFloat(data.resteAPayer || 0).toFixed(2);

        const isHighlight = (parseFloat(remise) > 0 || parseFloat(reste) === 0);
        if (isHighlight) {
            p.push(CMD.LF);
            p.push(CMD.BOLD_ON);
            p.push(CMD.SIZE_2HW);
            p.push(txt(cols2('TOTAL A PAYER', `${net}`, 24))); // Largeur divisé par 2 en mode double
            p.push(CMD.SIZE_NORMAL);
            p.push(CMD.BOLD_OFF);
            p.push(CMD.LF);
        } else {
            p.push(txt(cols2('NET A PAYER', `${net} DZD`)));
        }

        // --- NOUVEAU : Détail du paiement ---
        if (parseFloat(verse) > 0) {
            p.push(CMD.BOLD_ON);
            p.push(txt(cols2('MONTANT VERSÉ', `${verse} DZD`)));
            p.push(CMD.BOLD_OFF);
        }

        if (parseFloat(reste) > 0) {
            p.push(CMD.LF);
            p.push(CMD.SIZE_2HW);
            p.push(CMD.BOLD_ON);
            p.push(txt(cols2('RESTE À PAYER', `${reste}`)));
            p.push(CMD.SIZE_NORMAL);
            p.push(CMD.BOLD_OFF);
            p.push(CMD.LF);
        } else {
            p.push(CMD.ALIGN_CENTER);
            p.push(CMD.BOLD_ON);
            p.push(txt('*** COMMANDE SOLDEE ***'));
            p.push(CMD.BOLD_OFF);
            p.push(CMD.ALIGN_LEFT);
        }

        // ── DETTE TOTALE DU CLIENT ──────────────────────────────────────────────
        if (data.totalClientDebt && parseFloat(data.totalClientDebt) > 0) {
            p.push(txt('-'.repeat(COLS)));
            p.push(CMD.BOLD_ON);
            p.push(txt(cols2('RESTE DE DETTE', `${parseFloat(data.totalClientDebt).toFixed(2)} DZD`)));
            p.push(CMD.BOLD_OFF);
        }

        p.push(txt('='.repeat(COLS)));
    }

    // ── QR CODE ───────────────────────────────────────────────────────────────
    if (data.trackingUrl) {
        p.push(CMD.ALIGN_CENTER);
        p.push(CMD.LF);
        p.push(qrCodeBuffer(data.trackingUrl));
        p.push(CMD.LF);
        p.push(txt(center('SCANNEZ POUR VOTRE SUIVI')));
        p.push(CMD.LF);
    }

    // ── FOOTER ────────────────────────────────────────────────────────────────
    p.push(CMD.ALIGN_CENTER);
    const footerMsg = (shop.footerMessage || 'Merci de votre confiance !').toUpperCase();

    // Centrer chaque ligne du message de pied de page
    footerMsg.split('\n').forEach(line => {
        if (line.trim()) {
            p.push(CMD.BOLD_ON);
            p.push(txt(center(line.trim())));
            p.push(CMD.BOLD_OFF);
        }
    });

    if (shop.name) {
        p.push(txt(center('WWW.' + shop.name.toUpperCase().replace(/\s+/g, '') + '.COM')));
    }
    p.push(CMD.LF);
    p.push(txt(center('*** ROBOTECH POS ***')));


    // ── AVANCE + COUPE ────────────────────────────────────────────────────────
    p.push(CMD.FEED_4);
    p.push(CMD.CUT_FULL);

    return Buffer.concat(p);
}

module.exports = { generateTicket };
