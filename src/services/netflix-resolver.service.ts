import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface ResolverResult {
    type: 'CODE' | 'LINK' | 'NOT_FOUND' | 'ERROR';
    value?: string;
    attempts: number;
    error?: string;
}

export class NetflixResolverService {
    private static readonly SENDERS = [
        'info@account.netflix.com',
        'noreply@mailer.netflix.com',
        'noreply@netflix.com',
        'netflix@mailer.netflix.com'
    ];

    /**
     * Résout le code/lien Netflix pour un compte donné.
     * Si relayEmail/relayPassword fournis → connexion via compte relay Gmail.
     * Sinon → connexion directe à l'email du compte (legacy Outlook).
     */
    static async resolve(
        netflixEmail: string,
        emailPassword: string,
        relay?: { email: string; password: string }
    ): Promise<ResolverResult> {
        let attempts = 0;
        const maxAttempts = 3;

        const imapUser = relay?.email ?? netflixEmail;
        const imapPass = relay?.password ?? emailPassword;
        const imapHost = imapUser.endsWith('@gmail.com') ? 'imap.gmail.com' : 'outlook.office365.com';

        console.log(`[NetflixResolver] Démarrage pour ${netflixEmail} via ${imapHost} (${imapUser})`);

        while (attempts < maxAttempts) {
            attempts++;
            console.log(`[NetflixResolver] Tentative ${attempts}/${maxAttempts}`);
            const result = await this.fetchLatestNetflixEmail(netflixEmail, imapUser, imapPass, imapHost);

            if (result.type !== 'NOT_FOUND' && result.type !== 'ERROR') {
                console.log(`[NetflixResolver] Succès: ${result.type} trouvé à la tentative ${attempts}`);
                return { ...result, attempts };
            }
            if (result.type === 'ERROR') {
                console.error(`[NetflixResolver] Erreur critique (Tentative ${attempts}): ${result.error}`);
                if (result.error?.toLowerCase().includes('authentication') || result.error?.toLowerCase().includes('login')) {
                    console.error(`[NetflixResolver] Erreur d'authentification. Arrêt des tentatives.`);
                    return { ...result, attempts };
                }
            } else {
                console.log(`[NetflixResolver] Aucun email pertinent trouvé.`);
            }

            if (attempts < maxAttempts) {
                const waitTime = result.type === 'ERROR' ? 10000 : 30000;
                console.log(`[NetflixResolver] Attente de ${waitTime / 1000}s...`);
                await new Promise(r => setTimeout(r, waitTime));
            }
        }

        console.log(`[NetflixResolver] Échec après ${attempts} tentatives`);
        return { type: 'NOT_FOUND', attempts };
    }

    private static async fetchLatestNetflixEmail(
        netflixEmail: string,
        imapUser: string,
        imapPass: string,
        imapHost: string
    ): Promise<ResolverResult> {
        const client = new ImapFlow({
            host: imapHost,
            port: 993,
            secure: true,
            auth: { user: imapUser, pass: imapPass },
            logger: false
        });

        let connected = false;
        try {
            console.log(`[NetflixResolver] Connexion IMAP ${imapHost}...`);
            await client.connect();
            connected = true;
            console.log(`[NetflixResolver] Connecté. Recherche dans INBOX...`);
            const lock = await client.getMailboxLock('INBOX');

            try {
                const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

                let targetMsg: any = null;
                let latestDate = 0;
                let msgsCount = 0;

                for await (const message of client.fetch({ since: fifteenMinsAgo }, { source: true, envelope: true })) {
                    msgsCount++;
                    if (!message.envelope?.from) continue;

                    const fromAddress = message.envelope.from[0]?.address?.toLowerCase();
                    if (fromAddress && this.SENDERS.includes(fromAddress)) {
                        const msgDate = message.envelope.date ? message.envelope.date.getTime() : 0;
                        if (!targetMsg || msgDate > latestDate) {
                            targetMsg = message;
                            latestDate = msgDate;
                        }
                    }
                }

                console.log(`[NetflixResolver] ${msgsCount} emails récents scannés.`);

                if (!targetMsg) {
                    console.log(`[NetflixResolver] Aucun email Netflix trouvé pour ${netflixEmail}.`);
                    return { type: 'NOT_FOUND', attempts: 1 };
                }

                console.log(`[NetflixResolver] Email Netflix ciblé (${new Date(latestDate).toISOString()}). Analyse...`);
                const parsed = await simpleParser(targetMsg.source);
                const text = parsed.text || '';
                const html = parsed.html || '';

                const extracted = this.extractFromBody(text, html);
                if (extracted.type === 'NOT_FOUND') {
                    console.log(`[NetflixResolver] Code/lien introuvable dans le corps.`);
                }
                return extracted;

            } finally {
                lock.release();
            }
        } catch (error: any) {
            console.error(`[NetflixResolver] Exception IMAP: ${error.message}`);
            return { type: 'ERROR', error: error.message, attempts: 1 };
        } finally {
            if (connected) await client.logout().catch(() => { });
        }
    }

    private static extractFromBody(text: string, html: string): ResolverResult {
        const combinedBody = text + " " + html;
        const linkRegex = /https:\/\/www\.netflix\.com[^\s"<>]*(?:update-household|verify)[^\s"<>]*/i;
        const linkMatch = combinedBody.match(linkRegex);

        if (linkMatch) {
            const url = linkMatch[0].replace(/&amp;/g, '&');
            return { type: 'LINK', value: url, attempts: 1 };
        }

        const codeRegex = /\b(\d{4})\b/g;
        const textToSearch = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        let lastCode: string | null = null;
        let m: RegExpExecArray | null;
        while ((m = codeRegex.exec(textToSearch)) !== null) {
            lastCode = m[1];
        }

        if (lastCode) {
            return { type: 'CODE', value: lastCode, attempts: 1 };
        }

        return { type: 'NOT_FOUND', attempts: 1 };
    }
}
