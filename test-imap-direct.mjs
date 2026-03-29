/**
 * Test direct IMAP Netflix Resolver
 * Usage: node test-imap-direct.mjs <email> <outlookPassword>
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.error("Usage: node test-imap-direct.mjs <email> <outlookPassword>");
    process.exit(1);
}

const SENDERS = [
    'info@account.netflix.com',
    'noreply@mailer.netflix.com',
    'noreply@netflix.com',
    'netflix@mailer.netflix.com'
];

console.log("═══════════════════════════════════════════════════");
console.log("  Test IMAP Direct — Netflix Resolver");
console.log("═══════════════════════════════════════════════════");
console.log(`  Email   : ${email}`);
console.log(`  Host    : outlook.office365.com:993`);
console.log("═══════════════════════════════════════════════════\n");

const client = new ImapFlow({
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false
});

let connected = false;
try {
    console.log("[1] Connexion IMAP...");
    await client.connect();
    connected = true;
    console.log("[1] ✅ Connecté\n");

    const lock = await client.getMailboxLock('INBOX');
    try {
        // Test 1: emails des 15 dernières minutes
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        console.log(`[2] Recherche emails depuis ${fifteenMinsAgo.toISOString()}`);

        let msgsCount = 0;
        let netflixMsg = null;
        let latestDate = 0;

        for await (const msg of client.fetch({ since: fifteenMinsAgo }, { source: true, envelope: true })) {
            msgsCount++;
            const from = msg.envelope?.from?.[0]?.address?.toLowerCase();
            console.log(`    → Email: ${from} (${msg.envelope?.date?.toISOString()})`);

            if (from && SENDERS.includes(from)) {
                const d = msg.envelope?.date?.getTime() || 0;
                if (!netflixMsg || d > latestDate) {
                    netflixMsg = msg;
                    latestDate = d;
                }
            }
        }

        console.log(`\n[2] ${msgsCount} emails récents trouvés.`);

        if (!netflixMsg) {
            console.log("[2] ❌ Aucun email Netflix dans les 15 dernières minutes.\n");

            // Test 2: chercher dans les dernières 24h pour voir s'il y en a eu
            console.log("[3] Recherche élargie (24h) pour diagnostic...");
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            let count24h = 0;
            for await (const msg of client.fetch({ since: oneDayAgo }, { envelope: true })) {
                const from = msg.envelope?.from?.[0]?.address?.toLowerCase();
                if (from && SENDERS.includes(from)) {
                    count24h++;
                    console.log(`    → Netflix email: ${from} (${msg.envelope?.date?.toISOString()})`);
                }
            }
            if (count24h === 0) {
                console.log("[3] ⚠️  Aucun email Netflix dans les 24 dernières heures non plus.");
            }
        } else {
            console.log(`\n[2] ✅ Email Netflix trouvé: ${netflixMsg.envelope?.from?.[0]?.address}`);
            console.log(`    Date: ${new Date(latestDate).toISOString()}`);

            // Parse et extraire
            const parsed = await simpleParser(netflixMsg.source);
            const text = parsed.text || '';
            const html = parsed.html || '';
            console.log(`\n[3] Analyse du contenu...`);

            // Cherche lien
            const combinedBody = text + " " + html;
            const linkMatch = combinedBody.match(/https:\/\/www\.netflix\.com[^\s"<>]*(?:update-household|verify)[^\s"<>]*/i);
            if (linkMatch) {
                const url = linkMatch[0].replace(/&amp;/g, '&');
                console.log(`[3] ✅ LIEN trouvé: ${url}`);
            } else {
                // Cherche code 4 chiffres
                const textToSearch = text || html.replace(/<[^>]+>/g, ' ');
                const codeRegex = /\b(\d{4})\b/g;
                let lastCode = null;
                let m;
                while ((m = codeRegex.exec(textToSearch)) !== null) lastCode = m[1];

                if (lastCode) {
                    console.log(`[3] ✅ CODE trouvé: ${lastCode}`);
                } else {
                    console.log(`[3] ❌ Ni code ni lien trouvé dans l'email.`);
                    console.log(`    Sujet: ${parsed.subject}`);
                    console.log(`    Texte (200 premiers chars): ${text.slice(0, 200)}`);
                }
            }
        }
    } finally {
        lock.release();
    }
} catch (err) {
    console.error(`\n❌ ERREUR: ${err.message}`);
    if (err.message?.toLowerCase().includes('auth') || err.message?.toLowerCase().includes('login')) {
        console.error("   → Mot de passe Outlook incorrect ou 2FA activé.");
    }
} finally {
    if (connected) await client.logout().catch(() => {});
    console.log("\n[DONE] Test terminé.");
}
