import "server-only";
import { db } from "@/db";
import { iptvProvisions, orders } from "@/db/schema";
import { desc, exists, and, eq, isNull, sql } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

export async function fetchIptvProvisions() {
    // B2C scoping: only kiosk-side provisions (orders.resellerId IS NULL).
    // Reseller IPTV orders have their own surface (/reseller/iptv).
    const provisions = await db.query.iptvProvisions.findMany({
        where: exists(
            db.select({ _: sql`1` }).from(orders).where(and(
                eq(orders.id, iptvProvisions.orderId),
                isNull(orders.resellerId)
            ))
        ),
        with: {
            order: { with: { client: true } },
            orderItem: true,
            variant: { with: { product: true } },
        },
        orderBy: [desc(iptvProvisions.createdAt)],
        limit: 100,
    });

    return provisions.map((p: any) => {
        let credentials = null;
        if (p.credentialsEncrypted) {
            try {
                const decrypted = decrypt(p.credentialsEncrypted);
                if (decrypted) credentials = JSON.parse(decrypted);
            } catch {}
        }

        return {
            id: p.id,
            taskId: p.taskId,
            loadbrainSlug: p.loadbrainSlug,
            status: p.status,
            error: p.error,
            errorCode: p.errorCode,
            credentials,
            completedAt: p.completedAt?.toISOString?.() ?? p.completedAt,
            createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
            order: {
                id: p.order?.id,
                orderNumber: p.order?.orderNumber,
                status: p.order?.status,
                customerPhone: p.order?.customerPhone,
                client: p.order?.client ? {
                    nomComplet: p.order.client.nomComplet,
                    telephone: p.order.client.telephone,
                } : null,
            },
            variant: {
                name: p.variant?.name,
                product: p.variant?.product?.name,
            },
        };
    });
}
