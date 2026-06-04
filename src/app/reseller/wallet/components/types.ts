/**
 * Client-side shapes mirroring the wallet server actions' return data.
 */

// Source / type literals. These MUST live in this client-safe module (not in
// the "use server" actions file): exporting a const array from a "use server"
// module turns it into a server *reference* when imported by a client
// component, so `TX_SOURCES.filter(...)` would throw "filter is not a function"
// at render/prerender. The actions file imports these from here for its zod
// schemas.
export const TX_TYPES = ["PURCHASE", "RECHARGE", "REFUND"] as const;
export type TxType = (typeof TX_TYPES)[number];

export const TX_SOURCES = [
    "BSV",
    "G2BULK",
    "IPTV",
    "ACTIVE_CODE",
    "MANUAL",
    "ADMIN_RECHARGE",
    "UPSTREAM_REFUND",
    "LEGACY",
] as const;
export type TxSource = (typeof TX_SOURCES)[number];

export const ORDER_KINDS = [
    "bsv",
    "g2bulk",
    // Reseller-facing merged family — hides the BSV vs G2Bulk supplier split.
    "giftcards",
    "iptv",
    "active",
    "manual",
    "legacy",
    "all",
] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

export interface OverviewData {
    reseller: { id: number; companyName: string; contactPhone: string | null };
    wallet: {
        id: number;
        balance: string;
        totalSpent: string | null;
        updatedAt: Date | string | null;
    } | null;
    tier: {
        id: number;
        name: string;
        discountPct: string;
        minMonthlyVolumeDzd: string;
        color: string | null;
        rank: number;
    } | null;
    nextTier: OverviewData["tier"] | null;
    monthlyVolume: number;
    monthlyPurchaseCount: number;
    monthlyRefundCount: number;
    lastRechargeAt: Date | string | null;
    lastRechargeAmount: number | null;
    lowBalanceThreshold: number | null;
    notificationPreferences: {
        walletRecharged: boolean;
        walletLowBalance: boolean;
    };
}

export interface TxRow {
    id: number;
    walletId: number;
    type: string;
    amount: string;
    description: string | null;
    source: string | null;
    orderId: number | null;
    createdAt: Date | string | null;
}

export type TabKey = "activity" | "orders" | "stats" | "settings";

export const TAB_KEYS: ReadonlyArray<TabKey> = ["activity", "orders", "stats", "settings"];

export function isTabKey(v: string | null): v is TabKey {
    return v !== null && (TAB_KEYS as readonly string[]).includes(v);
}

// Supplier identities (BSV, G2Bulk) are CONFIDENTIAL — resellers must never
// see them. Both upstream giftcard/voucher suppliers are surfaced under a
// single neutral product-family label.
export const SOURCE_LABELS: Record<string, string> = {
    BSV: "Cartes & Vouchers",
    G2BULK: "Cartes & Vouchers",
    IPTV: "IPTV",
    ACTIVE_CODE: "Active Code",
    MANUAL: "Manuel",
    ADMIN_RECHARGE: "Recharge admin",
    UPSTREAM_REFUND: "Remboursement",
    LEGACY: "Legacy",
};

// Order-kind → customer-facing label. `bsv`/`g2bulk` collapse to the same
// neutral family as `giftcards` so the supplier split is invisible.
export const KIND_LABELS: Record<string, string> = {
    all: "Toutes",
    giftcards: "Cartes & Vouchers",
    bsv: "Cartes & Vouchers",
    g2bulk: "Cartes & Vouchers",
    iptv: "IPTV",
    active: "Active Code",
    manual: "Manuel",
    legacy: "Legacy",
};

// Strip supplier names from any free-text shown to resellers. Covers
// historical transaction descriptions like "Achat BSV - B2B-123" that were
// stored before the labels were neutralized (admin still sees the raw source
// column; only the reseller-facing render is sanitized).
export function sanitizeSupplierText(text: string | null | undefined): string {
    if (!text) return "";
    return text
        .replace(/\bg2\s*bulk\b/gi, "Cartes & Vouchers")
        .replace(/\bbsv\b/gi, "Cartes & Vouchers")
        .replace(/\bbuysellvoucher\b/gi, "Cartes & Vouchers");
}

export const TX_TYPE_LABELS: Record<string, string> = {
    PURCHASE: "Achats",
    RECHARGE: "Recharges",
    REFUND: "Remboursements",
};
