/**
 * Client-side shapes mirroring the wallet server actions' return data.
 */

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

export const SOURCE_LABELS: Record<string, string> = {
    BSV: "BSV",
    G2BULK: "G2Bulk",
    IPTV: "IPTV",
    ACTIVE_CODE: "Active Code",
    MANUAL: "Manuel",
    ADMIN_RECHARGE: "Recharge admin",
    UPSTREAM_REFUND: "Remboursement upstream",
    LEGACY: "Legacy",
};

export const TX_TYPE_LABELS: Record<string, string> = {
    PURCHASE: "Achats",
    RECHARGE: "Recharges",
    REFUND: "Remboursements",
};
