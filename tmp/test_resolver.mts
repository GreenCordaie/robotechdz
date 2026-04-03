// Test E2E Graph API Netflix — sans server-only
import postgres from 'postgres';
import crypto from 'crypto';
import * as schema from '../src/db/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import { desc } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL || '';
const RAW_KEY = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || '';
// Même logique que src/lib/encryption.ts : sha256(rawKey)
const ENCRYPTION_KEY = crypto.createHash('sha256').update(RAW_KEY).digest();

function decrypt(text: string | null): string | null {
    if (!text || !text.includes('.')) return text; // non chiffré
    try {
        const [ivHex, authTagHex, encHex] = text.split('.');
        if (!ivHex || !authTagHex || !encHex) return text;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encData = Buffer.from(encHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);
        return decipher.update(encData, undefined, 'utf8') + decipher.final('utf8');
    } catch { return null; }
}

const sql = postgres(DATABASE_URL);
const db = drizzle(sql, { schema });

async function main() {
    console.log('\n=== DIAGNOSTIC NETFLIX GRAPH RESOLVER ===\n');

    // 1. Récupérer les settings depuis shop_settings (raw SQL pour éviter server-only)
    const settingsRows = await sql`SELECT * FROM shop_settings LIMIT 1`;
    const s = settingsRows[0] as any;

    const defaultClientId = s?.microsoft_client_id || process.env.MICROSOFT_CLIENT_ID || '72e03be8-0a78-4e03-8e47-ee2bb1600a09';
    const defaultSecret   = s?.microsoft_client_secret || process.env.MICROSOFT_CLIENT_SECRET || '';
    const tenant          = s?.microsoft_tenant_id || 'consumers';

    console.log(`🔑 Client ID: ${defaultClientId.slice(0, 8)}...`);
    console.log(`🔑 Secret set: ${!!defaultSecret}`);

    // 2. Trouver les comptes Netflix liés Graph
    const codes = await sql`
        SELECT dc.*, pv.id as variant_id, p.name as product_name
        FROM digital_codes dc
        JOIN product_variants pv ON dc.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE dc.ms_status = 'CONNECTED'
          AND dc.ms_refresh_token IS NOT NULL
          AND LOWER(p.name) LIKE '%netflix%'
        ORDER BY dc.created_at DESC
    `;

    console.log(`\n📊 Comptes Netflix liés Graph: ${codes.length}`);

    if (codes.length === 0) {
        console.log('❌ Aucun compte avec msStatus=CONNECTED trouvé.');

        // Afficher tous les comptes Netflix pour debug
        const all = await sql`
            SELECT dc.id, dc.ms_status, dc.ms_account_email, SUBSTRING(dc.code, 1, 30) as code_preview
            FROM digital_codes dc
            JOIN product_variants pv ON dc.variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE LOWER(p.name) LIKE '%netflix%'
            ORDER BY dc.created_at DESC
            LIMIT 10
        `;
        console.log('\nComptes Netflix en DB:');
        all.forEach((r: any) => {
            console.log(`  ID=${r.id} | status=${r.ms_status} | email=${r.ms_account_email || 'N/A'}`);
        });
        await sql.end();
        return;
    }

    // 3. Test sur le premier compte lié
    const account = codes[0] as any;
    const rawCode = decrypt(account.code) || '';
    const [email] = rawCode.split('|').map((x: string) => x.trim());
    const usedClientId = account.ms_client_id || defaultClientId;

    // Choisir le bon secret
    let clientSecret = defaultSecret;
    if (account.ms_client_id && account.ms_client_id === process.env.MICROSOFT_CLIENT_ID_2) {
        clientSecret = process.env.MICROSOFT_CLIENT_SECRET_2 || defaultSecret;
    } else if (account.ms_client_id && account.ms_client_id !== defaultClientId) {
        // Client ID différent du défaut — essayer de trouver le secret
        clientSecret = defaultSecret; // fallback
    }

    console.log(`\n🧪 Test sur: ${email}`);
    console.log(`   ID: ${account.id}`);
    console.log(`   ms_status: ${account.ms_status}`);
    console.log(`   ms_account_email: ${account.ms_account_email || '(non défini)'}`);
    console.log(`   ms_client_id: ${account.ms_client_id ? account.ms_client_id.slice(0, 8) + '...' : '(default)'}`);
    console.log(`   product: ${account.product_name}`);

    // 4. Refresh token
    console.log('\n⏳ Rafraîchissement du token...');
    const refreshToken = decrypt(account.ms_refresh_token);
    if (!refreshToken) {
        console.log('❌ Impossible de déchiffrer le refresh token.');
        await sql.end();
        return;
    }

    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: usedClientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: 'https://graph.microsoft.com/Mail.Read offline_access'
        })
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
        console.log('❌ Échec refresh token:');
        console.log('   error:', tokenData.error);
        console.log('   description:', tokenData.error_description?.slice(0, 200));
        await sql.end();
        return;
    }
    console.log('✅ Access token obtenu.');
    if (tokenData.refresh_token) {
        console.log('🔄 Nouveau refresh token reçu (rotation).');
    }

    // 5. Chercher emails Netflix
    console.log('\n📧 Graph: recherche emails Netflix...');
    const graphRes = await fetch(
        'https://graph.microsoft.com/v1.0/me/messages?$search="netflix"&$top=20&$select=id,subject,receivedDateTime,from,body',
        { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
    );

    let messages: any[] = [];
    if (!graphRes.ok) {
        console.log('⚠️  $search échoué, fallback top-50...');
        const fbRes = await fetch(
            'https://graph.microsoft.com/v1.0/me/messages?$orderby=receivedDateTime desc&$top=50&$select=id,subject,receivedDateTime,from',
            { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
        );
        if (fbRes.ok) {
            const fbData = await fbRes.json() as any;
            messages = (fbData.value || []).filter((m: any) =>
                m.from?.emailAddress?.address?.toLowerCase().includes('netflix') ||
                m.subject?.toLowerCase().includes('netflix')
            );
        }
    } else {
        const graphData = await graphRes.json() as any;
        messages = graphData.value || [];
    }

    console.log(`   ${messages.length} email(s) Netflix trouvé(s)`);

    if (messages.length === 0) {
        console.log('\n⚠️  RÉSULTAT: Aucun email Netflix.');
        console.log('   → Le client doit d\'abord aller sur Netflix et déclencher l\'envoi du code.');

        // Afficher les 5 derniers emails pour voir ce qui arrive
        const lastRes = await fetch(
            'https://graph.microsoft.com/v1.0/me/messages?$orderby=receivedDateTime desc&$top=5&$select=subject,from,receivedDateTime',
            { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
        );
        if (lastRes.ok) {
            const lastData = await lastRes.json() as any;
            console.log('\n   5 derniers emails dans la boîte:');
            lastData.value?.forEach((m: any) => {
                console.log(`     [${m.receivedDateTime?.slice(0, 16)}] ${m.from?.emailAddress?.address} → "${m.subject}"`);
            });
        }
        await sql.end();
        return;
    }

    // Trier par date
    messages.sort((a: any, b: any) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime());

    console.log('\n📬 Emails Netflix (du plus récent):');
    messages.slice(0, 5).forEach((m: any) => {
        console.log(`  [${m.receivedDateTime?.slice(0, 16)}] ${m.from?.emailAddress?.address} → "${m.subject}"`);
    });

    // 6. Extraction code/lien
    const latest = messages[0];
    const body: string = latest.body?.content || '';

    const linkRegex = /https:\/\/www\.netflix\.com[^\s"<>]*(?:update-household|verify|ilum|approuver|signin)[^\s"<>]*/i;
    const linkMatch = body.match(linkRegex);

    if (linkMatch) {
        console.log(`\n✅ RÉSULTAT: LIEN FOYER`);
        console.log(`   ${linkMatch[0].replace(/&amp;/g, '&').slice(0, 120)}...`);
    } else {
        const cleanBody = body.replace(/https?:\/\/[^\s<>"]+/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const codeMatch = cleanBody.match(/\b(\d{4,6})\b/);
        if (codeMatch) {
            console.log(`\n✅ RÉSULTAT: CODE → *${codeMatch[1]}*`);
            console.log(`   Email: "${latest.subject}" du ${latest.receivedDateTime?.slice(0, 16)}`);
        } else {
            console.log(`\n⚠️  RÉSULTAT: NOT_FOUND`);
            console.log(`   Email: "${latest.subject}" du ${latest.receivedDateTime?.slice(0, 16)}`);
            console.log(`   Body preview: ${cleanBody.slice(0, 300)}`);
        }
    }

    // 7. Audit logs récents
    const logs = await sql`
        SELECT action, entity_id, new_data, created_at
        FROM audit_logs
        WHERE action IN ('NETFLIX_RESOLVE_AUTO', 'NETFLIX_RESOLVE_MANUAL')
        ORDER BY created_at DESC
        LIMIT 5
    `;
    console.log('\n📋 Dernières résolutions audit:');
    if (logs.length === 0) {
        console.log('   Aucune.');
    } else {
        logs.forEach((l: any) => {
            const d = l.new_data as any;
            console.log(`  [${l.created_at?.toISOString().slice(0, 16)}] ${l.action} | slot=${l.entity_id} | type=${d?.type} | value=${d?.value || 'N/A'}`);
        });
    }

    console.log('\n=== FIN ===\n');
    await sql.end();
}

main().catch(async err => {
    console.error('\n💥 Fatal:', err.message);
    await sql.end();
    process.exit(1);
});
