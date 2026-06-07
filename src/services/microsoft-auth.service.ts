import { db } from "@/db";
import { digitalCodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";

export interface MicrosoftTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    ext_expires_in: number;
    token_type: string;
}

export class MicrosoftAuthService {
    private static readonly REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`;
    // User.Read is required for the callback's /me lookup that captures the
    // mailbox address into ms_account_email — without it /me returns 403 and
    // the streaming watcher skips the account (pollAccount guards on a
    // non-empty ms_account_email).
    private static readonly SCOPES = "offline_access Mail.Read User.Read";

    /**
     * Récupère les credentials Microsoft depuis les paramètres de la boutique ou l'env.
     */
    private static async getCredentials(explicitClientId?: string) {
        const { SystemQueries } = await import("./queries/system.queries");
        const settings = await SystemQueries.getSettings();

        // 1. Si un ID explicite est passé (ex: depuis la DB), on l'utilise
        if (explicitClientId) {
            // On cherche le secret correspondant
            // Si c'est le client par défaut
            const defaultClientId = settings?.microsoftClientId || process.env.MICROSOFT_CLIENT_ID || "72e03be8-0a78-4e03-8e47-ee2bb1600a09";
            if (explicitClientId === defaultClientId) {
                return {
                    clientId: explicitClientId,
                    clientSecret: settings?.microsoftClientSecret || process.env.MICROSOFT_CLIENT_SECRET || "",
                    tenantId: settings?.microsoftTenantId || "consumers"
                };
            }

            // Si c'est le client n°2
            if (explicitClientId === process.env.MICROSOFT_CLIENT_ID_2) {
                return {
                    clientId: explicitClientId,
                    clientSecret: process.env.MICROSOFT_CLIENT_SECRET_2 || "",
                    tenantId: "consumers"
                };
            }

            // Fallback si c'est un autre client (peut-être ajouté plus tard en settings)
            return {
                clientId: explicitClientId,
                clientSecret: settings?.microsoftClientSecret || process.env.MICROSOFT_CLIENT_SECRET || "",
                tenantId: settings?.microsoftTenantId || "consumers"
            };
        }

        // 2. Comportement par défaut pour la liaison initiale
        const clientId = settings?.microsoftClientId || process.env.MICROSOFT_CLIENT_ID || "72e03be8-0a78-4e03-8e47-ee2bb1600a09";
        const clientSecret = settings?.microsoftClientSecret || process.env.MICROSOFT_CLIENT_SECRET || "";
        const tenantId = settings?.microsoftTenantId || "consumers";

        return { clientId, clientSecret, tenantId };
    }

    /**
     * Génère l'URL pour la demande d'autorisation Microsoft.
     * @param codeId L'ID du compte digital_code à lier (passé en 'state')
     * @param explicitClientId Permet de forcer une application spécifique
     */
    static async getAuthorizationUrl(codeId: number, explicitClientId?: string): Promise<string> {
        const { clientId, tenantId } = await this.getCredentials(explicitClientId);

        // On encode l'ID et possiblement le client ID dans le state
        const stateValue = explicitClientId ? `${codeId}:${explicitClientId}` : String(codeId);

        const params = new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            redirect_uri: this.REDIRECT_URI,
            response_mode: "query",
            scope: this.SCOPES,
            state: stateValue,
            prompt: "select_account"
        });
        return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    }

    /**
     * Échange le code d'autorisation contre un refresh_token.
     * @param code Code reçu de Microsoft
     * @param explicitClientId Le client ID utilisé pour l'auth
     */
    static async exchangeCodeForTokens(code: string, explicitClientId?: string): Promise<MicrosoftTokenResponse> {
        const { clientId, clientSecret, tenantId } = await this.getCredentials(explicitClientId);

        const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: this.REDIRECT_URI,
                grant_type: "authorization_code",
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Erreur échange token: ${err}`);
        }

        return await response.json();
    }

    /**
     * Rafraîchit un access_token pour une résolution immédiate.
     * Si digitalCodeId est fourni, sauvegarde le nouveau refresh_token si Microsoft en retourne un (rotation).
     */
    static async refreshAccessToken(
        encryptedRefreshToken: string,
        msClientId?: string,
        digitalCodeId?: number
    ): Promise<string> {
        const { clientId, clientSecret, tenantId } = await this.getCredentials(msClientId || undefined);

        const refreshToken = decrypt(encryptedRefreshToken);
        if (!refreshToken) throw new Error("Impossible de décoder le refresh token.");

        const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
                scope: "https://graph.microsoft.com/Mail.Read offline_access"
            }),
        });

        const data = await response.json();
        if (!data.access_token) throw new Error("Échec rafraîchissement token.");

        // Rotation du refresh_token : si Microsoft retourne un nouveau token, le sauvegarder
        if (data.refresh_token && digitalCodeId) {
            await db.update(digitalCodes)
                .set({
                    msRefreshToken: encrypt(data.refresh_token),
                    msLastSync: new Date()
                })
                .where(eq(digitalCodes.id, digitalCodeId))
                .catch((err) => console.warn(`[MsAuth] Token rotation save failed for code ${digitalCodeId}:`, err));
        }

        return data.access_token;
    }

    /**
     * Enregistre le refresh_token pour un compte.
     */
    static async saveRefreshToken(codeId: number, refreshToken: string, accountEmail?: string, clientId?: string) {
        await db.update(digitalCodes)
            .set({
                msRefreshToken: encrypt(refreshToken),
                msStatus: 'CONNECTED',
                msAccountEmail: accountEmail,
                msClientId: clientId || null,
                msLastSync: new Date()
            })
            .where(eq(digitalCodes.id, codeId));
    }
}
