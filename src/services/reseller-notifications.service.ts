import "server-only";
import { db } from "@/db";
import { resellers, shopSettings } from "@/db/schema";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { eq } from "drizzle-orm";

/**
 * Service d'envoi de notifications WhatsApp aux resellers.
 *
 * Garde-fous :
 *   - Si shopSettings.whatsappApiUrl absent ou WHATSAPP_API_URL env vide → no-op
 *     (mode dev/test : on log + return success:false sans envoi réel)
 *   - Préférence reseller respectée : si notification_preferences[eventKey] === false → skip
 *     (clé absente → opt-in par défaut)
 *   - Tous les appels sont enveloppés en try/catch (jamais bloquer le flow business)
 *   - Format phone : 213XXXXXXXXX@c.us (normalisé par sendWhatsAppMessage)
 *
 * Templates centralisés ici pour éviter la duplication entre les call sites.
 */

interface ResellerNotificationContext {
    // Optional pour les events où le reseller n'existe pas encore (signup.rejected).
    // Si undefined → on bypass la vérification de prefs (toujours envoyé).
    resellerId?: number;
    companyName: string;
    contactPhone: string | null;
}

// Catalogue stable des events. Les clés sont utilisées :
//   - dans la table resellers.notification_preferences (JSONB)
//   - dans l'UI /reseller/settings/notifications (toggles)
export const RESELLER_NOTIF_EVENTS = {
    walletRecharged: "wallet.recharged",
    signupApproved: "signup.approved",
    signupRejected: "signup.rejected",
    orderConfirmed: "order.confirmed",
    orderCredentialsReady: "order.credentials.ready",
} as const;

export type ResellerNotifEventKey =
    (typeof RESELLER_NOTIF_EVENTS)[keyof typeof RESELLER_NOTIF_EVENTS];

export const RESELLER_NOTIF_EVENT_LABELS: Record<ResellerNotifEventKey, string> = {
    "wallet.recharged": "Recharge wallet confirmée",
    "signup.approved": "Compte partenaire activé",
    "signup.rejected": "Demande partenaire refusée",
    "order.confirmed": "Commande B2B confirmée",
    "order.credentials.ready": "Credentials prêtes après provisioning",
};

async function loadWhatsappSettings(): Promise<
    | {
          whatsappApiUrl: string;
          whatsappApiKey: string;
          whatsappInstanceName: string;
      }
    | null
> {
    const settings = await db.query.shopSettings.findFirst();
    if (!settings?.whatsappApiUrl || !settings.whatsappApiKey || !settings.whatsappInstanceName) {
        return null;
    }
    return {
        whatsappApiUrl: settings.whatsappApiUrl,
        whatsappApiKey: settings.whatsappApiKey,
        whatsappInstanceName: settings.whatsappInstanceName,
    };
}

/**
 * Vérifie si l'event WhatsApp est activé pour ce reseller.
 * Clé absente → true (opt-in par défaut).
 */
export async function isResellerNotifEnabled(
    resellerId: number,
    eventKey: ResellerNotifEventKey
): Promise<boolean> {
    try {
        const r = await db.query.resellers.findFirst({
            where: eq(resellers.id, resellerId),
            columns: { notificationPreferences: true },
        });
        const prefs = (r?.notificationPreferences ?? {}) as Record<string, boolean>;
        return prefs[eventKey] !== false;
    } catch (err) {
        // Si la lookup échoue, on autorise pour ne pas perdre une notif business.
        console.warn("[reseller-notif] prefs lookup failed:", err);
        return true;
    }
}

function formatCurrencyDzd(amount: number): string {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " DZD";
}

async function safeSend(
    resellerId: number | undefined,
    eventKey: ResellerNotifEventKey,
    phone: string | null | undefined,
    message: string
): Promise<{ delivered: boolean; reason?: string }> {
    if (!phone) return { delivered: false, reason: "Pas de téléphone reseller" };

    if (resellerId !== undefined) {
        const enabled = await isResellerNotifEnabled(resellerId, eventKey);
        if (!enabled) return { delivered: false, reason: "Désactivé par le reseller" };
    }

    const settings = await loadWhatsappSettings();
    if (!settings) {
        return { delivered: false, reason: "WhatsApp non configuré (shop_settings)" };
    }

    try {
        const res = await sendWhatsAppMessage(phone, message, settings);
        if (res.success) return { delivered: true };
        return { delivered: false, reason: res.error ?? "Échec WhatsApp" };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Exception WhatsApp";
        console.warn("[reseller-notif] safeSend error:", msg);
        return { delivered: false, reason: msg };
    }
}

export const ResellerNotifications = {
    /**
     * Confirmation de recharge wallet.
     * Envoyé après que adminRechargeWalletAction a credité le wallet.
     */
    async notifyWalletRecharged(
        ctx: ResellerNotificationContext & { previousBalance: number; newBalance: number; amount: number; method: string }
    ) {
        const methodLabel: Record<string, string> = {
            CASH: "espèces",
            CIB: "carte CIB",
            EDAHABIA: "carte Edahabia",
            BANK_TRANSFER: "virement bancaire",
            OTHER: "paiement",
        };
        const labelMethod = methodLabel[ctx.method] ?? ctx.method.toLowerCase();
        const message =
            `🟢 *${ctx.companyName}* — Recharge confirmée\n\n` +
            `Mode : ${labelMethod}\n` +
            `Montant ajouté : *+${formatCurrencyDzd(ctx.amount)}*\n` +
            `Nouveau solde : *${formatCurrencyDzd(ctx.newBalance)}*\n\n` +
            `Merci pour votre confiance.\n` +
            `_FLEXBOX DIRECT — partenaire B2B_`;
        return safeSend(ctx.resellerId, RESELLER_NOTIF_EVENTS.walletRecharged, ctx.contactPhone, message);
    },

    /**
     * Bienvenue post-approbation signup.
     */
    async notifySignupApproved(
        ctx: ResellerNotificationContext & { email: string; password: string; pin: string }
    ) {
        const message =
            `🎉 *${ctx.companyName}* — Compte partenaire activé\n\n` +
            `Email : ${ctx.email}\n` +
            `Mot de passe : *${ctx.password}*\n` +
            `PIN : *${ctx.pin}*\n\n` +
            `Connectez-vous sur le portail revendeur pour commencer à commander.\n\n` +
            `⚠️ *Gardez ce message confidentiel* — ces identifiants ne seront pas renvoyés.\n` +
            `_FLEXBOX DIRECT — partenaire B2B_`;
        return safeSend(ctx.resellerId, RESELLER_NOTIF_EVENTS.signupApproved, ctx.contactPhone, message);
    },

    /**
     * Notification de rejet de demande signup.
     */
    async notifySignupRejected(
        ctx: ResellerNotificationContext & { email: string; reason: string }
    ) {
        const message =
            `📋 *${ctx.companyName}* — Demande partenaire\n\n` +
            `Bonjour,\n\nNous avons étudié votre demande pour devenir partenaire B2B (${ctx.email}).\n\n` +
            `Malheureusement nous ne pouvons pas y donner suite pour la raison suivante :\n_${ctx.reason}_\n\n` +
            `N'hésitez pas à nous recontacter si votre situation évolue.\n` +
            `_FLEXBOX DIRECT_`;
        return safeSend(ctx.resellerId, RESELLER_NOTIF_EVENTS.signupRejected, ctx.contactPhone, message);
    },

    /**
     * Confirmation de commande B2B post-checkout.
     */
    async notifyOrderConfirmed(
        ctx: ResellerNotificationContext & {
            orderNumber: string;
            totalAmount: number;
            itemCount: number;
            hasInstantDelivery: boolean;
        }
    ) {
        const lines = [
            `🛒 *${ctx.companyName}* — Commande confirmée`,
            ``,
            `N° de commande : *${ctx.orderNumber}*`,
            `Articles : ${ctx.itemCount}`,
            `Total débité : *${formatCurrencyDzd(ctx.totalAmount)}*`,
            ``,
            ctx.hasInstantDelivery
                ? `⚡ Provisioning en cours — vous recevrez les credentials sous 1-2 min.`
                : `📦 Préparation en cours.`,
            ``,
            `Consulter sur le portail : /reseller/orders`,
            `_FLEXBOX DIRECT — partenaire B2B_`,
        ];
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.orderConfirmed,
            ctx.contactPhone,
            lines.join("\n")
        );
    },

    /**
     * Credentials prêtes après provisioning LoadBrain.
     */
    async notifyOrderCredentialsReady(
        ctx: ResellerNotificationContext & {
            orderNumber: string;
            credentialSummary?: string;
        }
    ) {
        const lines = [
            `✅ *${ctx.companyName}* — Credentials prêtes`,
            ``,
            `Commande : *${ctx.orderNumber}*`,
            ctx.credentialSummary ? `Aperçu : ${ctx.credentialSummary}` : ``,
            ``,
            `Accès complets sur le portail : /reseller/orders`,
            `Bouton "Envoyer au client" disponible.`,
            ``,
            `_FLEXBOX DIRECT — partenaire B2B_`,
        ].filter((l) => l !== "");
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.orderCredentialsReady,
            ctx.contactPhone,
            lines.join("\n")
        );
    },
};
