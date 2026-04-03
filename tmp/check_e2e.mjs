import postgres from 'postgres';
import crypto from 'crypto';

const RAW_KEY = process.env.ENCRYPTION_KEY || '';
const ENC_KEY = crypto.createHash('sha256').update(RAW_KEY).digest();
const sql = postgres(process.env.DATABASE_URL || '');

function decrypt(text) {
    if (!text || !text.includes('.')) return text;
    try {
        const [ivHex, authTagHex, encHex] = text.split('.');
        const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
        d.setAuthTag(Buffer.from(authTagHex, 'hex'));
        return d.update(Buffer.from(encHex, 'hex'), undefined, 'utf8') + d.final('utf8');
    } catch { return null; }
}

const accounts = await sql`
    SELECT dc.id, dc.code, dc.ms_status, dc.ms_refresh_token, dc.ms_client_id
    FROM digital_codes dc
    JOIN product_variants pv ON dc.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    WHERE LOWER(p.name) LIKE '%netflix%'
    ORDER BY dc.ms_status DESC, dc.created_at DESC
    LIMIT 10
`;

console.log('=== COMPTES NETFLIX ===');
for (const a of accounts) {
    const email = (decrypt(a.code) || '').split('|')[0]?.trim() || '?';
    const hasToken = !!a.ms_refresh_token;
    const tokenOk = hasToken ? (decrypt(a.ms_refresh_token) ? 'token OK' : 'DECRYPT FAIL') : 'pas de token';
    const status = String(a.ms_status || 'NONE').padEnd(11);
    console.log(`  ID=${a.id} | ${status} | ${tokenOk} | ${email}`);
}

const slots = await sql`
    SELECT dcs.id as slot_id, dcs.status, dcs.profile_name,
           o.order_number, o.id as order_id, o.customer_phone,
           dc.ms_status, dc.id as account_id
    FROM digital_code_slots dcs
    JOIN digital_codes dc ON dcs.digital_code_id = dc.id
    JOIN product_variants pv ON dc.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    LEFT JOIN order_items oi ON dcs.order_item_id = oi.id
    LEFT JOIN orders o ON oi.order_id = o.id
    WHERE LOWER(p.name) LIKE '%netflix%'
      AND dcs.status = 'VENDU'
    ORDER BY o.created_at DESC
    LIMIT 8
`;

console.log('\n=== SLOTS NETFLIX VENDUS (recents) ===');
for (const s of slots) {
    const orderNum = String(s.order_number || '');
    const lastPart = orderNum.replace(/[^0-9\-]/g,'').split('-').filter(Boolean).pop() || '?';
    const msOk = s.ms_status === 'CONNECTED' ? 'CONNECTED' : s.ms_status || 'NONE';
    console.log(`  slot=${s.slot_id} | ${msOk.padEnd(11)} | ${orderNum} -> taper "${lastPart}" | ${s.profile_name || '?'} | phone=${String(s.customer_phone||'').slice(0,7)}****`);
}

console.log('\n=== SIMULATION TRIGGER (ce que le client peut taper) ===');
const netflixRx = /\b(foyer|household|appareil|code|code netflix|connexion|activer|v[eé]rification|demande|r[eé]cup[eé]rer|mon code|mon pin)\b/i;
const tests = ['270', '612', '518', 'code', 'Code', 'foyer', '#C379', '1'];
for (const t of tests) {
    const isKeyword  = netflixRx.test(t);
    const isHash     = t.startsWith('#');
    const isDisambig = /^\d{1,6}$/.test(t.trim()) || /^[A-Za-z]{0,2}\d{2,6}(-\d{2,6})?$/.test(t.trim());
    const fires = isKeyword || isHash || isDisambig;
    const reason = [isKeyword&&'keyword', isHash&&'#start', isDisambig&&'disambig'].filter(Boolean).join('+') || '—';
    console.log(`  "${t.padEnd(8)}" => ${fires ? 'OUI' : 'NON'} (${reason})`);
}

await sql.end();
