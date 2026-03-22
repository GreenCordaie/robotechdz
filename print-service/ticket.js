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
const SEP  = '-'.repeat(COLS);

// ─── Commandes ESC/POS ────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

const CMD = {
    INIT:         Buffer.from([ESC, 0x40]),
    ALIGN_LEFT:   Buffer.from([ESC, 0x61, 0x00]),
    ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
    ALIGN_RIGHT:  Buffer.from([ESC, 0x61, 0x02]),
    BOLD_ON:      Buffer.from([ESC, 0x45, 0x01]),
    BOLD_OFF:     Buffer.from([ESC, 0x45, 0x00]),
    SIZE_NORMAL:  Buffer.from([ESC, 0x21, 0x00]),
    SIZE_2HW:     Buffer.from([ESC, 0x21, 0x30]),   // Double hauteur + largeur
    LF:           Buffer.from([0x0a]),
    FEED_4:       Buffer.from([ESC, 0x64, 0x04]),
    CUT_FULL:     Buffer.from([GS,  0x56, 0x00]),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function txt(str) { return Buffer.from(str + '\n', 'utf8'); }

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
    const parts  = [];
    const MAX    = 32;
    const indent = '    ';
    const header = `  ${label.padEnd(7)}: `;

    if (value.length <= MAX) {
        parts.push(Buffer.from(header, 'utf8'));
        parts.push(CMD.BOLD_ON);
        parts.push(Buffer.from(value + '\n', 'utf8'));
        parts.push(CMD.BOLD_OFF);
    } else {
        parts.push(Buffer.from(header + '\n', 'utf8'));
        let rem = value;
        while (rem.length > 0) {
            parts.push(CMD.BOLD_ON);
            parts.push(Buffer.from(indent + rem.slice(0, MAX) + '\n', 'utf8'));
            parts.push(CMD.BOLD_OFF);
            rem = rem.slice(MAX);
        }
    }
    return parts;
}

/** QR Code natif ESC/POS (Model 2, Error M, taille 6) */
function qrCodeBuffer(url) {
    const urlBytes = Buffer.from(url, 'utf8');
    const dataLen  = urlBytes.length + 3;
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
    const p    = [];
    const shop = data.shop || {};

    // ── INIT ─────────────────────────────────────────────────────────────────
    p.push(CMD.INIT);

    // ── HEADER : Nom boutique (piloté par ReceiptSettings) ───────────────────
    p.push(CMD.ALIGN_CENTER);
    p.push(CMD.SIZE_2HW);
    p.push(CMD.BOLD_ON);
    p.push(txt((shop.name || 'MA BOUTIQUE').toUpperCase()));
    p.push(CMD.SIZE_NORMAL);
    p.push(CMD.BOLD_OFF);

    if (shop.address) p.push(txt(center(shop.address)));
    if (shop.tel)     p.push(txt(center('Tel : ' + shop.tel)));

    // ── SÉPARATEUR + INFOS COMMANDE ───────────────────────────────────────────
    p.push(CMD.ALIGN_LEFT);
    p.push(txt(SEP));

    const orderLeft  = `Cmd #${data.orderNumber}`;
    const orderRight = (shop.showDateTime !== false)
        ? `${data.date}  ${data.time}`
        : data.date;
    p.push(txt(cols2(orderLeft, orderRight)));

    if (shop.showCashier && data.cashierName) {
        p.push(txt(`Caissier : ${data.cashierName}`));
    }
    if (data.paymentMethod) {
        p.push(txt(`Paiement : ${data.paymentMethod}`));
    }

    // ── CLIENT ────────────────────────────────────────────────────────────────
    p.push(txt(SEP));
    if (data.customer?.name || data.customer?.phone) {
        const clientLeft  = `CLIENT : ${data.customer.name || ''}`;
        const clientRight = data.customer.phone ? `Tel: ${data.customer.phone}` : '';
        p.push(txt(clientRight ? cols2(clientLeft, clientRight) : clientLeft));
        p.push(txt(SEP));
    }

    // ── ARTICLES ──────────────────────────────────────────────────────────────
    const ORDER_LABELS = ['Email', 'Pass', 'Profil', 'Code'];

    data.items.forEach((item, idx) => {
        const titleLeft  = `ARTICLE ${idx + 1} : ${item.productName}`.slice(0, COLS - 12);
        const titleRight = `${item.quantity}x ${item.price} DZD`;
        p.push(CMD.BOLD_ON);
        p.push(txt(cols2(titleLeft, titleRight)));
        p.push(CMD.BOLD_OFF);

        // Credentials dans l'ordre standard
        const credMap = {};
        (item.credentials || []).forEach(c => { credMap[c.label] = c.value; });

        ORDER_LABELS.forEach(label => {
            if (credMap[label] !== undefined) {
                credentialLines(label, String(credMap[label])).forEach(b => p.push(b));
            }
        });

        // Champs supplémentaires hors ORDER_LABELS
        (item.credentials || []).forEach(c => {
            if (!ORDER_LABELS.includes(c.label)) {
                credentialLines(c.label, String(c.value)).forEach(b => p.push(b));
            }
        });

        p.push(txt(SEP));
    });

    // ── QR CODE ───────────────────────────────────────────────────────────────
    p.push(CMD.ALIGN_CENTER);
    p.push(CMD.LF);
    p.push(qrCodeBuffer(data.trackingUrl));
    p.push(CMD.LF);
    p.push(txt(center('Scannez pour suivre votre commande')));
    p.push(CMD.LF);

    // ── FOOTER (piloté par ReceiptSettings) ───────────────────────────────────
    p.push(txt(SEP));
    const footerMsg = (shop.footerMessage || 'Merci pour votre achat !').toUpperCase();
    p.push(CMD.BOLD_ON);
    p.push(txt(center(footerMsg)));
    p.push(CMD.BOLD_OFF);
    if (shop.name) p.push(txt(center(shop.name.toLowerCase() + '.com')));
    p.push(txt(SEP));

    // ── AVANCE + COUPE ────────────────────────────────────────────────────────
    p.push(CMD.FEED_4);
    p.push(CMD.CUT_FULL);

    return Buffer.concat(p);
}

module.exports = { generateTicket };
