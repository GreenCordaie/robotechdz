import { MicrosoftGraphService } from './microsoft-graph.service';

export interface ResolverResult {
    type: 'CODE' | 'LINK' | 'NOT_FOUND' | 'ERROR';
    value?: string;
    attempts: number;
    error?: string;
}

export class NetflixResolverService {
    /**
     * Résout le code/lien Netflix pour un compte donné via Microsoft Graph API.
     * @param digitalCodeId Si fourni, permet la rotation automatique du refresh_token.
     */
    static async resolve(
        netflixEmail: string,
        msRefreshToken?: string | null,
        msClientId?: string | null,
        digitalCodeId?: number
    ): Promise<ResolverResult> {
        if (!msRefreshToken) {
            console.warn(`[NetflixResolver] Aucun Refresh Token Graph pour ${netflixEmail}. Résolution impossible (Graph non configuré).`);
            return { type: 'NOT_FOUND', attempts: 1, error: 'Graph not configured for this account' };
        }

        console.log(`[NetflixResolver] Utilisation de MICROSOFT GRAPH NATIVE pour ${netflixEmail} (Client: ${msClientId || 'default'})`);

        try {
            const email = await MicrosoftGraphService.getLatestNetflixEmail(
                msRefreshToken,
                msClientId || undefined,
                digitalCodeId
            );

            if (!email) {
                console.warn(`[NetflixResolver] Aucun email Netflix récent trouvé via Graph.`);
                return { type: 'NOT_FOUND', attempts: 1 };
            }

            console.log(`[NetflixResolver] Email trouvé: ${email.subject} (${email.receivedDateTime})`);

            const result = MicrosoftGraphService.extractNetflixData(email.body.content);

            if (result.type !== 'NOT_FOUND') {
                return {
                    type: result.type,
                    value: result.value,
                    attempts: 1
                };
            }

            return { type: 'NOT_FOUND', attempts: 1 };

        } catch (error: any) {
            console.error(`[NetflixResolver] Graph Native Error: ${error.message}`);
            return { type: 'ERROR', error: error.message, attempts: 1 };
        }
    }
}
