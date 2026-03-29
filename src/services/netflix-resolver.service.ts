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

    static async resolve(email: string, outlookPassword: string): Promise<ResolverResult> {
        let attempts = 0;
        const maxAttempts = 3;

        console.log(`[NetflixResolver] Démarrage de la résolution pour ${email}`);

        while (attempts < maxAttempts) {
            attempts++;
            console.log(`[NetflixResolver] Tentative ${attempts}/${maxAttempts} pour ${email}`);
            const result = await this.fetchLatestNetflixEmail(email, outlookPassword);

            if (result.type !== 'NOT_FOUND' && result.type !== 'ERROR') {
                console.log(`[NetflixResolver] Succès: ${result.type} trouvé à la tentative ${attempts}`);
                return { ...result, attempts };
            }
            if (result.type === 'ERROR') {
                console.error(`[NetflixResolver] Erreur critique (Tentative ${attempts}): ${result.error}`);
                if (result.error?.toLowerCase().includes('authentication') || result.error?.toLowerCase().includes('login')) {
                    console.error(`[NetflixResolver] Erreur d'authentification (Mdp erroné ou 2FA). Arrêt des tentatives.`);
                    return { ...result, attempts };
                }
            } else {
                console.log(`[NetflixResolver] Aucun email pertinent trouvé.`);
            }

            if (attempts < maxAttempts) {
                const waitTime = result.type === 'ERROR' ? 10000 : 30000;
                console.log(`[NetflixResolver] Attente de ${waitTime / 1000}s avant la prochaine tentative...`);
                await new Promise(r => setTimeout(r, waitTime));
            }
        }

        console.log(`[NetflixResolver] Échec de la résolution après ${attempts} tentatives`);
        return { type: 'NOT_FOUND', attempts };
    }

    private static async fetchLatestNetflixEmail(email: string, outlookPassword: string): Promise<ResolverResult> {
        const client = new ImapFlow({
            host: 'outlook.office365.com',
            port: 993,
            secure: true,
            auth: {
                user: email,
                pass: outlookPassword
            },
            logger: false
        });

        try {
            console.log(`[NetflixResolver] Connexion IMAP en cours pour ${email}...`);
            await client.connect();
            console.log(`[NetflixResolver] Connexion IMAP réussie. Recherche dans INBOX...`);
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

                console.log(`[NetflixResolver] ${msgsCount} emails récents trouvés.`);

                if (!targetMsg) {
                    console.log(`[NetflixResolver] Aucun email provenant des expéditeurs Netflix trouvé.`);
                    return { type: 'NOT_FOUND', attempts: 1 };
                }

                console.log(`[NetflixResolver] Email Netflix ciblé trouvé (Date: ${new Date(latestDate).toISOString()}). Analyse en cours...`);
                const parsed = await simpleParser(targetMsg.source);
                const text = parsed.text || '';
                const html = parsed.html || '';

                const extracted = this.extractFromBody(text, html);
                if (extracted.type === 'NOT_FOUND') {
                    console.log(`[NetflixResolver] Échec de l'extraction: Code ou lien non trouvé dans le corps du message.`);
                }
                return extracted;

            } finally {
                lock.release();
            }
        } catch (error: any) {
            console.error(`[NetflixResolver] Exception IMAP: ${error.message}`);
            return { type: 'ERROR', error: error.message, attempts: 1 };
        } finally {
            await client.logout();
        }
    }

    private static extractFromBody(text: string, html: string): ResolverResult {
        const combinedBody = text + " " + html;

        // Look for link
        const linkRegex = /https:\/\/www\.netflix\.com[^\s"<>]*(?:update-household|verify)[^\s"<>]*/i;
        const linkMatch = combinedBody.match(linkRegex);

        if (linkMatch) {
            let url = linkMatch[0].replace(/&amp;/g, '&');
            return { type: 'LINK', value: url, attempts: 1 };
        }

        // Look for 4 digit code
        const codeRegex = /\b\d{4}\b/;
        const codeMatch = combinedBody.match(codeRegex);

        if (codeMatch) {
            return { type: 'CODE', value: codeMatch[0], attempts: 1 };
        }

        return { type: 'NOT_FOUND', attempts: 1 };
    }
}
