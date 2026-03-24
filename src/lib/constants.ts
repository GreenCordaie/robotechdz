/**
 * Centralized System Constants & Enums
 * Prevents magic strings and ensures type safety across the application.
 */

export enum OrderStatus {
    EN_ATTENTE = "EN_ATTENTE",
    PAYE = "PAYE",
    LIVRE = "LIVRE",
    TERMINE = "TERMINE",
    ANNULE = "ANNULE",
    PARTIEL = "PARTIEL",
    NON_PAYE = "NON_PAYE",
    REMBOURSE = "REMBOURSE"
}

export enum UserRole {
    ADMIN = "ADMIN",
    SUPER_ADMIN = "SUPER_ADMIN",
    CAISSIER = "CAISSIER",
    TRAITEUR = "TRAITEUR",
    RESELLER = "RESELLER"
}

export enum DeliveryMethod {
    TICKET = "TICKET",
    WHATSAPP = "WHATSAPP"
}

export enum DigitalCodeStatus {
    DISPONIBLE = "DISPONIBLE",
    VENDU = "VENDU",
    UTILISE = "UTILISE",
    DEFECTUEUX = "DEFECTUEUX",
    EXPIRE = "EXPIRE"
}

export enum DigitalCodeSlotStatus {
    DISPONIBLE = "DISPONIBLE",
    VENDU = "VENDU",
    DEFECTUEUX = "DEFECTUEUX",
    EXPIRE = "EXPIRE"
}

export enum SupplierTransactionType {
    RECHARGE = "RECHARGE",
    AJUSTEMENT = "AJUSTEMENT",
    ACHAT_STOCK = "ACHAT_STOCK",
    DEBIT = "DEBIT"
}

export enum OrderSource {
    KIOSK = "KIOSK",
    B2B_WEB = "B2B_WEB",
    API = "API"
}

export enum ProductStatus {
    ACTIVE = "ACTIVE",
    ARCHIVED = "ARCHIVED"
}

export enum ClientActionType {
    ACOMPTE = "ACOMPTE",
    REMBOURSEMENT = "REMBOURSEMENT",
    RETOUR = "RETOUR"
}

export type ReturnRequestStatus = "EN_ATTENTE" | "APPROUVE" | "REJETE";
export type RemboursementType = "ESPECES" | "CREDIT_WALLET";

export interface ReturnRequest {
    motif: string;
    typeRemboursement: RemboursementType;
    montant: number;
    status: ReturnRequestStatus;
    initiatedBy: number;
    initiatedAt: string;
    previousOrderStatus: string;
    approvedBy?: number;
    approvedAt?: string;
    rejectedBy?: number;
    rejectedAt?: string;
    motifRejet?: string;
}
