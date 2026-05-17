/**
 * Catalogue des event keys pour notifications reseller.
 *
 * Extrait dans /lib (sans "server-only") pour pouvoir être importé depuis
 * des Client Components (ex: UI admin /admin/settings/notifications/logs).
 *
 * Le service reseller-notifications.service.ts (server-only) ré-exporte
 * ces constantes pour ne pas dupliquer les imports.
 */

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
