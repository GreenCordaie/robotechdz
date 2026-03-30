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
                let targetMsg: any = null;
                let latestDate = 0;
                let msgsCount = 0;
                const isRelay = imapUser.toLowerCase() !== netflixEmail.toLowerCase();

                // On filtre par date (15 dernières minutes)
                const since = new Date(Date.now() - 15 * 60 * 1000);

                // On boucle sur les messages récents (on pourrait optimiser avec SEARCH mais fetch est plus consistant ici)
                for await (const message of client.fetch({ since }, { source: true, envelope: true })) {
                    msgsCount++;
                    if (!message.envelope?.from) continue;

                    const fromAddress = message.envelope.from[0]?.address?.toLowerCase();
                    const toAddress = message.envelope.to?.[0]?.address?.toLowerCase() || '';
                    const subject = message.envelope.subject?.toLowerCase() || '';

                    if (fromAddress && this.SENDERS.includes(fromAddress)) {
                        // CRITIQUE : Vérification que l'email est bien pour CE client
                        // On vérifie le To, le Sujet
                        let isForTarget = !isRelay ||
                            toAddress.includes(netflixEmail.toLowerCase()) ||
                            subject.includes(netflixEmail.toLowerCase());

                        // Si on n'est pas sûr, on fouille rapidement le début du corps brut (headers inclus)
                        if (isRelay && !isForTarget && message.source) {
                            const rawSource = message.source.toString().toLowerCase();
                            if (rawSource.includes(netflixEmail.toLowerCase())) {
                                isForTarget = true;
                            }
                        }

                        // Ignorer les emails de notification pure (pas de code ni lien)
                        const isVerificationEmail =
                            subject.includes('code') ||
                            subject.includes('vérif') ||
                            subject.includes('verif') ||
                            subject.includes('foyer') ||
                            subject.includes('household') ||
                            subject.includes('update') ||
                            subject.includes('mise à jour') ||
                            subject.includes('accès') ||
                            subject.includes('acces') ||
                            subject.includes('connexion') ||
                            subject.includes('identification') ||
                            subject.includes('demande');

                        if (!isVerificationEmail) {
                            console.log(`[NetflixResolver] Email ignoré (notification): "${message.envelope.subject}"`);
                            continue;
                        }

                        if (isForTarget) {
                            const msgDate = message.envelope.date ? message.envelope.date.getTime() : 0;
                            if (!targetMsg || msgDate > latestDate) {
                                targetMsg = message;
                                latestDate = msgDate;
                            }
                        }
                    }
                }

                console.log(`[NetflixResolver] ${msgsCount} emails récents scannés.`);

                if (!targetMsg) {
                    console.log(`[NetflixResolver] Aucun email trouvé pour ${netflixEmail} (Relais: ${isRelay})`);
                    return { type: 'NOT_FOUND', attempts: 1 };
                }

                console.log(`[NetflixResolver] Email Netflix ciblé trouvé. Analyse...`);
                const parsed = await simpleParser(targetMsg.source);
                const text = parsed.text || '';
                const html = parsed.html || '';

                const extracted = this.extractFromBody(text, html);
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

        // 1. Priorité au LIEN (Update Household)
        const linkRegex = /https:\/\/www\.netflix\.com[^\s"<>]*(?:update-household|verify|ilum|approuver|signin)[^\s"<>]*/i;
        const linkMatch = combinedBody.match(linkRegex);

        if (linkMatch) {
            const url = linkMatch[0].replace(/&amp;/g, '&');
            return { type: 'LINK', value: url, attempts: 1 };
        }

        // 2. Recherche du CODE à 4 chiffres
        // On nettoie le texte pour éviter de capturer des chiffres dans les URLs ou balises
        const cleanText = combinedBody
            .replace(/https?:\/\/[^\s<>"]+/g, ' ') // Supprime les URLs
            .replace(/<[^>]+>/g, ' ')             // Supprime les balises HTML
            .replace(/\s+/g, ' ');                // Normalise les espaces

        // On cherche les patterns typiques : "code : 1234" ou juste "1234" isolé
        const codeRegex = /\b(\d{4})\b/g;
        let matches: string[] = [];
        let m;
        while ((m = codeRegex.exec(cleanText)) !== null) {
            matches.push(m[1]);
        }

        if (matches.length > 0) {
            // Le premier code à 4 chiffres trouvé après nettoyage est généralement le bon
            // Contrairement aux Outlook ID qui sont souvent en fin de message ou dans les liens cachés
            return { type: 'CODE', value: matches[0], attempts: 1 };
        }

        return { type: 'NOT_FOUND', attempts: 1 };
    }
}
