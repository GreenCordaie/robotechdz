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
     * @param digitalCodeId Si fourni, sauvegarde le nouveau refresh_token si Microsoft en retourne un.
     */
    static async getLatestNetflixEmail(
        msRefreshToken: string,
        msClientId?: string,
        digitalCodeId?: number
    ): Promise<GraphEmail | null> {
        try {
            const accessToken = await MicrosoftAuthService.refreshAccessToken(
                msRefreshToken,
                msClientId,
                digitalCodeId
            );

            // $search et $orderby sont incompatibles sur Graph API.
            // On récupère les 20 derniers résultats et on trie ensuite côté serveur.
            const response = await fetch(
                `https://graph.microsoft.com/v1.0/me/messages?$search="netflix"&$top=20&$select=id,subject,receivedDateTime,from,body`,
                {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }
            );

            if (!response.ok) {
                const err = await response.text();
                console.error(`[GraphService] Error searching messages (search="netflix"): ${err}`);

                // Fallback si $search échoue (certains vieux comptes/scopes) : top 50 toutes boîtes
                const fallbackRes = await fetch(
                    "https://graph.microsoft.com/v1.0/me/messages?$orderby=receivedDateTime desc&$top=50&$select=id,subject,receivedDateTime,from,body",
                    { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );

                if (!fallbackRes.ok) return null;
                const data = await fallbackRes.json();
                return (data.value as GraphEmail[]).find(m =>
                    this.NETFLIX_SENDERS.includes(m.from.emailAddress.address.toLowerCase()) ||
                    m.subject.toLowerCase().includes('netflix')
                ) || null;
            }

            const data = await response.json();
            const messages = data.value as GraphEmail[];

            if (!messages || messages.length === 0) return null;

            // Trier les résultats du $search par date décroissante (non supporté nativement avec $search)
            const sorted = messages.sort(
                (a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
            );

            // Filtrer par expéditeurs Netflix connus, ou prendre le plus récent si pas de match
            const fromNetflix = sorted.find(m =>
                this.NETFLIX_SENDERS.includes(m.from.emailAddress.address.toLowerCase())
            );

            return fromNetflix || sorted[0];
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

        // 2. Nettoyage HTML pour le code (regex corrigée)
        const cleanText = content
            .replace(/https?:\/\/[^\s<>"]+/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ');

        // 3. CODE (4 à 6 chiffres)
        const codeRegex = /\b(\d{4,6})\b/g;
        let m;
        while ((m = codeRegex.exec(cleanText)) !== null) {
            return { type: 'CODE', value: m[1] };
        }

        return { type: 'NOT_FOUND' };
    }
}
