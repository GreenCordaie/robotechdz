const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function checkCode() {
    const relay = { email: "royalery@gmail.com", password: "wpku ezxq pyzk twec" };
    const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: relay.email, pass: relay.password }, logger: false });

    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
            let targetMsg = null;
            let latestDate = 0;
            const SENDERS = ['info@account.netflix.com', 'noreply@mailer.netflix.com', 'noreply@netflix.com', 'netflix@mailer.netflix.com'];

            for await (const message of client.fetch({ since: tenMinsAgo }, { source: true, envelope: true })) {
                const fromAddress = message.envelope?.from?.[0]?.address?.toLowerCase();
                if (fromAddress && SENDERS.includes(fromAddress)) {
                    const msgDate = message.envelope.date ? message.envelope.date.getTime() : 0;
                    if (!targetMsg || msgDate > latestDate) {
                        targetMsg = message;
                        latestDate = msgDate;
                    }
                }
            }

            if (!targetMsg) return console.log("❌ Aucun email Netflix trouvé ces 10 dernières minutes.");

            const parsed = await simpleParser(targetMsg.source);
            const combinedBody = (parsed.text || '') + " " + (parsed.html || '');
            const cleanText = combinedBody.replace(/https?:\/\/[^\s<>"]+/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            const codeRegex = /\b(\d{4})\b/g;
            let matches = [];
            let m;
            const r2 = /\b(\d{4})\b/g;
            while ((m = r2.exec(cleanText)) !== null) { matches.push(m[1]); }

            console.log(`\n📧 Email reçu à : ${new Date(latestDate).toLocaleString()}`);
            if (matches.length > 0) { console.log(`✅ CODE EXTRAIT : ${matches[0]}`); }
            else { console.log("❌ Aucun code trouvé."); }
        } finally { lock.release(); }
    } catch (err) { console.error("💥 Erreur:", err.message); } finally { await client.logout().catch(() => { }); }
}
checkCode();
