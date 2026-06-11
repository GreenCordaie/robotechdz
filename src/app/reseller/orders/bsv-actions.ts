"use server";

import { db } from "@/db";
import { bsvOrders, bsvDeliveredCodes, resellers } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { decrypt } from "@/lib/encryption";

/**
 * Returns BSV mirror orders for the authenticated reseller, enriched with
 * delivered codes (decrypted) and `wonSnapshot` forensic data when present.
 */
export const getBsvOrdersAction = withAuth(
    { roles: [UserRole.RESELLER] },
    async (_unused, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
        });
        if (!reseller) {
            return { success: false as const, error: "Compte revendeur introuvable" };
        }

        const rows = await db
            .select()
            .from(bsvOrders)
            .where(eq(bsvOrders.resellerId, reseller.id))
            .orderBy(desc(bsvOrders.createdAt))
            .limit(50);

        if (rows.length === 0) {
            return { success: true as const, data: [] };
        }

        const ids = rows.map((r) => r.id);
        const codes = await db
            .select()
            .from(bsvDeliveredCodes)
            .where(inArray(bsvDeliveredCodes.bsvOrderId, ids));
        const codesByOrder = new Map<number, typeof codes>();
        for (const c of codes) {
            const existing = codesByOrder.get(c.bsvOrderId) ?? [];
            existing.push(c);
            codesByOrder.set(c.bsvOrderId, existing);
        }

        // Fetch parent local orders for orderNumber
        const localOrderIds = Array.from(new Set(rows.map((r) => r.localOrderId)));
        const localOrders = await db.query.orders.findMany({
            where: (o, ops) => ops.inArray(o.id, localOrderIds),
        });
        const localOrderMap = new Map(localOrders.map((o) => [o.id, o]));

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
                listingId: row.listingId,
                quantity: row.quantity,
                pricePaidDzd: parseFloat(row.pricePaidDzd),
                lbOrderId: row.lbOrderId,
                status: row.status,
                wonSnapshot: row.wonSnapshot,
                completedAt: row.completedAt,
                createdAt: row.createdAt,
                codes: decoded,
            };
        });

        return { success: true as const, data: enriched };
    }
);

export interface BsvOrderRow {
    id: number;
    localOrderId: number;
    localOrderNumber: string | null;
    listingId: string;
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
}
