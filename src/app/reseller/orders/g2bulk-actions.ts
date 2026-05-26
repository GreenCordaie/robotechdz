"use server";

import { db } from "@/db";
import { g2bulkOrders, g2bulkDeliveredCodes, resellers, resellerTransactions } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { decrypt } from "@/lib/encryption";
import { z } from "zod";

/**
 * Returns G2Bulk mirror orders for the authenticated reseller, enriched with
 * delivered codes (decrypted) and `wonSnapshot` forensic data when present.
 * Mirrors getBsvOrdersAction in bsv-actions.ts.
 */
export const getG2BulkOrdersAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional(),
    },
    async (input, user) => {
        const limit = input?.limit ?? 50;
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
        });
        if (!reseller) {
            return { success: false as const, error: "Compte revendeur introuvable" };
        }

        const rows = await db
            .select()
            .from(g2bulkOrders)
            .where(eq(g2bulkOrders.resellerId, reseller.id))
            .orderBy(desc(g2bulkOrders.createdAt))
            .limit(limit);

        if (rows.length === 0) {
            return { success: true as const, data: [] };
        }

        const ids = rows.map((r) => r.id);
        const codes = await db
            .select()
            .from(g2bulkDeliveredCodes)
            .where(inArray(g2bulkDeliveredCodes.g2bulkOrderId, ids));
        const codesByOrder = new Map<number, typeof codes>();
        for (const c of codes) {
            const existing = codesByOrder.get(c.g2bulkOrderId) ?? [];
            existing.push(c);
            codesByOrder.set(c.g2bulkOrderId, existing);
        }

        // Fetch parent local orders for orderNumber
        const localOrderIds = Array.from(new Set(rows.map((r) => r.localOrderId)));
        const localOrders = await db.query.orders.findMany({
            where: (o, ops) => ops.inArray(o.id, localOrderIds),
        });
        const localOrderMap = new Map(localOrders.map((o) => [o.id, o]));

        // Refund context: the failure webhook writes a type=REFUND reseller_transactions
        // row (description prefixed "Remboursement…") against the local order.
        const refundRows = await db
            .select({
                orderId: resellerTransactions.orderId,
                amount: resellerTransactions.amount,
                description: resellerTransactions.description,
            })
            .from(resellerTransactions)
            .where(inArray(resellerTransactions.orderId, localOrderIds));
        const refundByOrder = new Map<number, { amount: string; reason: string | null }>();
        for (const r of refundRows) {
            if (r.orderId == null) continue;
            if (!(r.description ?? "").toLowerCase().includes("rembours")) continue;
            refundByOrder.set(r.orderId, { amount: r.amount, reason: r.description ?? null });
        }

        const enriched = rows.map((row) => {
            const rowCodes = codesByOrder.get(row.id) ?? [];
            const decoded = rowCodes.map((c) => {
                let code: string | null = null;
                let pin: string | null = null;
                try {
                    code = decrypt(c.code);
                } catch {
                    code = null;
                }
                try {
                    pin = c.pin ? decrypt(c.pin) : null;
                } catch {
                    pin = null;
                }
                return {
                    id: c.id,
                    code,
                    pin,
                    redemptionUrl: c.redemptionUrl,
                };
            });

            return {
                id: row.id,
                localOrderId: row.localOrderId,
                localOrderNumber:
                    localOrderMap.get(row.localOrderId)?.orderNumber ?? null,
                productId: row.productId,
                quantity: row.quantity,
                pricePaidDzd: parseFloat(row.pricePaidDzd),
                lbOrderId: row.lbOrderId,
                status: row.status,
                wonSnapshot: row.wonSnapshot,
                completedAt: row.completedAt,
                createdAt: row.createdAt,
                codes: decoded,
                refundAmount: refundByOrder.get(row.localOrderId)?.amount ?? null,
                refundReason: refundByOrder.get(row.localOrderId)?.reason ?? null,
            };
        });

        return { success: true as const, data: enriched };
    }
);

export interface G2BulkOrderRow {
    id: number;
    localOrderId: number;
    localOrderNumber: string | null;
    productId: string;
    quantity: number;
    pricePaidDzd: number;
    lbOrderId: string | null;
    status: string;
    wonSnapshot: unknown;
    completedAt: Date | null;
    createdAt: Date | null;
    codes: Array<{
        id: number;
        code: string | null;
        pin: string | null;
        redemptionUrl: string | null;
    }>;
    refundAmount: string | null;
    refundReason: string | null;
}
