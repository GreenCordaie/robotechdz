import "server-only";
import { db } from "@/db";
import { resellers, resellerWallets, shopSettings, notificationLogs } from "@/db/schema";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { eq } from "drizzle-orm";
import { loadAndRender } from "./notification-templates.service";
import { sendViaLoadBrain, loadLoadBrainWhatsappConfig } from "@/lib/loadbrain-whatsapp";

type NotifVars = Record<string, string | number | undefined>;

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

/**
 * Send a reseller notification.
 *
 * Primary path: LoadBrain's centralized WhatsApp module (single template store
 * + WAHA delivery + audit). We pass `templateKey` (= eventKey) + `vars` and
 * LoadBrain renders. Fallback path: the local WAHA (`sendWhatsAppMessage`) with
 * the boutique-side template, so a LoadBrain outage never drops a business
 * notification. Reseller opt-out + logging apply to both paths.
 */
async function safeSend(
    resellerId: number | undefined,
    eventKey: ResellerNotifEventKey,
    phone: string | null | undefined,
    vars: NotifVars,
    opts?: { locale?: string; idempotencyKey?: string }
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

    const locale = opts?.locale ?? "fr";

    // Primary: centralized LoadBrain WhatsApp module.
    const lbConfig = loadLoadBrainWhatsappConfig();
    if (lbConfig) {
        const res = await sendViaLoadBrain(
            { recipientPhone: phone, templateKey: eventKey, locale, vars, idempotencyKey: opts?.idempotencyKey },
            lbConfig
        );
        if (res.ok) {
            await logNotification(resellerId, eventKey, phone, true, null);
            return { delivered: true };
        }
        console.warn(`[reseller-notif] LoadBrain send failed (${res.error}) — falling back to local WAHA`);
    }

    // Fallback: local WAHA, rendering the boutique-side template.
    const settings = await loadWhatsappSettings();
    if (!settings) {
        await logNotification(resellerId, eventKey, phone, false, "WhatsApp non configuré (LoadBrain KO + shop_settings vide)");
        return { delivered: false, reason: "WhatsApp non configuré" };
    }

    try {
        const message = await loadAndRender(eventKey, vars);
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
        console.warn("[reseller-notif] safeSend fallback error:", msg);
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
        return safeSend(ctx.resellerId, RESELLER_NOTIF_EVENTS.walletRecharged, ctx.contactPhone, {
            companyName: ctx.companyName,
            methodLabel: methodLabel[ctx.method] ?? ctx.method.toLowerCase(),
            amount: formatCurrencyDzd(ctx.amount),
            newBalance: formatCurrencyDzd(ctx.newBalance),
        });
    },

    async notifySignupApproved(
        ctx: ResellerNotificationContext & { email: string; password: string; pin: string }
    ) {
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.signupApproved,
            ctx.contactPhone,
            {
                companyName: ctx.companyName,
                email: ctx.email,
                password: ctx.password,
                pin: ctx.pin,
            },
            { idempotencyKey: `signup.approved:${ctx.email}` }
        );
    },

    async notifySignupRejected(
        ctx: ResellerNotificationContext & { email: string; reason: string }
    ) {
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.signupRejected,
            ctx.contactPhone,
            {
                companyName: ctx.companyName,
                email: ctx.email,
                reason: ctx.reason,
            },
            { idempotencyKey: `signup.rejected:${ctx.email}` }
        );
    },

    async notifyOrderConfirmed(
        ctx: ResellerNotificationContext & {
            orderNumber: string;
            totalAmount: number;
            itemCount: number;
            hasInstantDelivery: boolean;
        }
    ) {
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.orderConfirmed,
            ctx.contactPhone,
            {
                companyName: ctx.companyName,
                orderNumber: ctx.orderNumber,
                itemCount: ctx.itemCount,
                totalAmount: formatCurrencyDzd(ctx.totalAmount),
                deliveryStatus: ctx.hasInstantDelivery
                    ? "⚡ Provisioning en cours — vous recevrez les credentials sous 1-2 min."
                    : "📦 Préparation en cours.",
            },
            { idempotencyKey: `order.confirmed:${ctx.orderNumber}` }
        );
    },

    async notifyOrderCredentialsReady(
        ctx: ResellerNotificationContext & {
            orderNumber: string;
            credentialSummary?: string;
        }
    ) {
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.orderCredentialsReady,
            ctx.contactPhone,
            {
                companyName: ctx.companyName,
                orderNumber: ctx.orderNumber,
                credentialSummary: ctx.credentialSummary ? `Aperçu : ${ctx.credentialSummary}` : "",
            },
            { idempotencyKey: `order.credentials.ready:${ctx.orderNumber}` }
        );
    },

    async notifyWalletLowBalance(
        ctx: ResellerNotificationContext & { balance: number; threshold: number }
    ) {
        return safeSend(ctx.resellerId, RESELLER_NOTIF_EVENTS.walletLowBalance, ctx.contactPhone, {
            companyName: ctx.companyName,
            balance: formatCurrencyDzd(ctx.balance),
            threshold: formatCurrencyDzd(ctx.threshold),
        });
    },

    async notifySupportReply(
        ctx: ResellerNotificationContext & { ticketRef: string; preview: string }
    ) {
        return safeSend(
            ctx.resellerId,
            RESELLER_NOTIF_EVENTS.supportReply,
            ctx.contactPhone,
            {
                companyName: ctx.companyName,
                ticketRef: ctx.ticketRef,
                preview: ctx.preview,
            },
            { idempotencyKey: `support.reply:${ctx.ticketRef}` }
        );
    },
};

/**
 * Edge-triggered low-balance alert, called right after a wallet debit.
 *
 * Reads the reseller's own threshold (`resellers.lowBalanceThreshold`; NULL or
 * <= 0 = opt-out) and the fresh post-debit balance, so call sites only pass the
 * debit amount. Fires `wallet.low_balance` exactly once on the debit that
 * crosses the wallet below the threshold (not on every order while below).
 * Never throws — safe to call fire-and-forget.
 */
export async function notifyLowBalanceAfterDebit(
    reseller: { id: number; companyName: string; contactPhone: string | null },
    debitAmountDzd: number
): Promise<void> {
    try {
        const [r, w] = await Promise.all([
            db.query.resellers.findFirst({
                where: eq(resellers.id, reseller.id),
                columns: { lowBalanceThreshold: true },
            }),
            db.query.resellerWallets.findFirst({
                where: eq(resellerWallets.resellerId, reseller.id),
                columns: { balance: true },
            }),
        ]);

        const threshold = r?.lowBalanceThreshold ? Number(r.lowBalanceThreshold) : 0;
        if (!Number.isFinite(threshold) || threshold <= 0) return;

        const newBalance = Number(w?.balance ?? "0");
        const prevBalance = newBalance + debitAmountDzd;

        // Edge: only when this debit took us from >= threshold to < threshold.
        if (prevBalance >= threshold && newBalance < threshold) {
            await ResellerNotifications.notifyWalletLowBalance({
                resellerId: reseller.id,
                companyName: reseller.companyName,
                contactPhone: reseller.contactPhone,
                balance: newBalance,
                threshold,
            });
        }
    } catch (err) {
        console.warn("[reseller-notif] low-balance check failed:", err);
    }
}
