import "server-only";
import { db } from "@/db";
import { notificationTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Templates de notifications éditables par l'admin.
 *
 * Si une row DB existe pour `eventKey` → on prend son body.
 * Sinon → on retombe sur le default hardcodé (ce fichier).
 *
 * Variables remplacées : {{key}} → vars[key] (string vide si manquant).
 * Cohérent avec les call sites des notifications service.
 */

export const TEMPLATE_DEFAULTS: Record<string, string> = {
    "wallet.recharged":
        "🟢 *{{companyName}}* — Recharge confirmée\n\n" +
        "Mode : {{methodLabel}}\n" +
        "Montant ajouté : *+{{amount}}*\n" +
        "Nouveau solde : *{{newBalance}}*\n\n" +
        "Merci pour votre confiance.\n" +
        "_FLEXBOX DIRECT — partenaire B2B_",

    "signup.approved":
        "🎉 *{{companyName}}* — Compte partenaire activé\n\n" +
        "Email : {{email}}\n" +
        "Mot de passe : *{{password}}*\n" +
        "PIN : *{{pin}}*\n\n" +
        "Connectez-vous sur le portail revendeur pour commencer à commander.\n\n" +
        "⚠️ *Gardez ce message confidentiel* — ces identifiants ne seront pas renvoyés.\n" +
        "_FLEXBOX DIRECT — partenaire B2B_",

    "signup.rejected":
        "📋 *{{companyName}}* — Demande partenaire\n\n" +
        "Bonjour,\n\nNous avons étudié votre demande pour devenir partenaire B2B ({{email}}).\n\n" +
        "Malheureusement nous ne pouvons pas y donner suite pour la raison suivante :\n_{{reason}}_\n\n" +
        "N'hésitez pas à nous recontacter si votre situation évolue.\n" +
        "_FLEXBOX DIRECT_",

    "order.confirmed":
        "🛒 *{{companyName}}* — Commande confirmée\n\n" +
        "N° de commande : *{{orderNumber}}*\n" +
        "Articles : {{itemCount}}\n" +
        "Total débité : *{{totalAmount}}*\n\n" +
        "{{deliveryStatus}}\n\n" +
        "Consulter sur le portail : /reseller/orders\n" +
        "_FLEXBOX DIRECT — partenaire B2B_",

    "order.credentials.ready":
        "✅ *{{companyName}}* — Credentials prêtes\n\n" +
        "Commande : *{{orderNumber}}*\n" +
        "{{credentialSummary}}\n\n" +
        "Accès complets sur le portail : /reseller/orders\n" +
        "Bouton \"Envoyer au client\" disponible.\n\n" +
        "_FLEXBOX DIRECT — partenaire B2B_",

    "streaming.netflix.delivered":
        "🎬 *{{brandName}}* — Tes accès\n\n" +
        "📧 Email : {{accountEmail}}\n" +
        "🔑 Mot de passe : *{{accountPassword}}*\n" +
        "👤 Profil : {{profileName}}\n" +
        "🔢 PIN : *{{profilePin}}*\n\n" +
        "📺 Sur ta TV, connecte-toi puis tape ce lien quand Netflix demande un code :\n" +
        "👉 {{activationUrl}}\n" +
        "{{extraMemberHint}}",

    "streaming.household.update_required":
        "⚠️ *{{brandName}}* — Mise à jour du foyer Netflix\n\n" +
        "Netflix demande de valider le foyer pour continuer à regarder.\n\n" +
        "Ouvre ce lien sur ton *téléphone en 4G/5G* (pas en Wi-Fi) :\n" +
        "👉 {{activationUrl}}\n\n" +
        "Le bouton de mise à jour s'affichera automatiquement.\n" +
        "_FLEXBOX DIRECT_",
};

/**
 * Variables disponibles par event — utilisées pour l'aide UI admin.
 */
export const TEMPLATE_VARIABLES: Record<string, string[]> = {
    "wallet.recharged": ["companyName", "methodLabel", "amount", "newBalance"],
    "signup.approved": ["companyName", "email", "password", "pin"],
    "signup.rejected": ["companyName", "email", "reason"],
    "order.confirmed": ["companyName", "orderNumber", "itemCount", "totalAmount", "deliveryStatus"],
    "order.credentials.ready": ["companyName", "orderNumber", "credentialSummary"],
    "streaming.netflix.delivered": [
        "brandName",
        "accountEmail",
        "accountPassword",
        "profileName",
        "profilePin",
        "activationUrl",
        "extraMemberHint",
    ],
    "streaming.household.update_required": ["brandName", "activationUrl"],
};

const TEMPLATE_LABELS: Record<string, string> = {
    "wallet.recharged": "Recharge wallet confirmée",
    "signup.approved": "Compte partenaire activé",
    "signup.rejected": "Demande partenaire refusée",
    "order.confirmed": "Commande B2B confirmée",
    "order.credentials.ready": "Credentials prêtes après provisioning",
    "streaming.netflix.delivered": "Streaming — Netflix livré avec deeplink",
    "streaming.household.update_required": "Streaming — Mise à jour foyer Netflix (push proactif)",
};

export function getTemplateLabel(eventKey: string): string {
    return TEMPLATE_LABELS[eventKey] ?? eventKey;
}

/**
 * Charge le template effectif pour un event :
 *   1. Row DB si présente
 *   2. Default hardcodé sinon
 *   3. Vide si event inconnu
 */
export async function loadTemplate(eventKey: string): Promise<string> {
    try {
        const row = await db.query.notificationTemplates.findFirst({
            where: eq(notificationTemplates.eventKey, eventKey),
        });
        if (row?.body) return row.body;
    } catch (err) {
        console.warn("[notif-templates] DB lookup failed:", err);
    }
    return TEMPLATE_DEFAULTS[eventKey] ?? "";
}

/**
 * Remplace {{key}} par vars[key] (string vide si manquant).
 * Pas d'expressions, pas de conditions — KISS.
 */
export function renderTemplate(template: string, vars: Record<string, string | number | undefined>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
        const v = vars[key];
        return v === undefined || v === null ? "" : String(v);
    });
}

/**
 * Helper combiné load + render — utilisé par reseller-notifications.service.
 * Si le rendu produit une chaîne entièrement vide → fallback default
 * (sécurité contre un template vidé par erreur).
 */
export async function loadAndRender(
    eventKey: string,
    vars: Record<string, string | number | undefined>
): Promise<string> {
    const template = await loadTemplate(eventKey);
    const rendered = renderTemplate(template, vars).trim();
    if (rendered) return rendered;
    return renderTemplate(TEMPLATE_DEFAULTS[eventKey] ?? "", vars);
}
