"use server";

/**
 * Reseller Wallet — unified finance hub server actions.
 *
 * Three façades cover the new /reseller/wallet page (overview hero,
 * paged activity timeline, multi-source orders tab) without touching
 * the existing per-flow actions (BSV, G2Bulk, IPTV, Active Code, Manual,
 * legacy B2B) — they're dispatched to as-is.
 */

import { and, eq, desc, sql, gte, lte, ilike, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
    resellers,
    resellerWallets,
    resellerTransactions,
    orders,
    activeCodeOrders,
    manualOrders,
} from "@/db/schema";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { TierService } from "@/services/tier.service";
// Source / type literals live in the client-safe components/types module —
// a "use server" file must not export const arrays (they'd become server
// references in client components). See the note there.
import {
    TX_TYPES,
    TX_SOURCES,
    ORDER_KINDS,
    type TxType,
    type TxSource,
    type OrderKind,
} from "./components/types";

// ──────────────────────────────────────────────────────────────────────
// 1) getResellerWalletOverviewAction — single fetch at mount
// ──────────────────────────────────────────────────────────────────────

export const getResellerWalletOverviewAction = withAuth(
    { roles: [UserRole.RESELLER] },
    async (_, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
                with: { wallet: true, tier: true },
            });
            if (!reseller) {
                return { success: false as const, error: "Compte revendeur introuvable" };
            }
            const wallet = reseller.wallet ?? null;

            const effectiveTier = reseller.tier ?? (await TierService.getDefaultTier());
            const monthlyVolume = await TierService.getMonthlyPurchaseVolume(reseller.id);
            const allTiers = await TierService.listAll();
            const currentRank = effectiveTier?.rank ?? 0;
            const nextTier =
                allTiers
                    .slice()
                    .sort((a, b) => a.rank - b.rank)
                    .find((t) => t.rank > currentRank) ?? null;

            // Aggregated wallet counters for the hero / stats card.
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            let monthlyPurchaseCount = 0;
            let monthlyRefundCount = 0;
            let lastRechargeAt: Date | null = null;
            let lastRechargeAmount: number | null = null;

            if (wallet) {
                const [purchaseRow] = await db
                    .select({ c: count() })
                    .from(resellerTransactions)
                    .where(
                        and(
                            eq(resellerTransactions.walletId, wallet.id),
                            eq(resellerTransactions.type, "PURCHASE"),
                            gte(resellerTransactions.createdAt, startOfMonth),
                        ),
                    );
                monthlyPurchaseCount = Number(purchaseRow?.c ?? 0);

                const [refundRow] = await db
                    .select({ c: count() })
                    .from(resellerTransactions)
                    .where(
                        and(
                            eq(resellerTransactions.walletId, wallet.id),
                            eq(resellerTransactions.type, "REFUND"),
                            gte(resellerTransactions.createdAt, startOfMonth),
                        ),
                    );
                monthlyRefundCount = Number(refundRow?.c ?? 0);

                const [lastRecharge] = await db
                    .select({
                        amount: resellerTransactions.amount,
                        createdAt: resellerTransactions.createdAt,
                    })
                    .from(resellerTransactions)
                    .where(
                        and(
                            eq(resellerTransactions.walletId, wallet.id),
                            eq(resellerTransactions.type, "RECHARGE"),
                        ),
                    )
                    .orderBy(desc(resellerTransactions.createdAt))
                    .limit(1);
                if (lastRecharge) {
                    lastRechargeAt = lastRecharge.createdAt;
                    lastRechargeAmount = parseFloat(lastRecharge.amount);
                }
            }

            const prefs = (reseller.notificationPreferences ?? {}) as Record<string, boolean>;

            return {
                success: true as const,
                data: {
                    reseller: {
                        id: reseller.id,
                        companyName: reseller.companyName,
                        contactPhone: reseller.contactPhone,
                    },
                    wallet: wallet
                        ? {
                            id: wallet.id,
                            balance: wallet.balance,
                            totalSpent: wallet.totalSpent,
                            updatedAt: wallet.updatedAt,
                        }
                        : null,
                    tier: effectiveTier,
                    nextTier,
                    monthlyVolume,
                    monthlyPurchaseCount,
                    monthlyRefundCount,
                    lastRechargeAt,
                    lastRechargeAmount,
                    lowBalanceThreshold: reseller.lowBalanceThreshold
                        ? Number(reseller.lowBalanceThreshold)
                        : null,
                    notificationPreferences: {
                        walletRecharged: prefs["wallet.recharged"] !== false,
                        walletLowBalance: prefs["wallet.low_balance"] !== false,
                    },
                },
            };
        } catch (err) {
            console.error("[wallet] overview failed:", err);
            return { success: false as const, error: "Erreur serveur" };
        }
    },
);

// ──────────────────────────────────────────────────────────────────────
// 2) getResellerTransactionsPagedAction — paged, filtered timeline
// ──────────────────────────────────────────────────────────────────────

export const getResellerTransactionsPagedAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            offset: z.number().int().min(0).optional(),
            limit: z.number().int().min(1).max(100).optional(),
            type: z.enum(TX_TYPES).optional(),
            source: z.enum(TX_SOURCES).optional(),
            dateFrom: z.string().datetime().optional(),
            dateTo: z.string().datetime().optional(),
            search: z.string().max(200).optional(),
        }),
    },
    async (input, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
                with: { wallet: true },
            });
            if (!reseller || !reseller.wallet) {
                return {
                    success: true as const,
                    data: { items: [], total: 0, nextOffset: null as number | null },
                };
            }

            const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
            const offset = Math.max(input.offset ?? 0, 0);

            const conds = [eq(resellerTransactions.walletId, reseller.wallet.id)];
            if (input.type) conds.push(eq(resellerTransactions.type, input.type));
            if (input.source) conds.push(eq(resellerTransactions.source, input.source));
            if (input.dateFrom) {
                const d = new Date(input.dateFrom);
                if (!Number.isNaN(d.getTime())) {
                    conds.push(gte(resellerTransactions.createdAt, d));
                }
            }
            if (input.dateTo) {
                const d = new Date(input.dateTo);
                if (!Number.isNaN(d.getTime())) {
                    conds.push(lte(resellerTransactions.createdAt, d));
                }
            }
            if (input.search) {
                conds.push(ilike(resellerTransactions.description, `%${input.search}%`));
            }

            const whereClause = conds.length === 1 ? conds[0] : and(...conds);

            const items = await db
                .select()
                .from(resellerTransactions)
                .where(whereClause)
                .orderBy(
                    desc(resellerTransactions.createdAt),
                    desc(resellerTransactions.id),
                )
                .limit(limit + 1)
                .offset(offset);

            const hasMore = items.length > limit;
            const trimmed = hasMore ? items.slice(0, limit) : items;
            const nextOffset = hasMore ? offset + limit : null;

            return {
                success: true as const,
                data: {
                    items: trimmed,
                    total: null as number | null, // skip COUNT(*) by default — paginate-only
                    nextOffset,
                },
            };
        } catch (err) {
            console.error("[wallet] paged transactions failed:", err);
            return { success: false as const, error: "Erreur récupération transactions" };
        }
    },
);

// ──────────────────────────────────────────────────────────────────────
// 3) getResellerOrdersByKindAction — unified orders façade
// ──────────────────────────────────────────────────────────────────────

export interface NormalizedOrderRow {
    kind: OrderKind;
    orderNumber: string;
    productName: string;
    priceDzd: number;
    status: string;
    createdAt: Date | string;
    codeOrLink: string | null;
}

export const getResellerOrdersByKindAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            kind: z.enum(ORDER_KINDS),
            limit: z.number().int().min(1).max(200).optional(),
            offset: z.number().int().min(0).optional(),
        }),
    },
    async ({ kind, limit, offset }, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
            });
            if (!reseller) {
                return { success: true as const, data: [] };
            }

            const cap = Math.min(limit ?? 50, 200);
            const skip = Math.max(offset ?? 0, 0);

            const rows: NormalizedOrderRow[] = [];

            if (kind === "active" || kind === "all") {
                const list = await db.query.activeCodeOrders.findMany({
                    where: eq(activeCodeOrders.resellerId, reseller.id),
                    with: { localOrder: { columns: { orderNumber: true } } },
                    orderBy: [desc(activeCodeOrders.createdAt)],
                    limit: cap,
                    offset: kind === "active" ? skip : 0,
                });
                for (const r of list) {
                    rows.push({
                        kind: "active",
                        orderNumber: r.localOrder?.orderNumber ?? `AC-${r.id}`,
                        productName: r.planLabel,
                        priceDzd: parseFloat(r.pricePaidDzd),
                        status: r.status,
                        createdAt: r.createdAt,
                        codeOrLink: r.code,
                    });
                }
            }

            if (kind === "manual" || kind === "all") {
                const list = await db.query.manualOrders.findMany({
                    where: eq(manualOrders.resellerId, reseller.id),
                    with: { localOrder: { columns: { orderNumber: true } } },
                    orderBy: [desc(manualOrders.createdAt)],
                    limit: cap,
                    offset: kind === "manual" ? skip : 0,
                });
                for (const r of list) {
                    rows.push({
                        kind: "manual",
                        orderNumber: r.localOrder?.orderNumber ?? `MAN-${r.id}`,
                        productName: r.productTitleSnapshot,
                        priceDzd: parseFloat(r.pricePaidDzd),
                        status: r.status,
                        createdAt: r.createdAt,
                        codeOrLink: r.deliveryNote,
                    });
                }
            }

            if (kind === "legacy" || kind === "all") {
                // Legacy = local orders that do NOT have a BSV / G2Bulk / IPTV
                // / active / manual mirror row. We pull and filter in-app to
                // keep the SQL portable.
                const ordersList = await db.query.orders.findMany({
                    where: eq(orders.resellerId, reseller.id),
                    orderBy: [desc(orders.createdAt)],
                    limit: cap * 2,
                    offset: kind === "legacy" ? skip : 0,
                    with: {
                        items: {
                            with: { variant: { with: { product: true } } },
                        },
                    },
                });
                const orderIds = ordersList.map((o) => o.id);
                if (orderIds.length > 0) {
                    const { bsvOrders, g2bulkOrders, resellerIptvOrders } =
                        await import("@/db/schema");
                    const { inArray } = await import("drizzle-orm");
                    const [bsvIds, g2bIds, iptvIds, acIds, manIds] = await Promise.all([
                        db
                            .select({ id: bsvOrders.localOrderId })
                            .from(bsvOrders)
                            .where(inArray(bsvOrders.localOrderId, orderIds)),
                        db
                            .select({ id: g2bulkOrders.localOrderId })
                            .from(g2bulkOrders)
                            .where(inArray(g2bulkOrders.localOrderId, orderIds)),
                        db
                            .select({ id: resellerIptvOrders.localOrderId })
                            .from(resellerIptvOrders)
                            .where(inArray(resellerIptvOrders.localOrderId, orderIds)),
                        db
                            .select({ id: activeCodeOrders.localOrderId })
                            .from(activeCodeOrders)
                            .where(inArray(activeCodeOrders.localOrderId, orderIds)),
                        db
                            .select({ id: manualOrders.localOrderId })
                            .from(manualOrders)
                            .where(inArray(manualOrders.localOrderId, orderIds)),
                    ]);
                    const mirrored = new Set<number>([
                        ...bsvIds.map((r) => r.id),
                        ...g2bIds.map((r) => r.id),
                        ...iptvIds.map((r) => r.id),
                        ...acIds.map((r) => r.id),
                        ...manIds.map((r) => r.id),
                    ]);
                    // Shared-account orders (Netflix etc.) carry their customer
                    // magic link on the slot — surface it as codeOrLink so the
                    // wallet row shows a copy + WhatsApp re-share button.
                    const legacyItemIds = ordersList
                        .filter((o) => !mirrored.has(o.id))
                        .flatMap((o) => o.items.map((it) => it.id));
                    const linkByItem = new Map<number, string>();
                    if (legacyItemIds.length > 0) {
                        const { digitalCodeSlots } = await import("@/db/schema");
                        const slotRows = await db
                            .select({
                                orderItemId: digitalCodeSlots.orderItemId,
                                activationUrl: digitalCodeSlots.activationUrl,
                            })
                            .from(digitalCodeSlots)
                            .where(inArray(digitalCodeSlots.orderItemId, legacyItemIds));
                        for (const s of slotRows) {
                            if (s.orderItemId != null && s.activationUrl && !linkByItem.has(s.orderItemId)) {
                                linkByItem.set(s.orderItemId, s.activationUrl);
                            }
                        }
                    }
                    for (const o of ordersList) {
                        if (mirrored.has(o.id)) continue;
                        const firstItem = o.items?.[0];
                        const productName =
                            firstItem?.variant?.product?.name ?? firstItem?.name ?? "Commande";
                        const magicLink =
                            o.items.map((it) => linkByItem.get(it.id)).find(Boolean) ?? null;
                        rows.push({
                            kind: "legacy",
                            orderNumber: o.orderNumber,
                            productName:
                                o.items.length > 1
                                    ? `${productName} +${o.items.length - 1}`
                                    : productName,
                            priceDzd: parseFloat(o.totalAmount),
                            status: o.status,
                            createdAt: o.createdAt ?? new Date(),
                            codeOrLink: magicLink,
                        });
                    }
                }
            }

            // BSV / G2Bulk / IPTV reuse their existing actions — call them
            // here so the wallet page never duplicates query logic.
            if (kind === "bsv" || kind === "giftcards" || kind === "all") {
                const { getBsvOrdersAction } = await import("../orders/bsv-actions");
                const res = await getBsvOrdersAction({});
                if (res.success) {
                    for (const r of res.data) {
                        rows.push({
                            kind: "bsv",
                            orderNumber: r.localOrderNumber ?? `BSV-${r.id}`,
                            productName: r.listingId,
                            priceDzd: r.pricePaidDzd,
                            status: r.status,
                            createdAt: r.createdAt ?? new Date(),
                            codeOrLink: r.codes?.[0]?.code ?? null,
                        });
                    }
                }
            }

            if (kind === "g2bulk" || kind === "giftcards" || kind === "all") {
                const { getG2BulkOrdersAction } = await import("../orders/g2bulk-actions");
                const res = await getG2BulkOrdersAction({ limit: cap });
                if (res.success) {
                    for (const r of res.data) {
                        rows.push({
                            kind: "g2bulk",
                            orderNumber: r.localOrderNumber ?? `G2B-${r.id}`,
                            productName: r.productId,
                            priceDzd: r.pricePaidDzd,
                            status: r.status,
                            createdAt: r.createdAt ?? new Date(),
                            codeOrLink: r.codes?.[0]?.code ?? null,
                        });
                    }
                }
            }

            if (kind === "iptv" || kind === "all") {
                const { listMyIptvOrdersAction } = await import("../iptv/actions");
                const res = await listMyIptvOrdersAction({ limit: Math.min(cap, 100), page: 1 });
                if (res.success) {
                    const data = res.data as {
                        items: Array<{
                            id: number;
                            localOrderId: number;
                            provider: string;
                            productName: string;
                            pricePaidDzd: string;
                            status: string;
                            createdAt: Date | string;
                            customerLabel: string | null;
                        }>;
                    };
                    for (const r of data.items ?? []) {
                        rows.push({
                            kind: "iptv",
                            orderNumber: `IPTV-${r.localOrderId}`,
                            productName: r.customerLabel
                                ? `${r.productName} — ${r.customerLabel}`
                                : r.productName,
                            priceDzd: parseFloat(r.pricePaidDzd),
                            status: r.status,
                            createdAt: r.createdAt,
                            codeOrLink: null,
                        });
                    }
                }
            }

            // For `all`, sort by createdAt desc and cap.
            if (kind === "all") {
                rows.sort((a, b) => {
                    const ta = new Date(a.createdAt).getTime();
                    const tb = new Date(b.createdAt).getTime();
                    return tb - ta;
                });
                return { success: true as const, data: rows.slice(skip, skip + cap) };
            }

            return { success: true as const, data: rows };
        } catch (err) {
            console.error("[wallet] orders by kind failed:", err);
            return { success: false as const, error: "Erreur chargement commandes" };
        }
    },
);

// ──────────────────────────────────────────────────────────────────────
// 4) updateResellerWalletNotificationPrefAction — toggles for the two
//    wallet-related notification keys, reads/writes the same JSONB blob
//    as /reseller/settings/notifications (no drift).
// ──────────────────────────────────────────────────────────────────────

const WALLET_PREF_KEYS = ["wallet.recharged", "wallet.low_balance"] as const;
type WalletPrefKey = (typeof WALLET_PREF_KEYS)[number];

export const updateResellerWalletNotificationPrefAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            eventKey: z.enum(WALLET_PREF_KEYS),
            enabled: z.boolean(),
        }),
    },
    async ({ eventKey, enabled }, user) => {
        try {
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.userId, user.id),
                columns: { id: true, notificationPreferences: true },
            });
            if (!reseller) {
                return { success: false as const, error: "Reseller introuvable" };
            }
            const current = (reseller.notificationPreferences ?? {}) as Record<string, boolean>;
            const next: Record<string, boolean> = { ...current, [eventKey]: enabled };
            await db
                .update(resellers)
                .set({ notificationPreferences: next })
                .where(eq(resellers.id, reseller.id));
            return { success: true as const };
        } catch (err) {
            console.error("[wallet] update notif pref failed:", err);
            return { success: false as const, error: "Erreur sauvegarde" };
        }
    },
);

// Avoid an unused-import warning when nothing in this file currently
// references `sql` — kept for future window-fn variants of the timeline.
void sql;
