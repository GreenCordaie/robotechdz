import "server-only";
import { db } from "@/db";
import { resellers, shopSettings, notificationLogs } from "@/db/schema";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { eq } from "drizzle-orm";
import { loadAndRender } from "./notification-templates.service";

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

// Catalogue stable des events. Re-export depuis /lib pour que les Client
// Components puissent importer sans hériter du marker "server-only".
import {
    RESELLER_NOTIF_EVENTS,
    RESELLER_NOTIF_EVENT_LABELS,
    type ResellerNotifEventKey,
} from "@/lib/notification-events";
export { RESELLER_NOTIF_EVENTS, RESELLER_NOTIF_EVENT_LABELS, type ResellerNotifEventKey };

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

async function logNotification(
    resellerId: number | undefined,
    eventKey: ResellerNotifEventKey,
    phone: string | null | undefined,
    delivered: boolean,
    reason: string | null
): Promise<void> {
    try {
        await db.insert(notificationLogs).values({
            eventKey,
            channel: "whatsapp",
            resellerId: resellerId ?? null,
            contactPhone: phone ?? null,
            delivered,
            reason,
        });
    } catch (err) {
        console.warn("[reseller-notif] log insert failed (non-bloquant):", err);
    }
}

async function safeSend(
    resellerId: number | undefined,
    eventKey: ResellerNotifEventKey,
    phone: string | null | undefined,
    message: string
): Promise<{ delivered: boolean; reason?: string }> {
    if (!phone) {
        await logNotification(resellerId, eventKey, phone, false, "Pas de téléphone reseller");
        return { delivered: false, reason: "Pas de téléphone reseller" };
    }

    if (resellerId !== undefined) {
        const enabled = await isResellerNotifEnabled(resellerId, eventKey);
        if (!enabled) {
            await logNotification(resellerId, eventKey, phone, false, "Désactivé par le reseller");
            return { delivered: false, reason: "Désactivé par le reseller" };
        }
    }

    const settings = await loadWhatsappSettings();
    if (!settings) {
        await logNotification(resellerId, eventKey, phone, false, "WhatsApp non configuré (shop_settings)");
        return { delivered: false, reason: "WhatsApp non configuré (shop_settings)" };
    }

    try {
        const res = await sendWhatsAppMessage(phone, message, settings);
        if (res.success) {
            await logNotification(resellerId, eventKey, phone, true, null);
            return { delivered: true };
        }
        const reason = res.error ?? "Échec WhatsApp";
        await logNotification(resellerId, eventKey, phone, false, reason);
        return { delivered: false, reason };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Exception WhatsApp";
        console.warn("[reseller-notif] safeSend error:", msg);
        await logNotification(resellerId, eventKey, phone, false, msg);
        return { delivered: false, reason: msg };
    }
}

export const ResellerNotifications = {
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
        const message = await loadAndRender(RESELLER_NOTIF_EVENTS.walletRecharged, {
            companyName: ctx.companyName,
            methodLabel: methodLabel[ctx.method] ?? ctx.method.toLowerCase(),
            amount: formatCurrencyDzd(ctx.amount),
            newBalance: formatCurrencyDzd(ctx.newBalance),
        });
        return safeSend(ctx.resellerId, RESELLER_NOTIF_EVENTS.walletRecharged, ctx.contactPhone, message);
    },

    async notifySignupApproved(
        ctx: ResellerNotificationContext & { email: string; password: string; pin: string }
    ) {
        const message = await loadAndRender(RESELLER_NOTIF_EVENTS.signupApproved, {
            companyName: ctx.companyName,
            email: ctx.email,
            password: ctx.password,
            pin: ctx.pin,
        });
        return safeSend(ctx.resellerId, RESELLER_NOTIF_EVENTS.signupApproved, ctx.contactPhone, message);
    },

    async notifySignupRejected(
        ctx: ResellerNotificationContext & { email: string; reason: string }
    ) {
        const message = await loadAndRender(RESELLER_NOTIF_EVENTS.signupRejected, {
            companyName: ctx.companyName,
            email: ctx.email,
            reason: ctx.reason,
        });
        return safeSend(ctx.resellerId, RESELLER_NOTIF_EVENTS.signupRejected, ctx.contactPhone, message);
    },

    async notifyOrderConfirmed(
        ctx: ResellerNotificationContext & {
            orderNumber: string;
            totalAmount: number;
            itemCount: number;
            hasInstantDelivery: boolean;
        }
    ) {
        const message = await loadAndRender(RESELLER_NOTIF_EVENTS.orderConfirmed, {
            companyName: ctx.companyName,
            orderNumber: ctx.orderNumber,
            itemCount: ctx.itemCount,
            totalAmount: formatCurrencyDzd(ctx.totalAmount),
            deliveryStatus: ctx.hasInstantDelivery
                ? "⚡ Provisioning en cours — vous recevrez les credentials sous 1-2 min."
                : "📦 Préparation en cours.",
        });
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.orderConfirmed,
            ctx.contactPhone,
            message
        );
    },

    async notifyOrderCredentialsReady(
        ctx: ResellerNotificationContext & {
            orderNumber: string;
            credentialSummary?: string;
        }
    ) {
        const message = await loadAndRender(RESELLER_NOTIF_EVENTS.orderCredentialsReady, {
            companyName: ctx.companyName,
            orderNumber: ctx.orderNumber,
            credentialSummary: ctx.credentialSummary ? `Aperçu : ${ctx.credentialSummary}` : "",
        });
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.orderCredentialsReady,
            ctx.contactPhone,
            message
        );
    },
};
