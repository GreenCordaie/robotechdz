import { MicrosoftAuthService } from "./microsoft-auth.service";
import { isNetflixHouseholdUrl, isNetflixSenderAddress } from "@/lib/netflix-url";

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

            // Strict sender check: only genuine *.netflix.com senders. A loose
            // substring match on the address or subject (the old behaviour) let
            // an attacker drop a crafted "netflix" email into the watched mailbox
            // and have its body parsed for a (malicious) household link.
            const isNetflixEmail = (m: GraphEmail) =>
                isNetflixSenderAddress(m.from?.emailAddress?.address);

            // Dossiers à scanner : inbox + junkemail (spam) + deleteditems
            const folders = ['inbox', 'junkemail', 'deleteditems'];
            const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h

            for (const folder of folders) {
                try {
                    const url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$orderby=receivedDateTime desc&$top=30&$select=id,subject,receivedDateTime,from,body`;
                    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });

                    if (!res.ok) {
                        console.warn(`[GraphService] Folder ${folder} error: ${res.status}`);
                        continue;
                    }

                    const data = await res.json();
                    const messages = (data.value as GraphEmail[]) || [];
                    console.log(`[GraphService] Folder "${folder}": ${messages.length} emails`);

                    const match = messages.find(isNetflixEmail);
                    if (match) {
                        console.log(`[GraphService] Email Netflix trouvé dans "${folder}": ${match.subject} (${match.receivedDateTime})`);
                        return match;
                    }
                } catch (e: any) {
                    console.warn(`[GraphService] Folder ${folder} exception: ${e.message}`);
                }
            }

            // Dernier recours : /me/messages global (tous dossiers confondus)
            const globalRes = await fetch(
                "https://graph.microsoft.com/v1.0/me/messages?$orderby=receivedDateTime desc&$top=50&$select=id,subject,receivedDateTime,from,body",
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            if (!globalRes.ok) {
                console.error(`[GraphService] Global fallback échoué: ${globalRes.status}`);
                return null;
            }

            const globalData = await globalRes.json();
            const globalMessages = (globalData.value as GraphEmail[]) || [];
            console.log(`[GraphService] Global fallback: ${globalMessages.length} emails scannés`);

            const globalMatch = globalMessages.find(isNetflixEmail);
            if (globalMatch) {
                console.log(`[GraphService] Email Netflix trouvé (global): ${globalMatch.subject}`);
            } else {
                console.warn(`[GraphService] Aucun email Netflix trouvé dans tous les dossiers`);
            }

            return globalMatch || null;
        } catch (error: any) {
            console.error(`[GraphService] Exception: ${error.message}`);
            return null;
        }
    }

    /**
     * Extrait le code ou le lien de foyer depuis le corps de l'email.
     */
    static extractNetflixData(content: string): { type: 'CODE' | 'LINK' | 'NOT_FOUND', value?: string } {
        // 1. LIEN Foyer (update-household, verify, ilum, approuver, manage-household)
        const linkRegex = /https:\/\/www\.netflix\.com[^\s"<>]*(?:update-household|manage-household|verify|ilum|approuver|signin)[^\s"<>]*/i;
        const linkMatch = content.match(linkRegex);
        if (linkMatch) {
            const value = linkMatch[0].replace(/&amp;/g, '&');
            // The regex anchors on a www.netflix.com PREFIX only, so userinfo
            // (www.netflix.com@evil.com) or subdomain (www.netflix.com.evil.com)
            // confusion would slip a non-Netflix host through to the auto-approve
            // click and the customer's href. Parse + verify the real host.
            if (isNetflixHouseholdUrl(value)) {
                return { type: 'LINK', value };
            }
            // Not a real Netflix host → ignore the link, fall through to code
            // detection below.
        }

        // 2. Code affiché avec espaces entre chiffres : "1 2 3 4" → "1234"
        const spacedCodeRegex = /\b(\d)\s(\d)\s(\d)\s(\d)\b/;
        const spacedMatch = content.match(spacedCodeRegex);
        if (spacedMatch) {
            return { type: 'CODE', value: `${spacedMatch[1]}${spacedMatch[2]}${spacedMatch[3]}${spacedMatch[4]}` };
        }

        // 3. Nettoyage HTML
        const cleanText = content
            .replace(/https?:\/\/[^\s<>"']+/g, ' ')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ');

        // 4. CODE 4 chiffres — exclure années (2020-2030) et faux positifs
        const codeRegex = /\b(\d{4,6})\b/g;
        let m;
        while ((m = codeRegex.exec(cleanText)) !== null) {
            const num = parseInt(m[1], 10);
            if (num >= 2020 && num <= 2030) continue; // skip années
            if (m[1].length === 4) return { type: 'CODE', value: m[1] };
        }

        // 5. Dernier recours : code 5-6 chiffres
        const codeRegex2 = /\b(\d{5,6})\b/g;
        while ((m = codeRegex2.exec(cleanText)) !== null) {
            return { type: 'CODE', value: m[1] };
        }

        return { type: 'NOT_FOUND' };
    }
}
