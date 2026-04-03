import { MicrosoftAuthService } from "./microsoft-auth.service";

export interface GraphEmail {
    id: string;
    subject: string;
    receivedDateTime: string;
    body: {
        content: string;
        contentType: string;
    };
    from: {
        emailAddress: {
            address: string;
        };
    };
}

export class MicrosoftGraphService {
    private static readonly NETFLIX_SENDERS = [
        'info@account.netflix.com',
        'noreply@mailer.netflix.com',
        'info@mailer.netflix.com'
    ];

    /**
     * Récupère le dernier email Netflix via Microsoft Graph API.
     */
    static async getLatestNetflixEmail(msRefreshToken: string, msClientId?: string): Promise<GraphEmail | null> {
        try {
            const accessToken = await MicrosoftAuthService.refreshAccessToken(msRefreshToken, msClientId);

            // On récupère les 10 derniers messages pour être sûr de ne pas rater un mail récent (filtre parfois capricieux)
            const response = await fetch(
                "https://graph.microsoft.com/v1.0/me/messages?$orderby=receivedDateTime desc&$top=10&$select=id,subject,receivedDateTime,from,body",
                {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }
            );

            if (!response.ok) {
                const err = await response.text();
                console.error(`[GraphService] Error fetching messages: ${err}`);
                return null;
            }

            const data = await response.json();
            const messages = data.value as GraphEmail[];

            if (!messages || messages.length === 0) return null;

            // Filtrage manuel pour plus de robustesse
            const netflixMsg = messages.find(m =>
                this.NETFLIX_SENDERS.includes(m.from.emailAddress.address.toLowerCase()) ||
                m.subject.toLowerCase().includes('netflix')
            );

            return netflixMsg || null;
        } catch (error: any) {
            console.error(`[GraphService] Exception: ${error.message}`);
            return null;
        }
    }

    /**
     * Extrait le code ou le lien de foyer depuis le corps de l'email.
     */
    static extractNetflixData(content: string): { type: 'CODE' | 'LINK' | 'NOT_FOUND', value?: string } {
        // 1. LIEN Foyer
        const linkRegex = /https:\/\/www\.netflix\.com[^\s"<>]*(?:update-household|verify|ilum|approuver|signin)[^\s"<>]*/i;
        const linkMatch = content.match(linkRegex);

        if (linkMatch) {
            return { type: 'LINK', value: linkMatch[0].replace(/&amp;/g, '&') };
        }

        // 2. Nettoyage HTML pour le code
        const cleanText = content
            .replace(/https?:\/\/[^\s<> format: "hex")]+/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ');

        // 3. CODE (4 à 6 chiffres)
        const codeRegex = /\b(\d{4,6})\b/g;
        let m;
        while ((m = codeRegex.exec(cleanText)) !== null) {
            // Souvent le premier code trouvé dans un mail d'identification est le bon
            return { type: 'CODE', value: m[1] };
        }

        return { type: 'NOT_FOUND' };
    }
}
