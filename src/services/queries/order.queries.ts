import { db } from "@/db";
import { orders, digitalCodes, digitalCodeSlots, orderItems, suppliers, supplierTransactions, productVariantSuppliers, clients, clientPayments, shopSettings, resellers } from "@/db/schema";
import { eq, sql, desc, exists, and, inArray, count, gte, asc } from "drizzle-orm";
import { cache } from "react";
import { decrypt } from "@/lib/encryption";
import { OrderStatus } from "@/lib/constants";

/**
 * OrderQueries Service
 * Handles all read-only operations for orders with request-level caching.
 */
export class OrderQueries {

    /**
     * Finds an order by its order number (e.g., #C123).
     */
    static findByNumber = cache(async (orderNumber: string) => {
        const result = await db.query.orders.findFirst({
            where: (orders, { sql }) => sql`upper(${orders.orderNumber}) = upper(${orderNumber})`,
            with: {
                items: {
                    with: {
                        codes: true,
                        variant: {
                            with: {
                                variantSuppliers: {
                                    with: {
                                        supplier: true
                                    }
                                }
                            }
                        },
                        slots: {
                            with: {
                                digitalCode: true
                            }
                        }
                    }
                }
            }
        });

        if (!result) return null;

        const mappedItems = (result as any).items.map((item: any) => {
            return {
                ...item,
                fullCodes: (item.codes || []).map((c: any) => ({ id: c.id, code: decrypt(c.code) || "[ERREUR DÉCRYPTAGE]" })),
                fullSlots: (item.slots || []).map((s: any) => ({
                    id: s.id,
                    code: decrypt(s.code) || "[ERREUR DÉCRYPTAGE]",
                    slotNumber: s.slotNumber,
                    profileName: s.profileName,
                    parentCode: decrypt(s.digitalCode.code) || "[ERREUR DÉCRYPTAGE]"
                }))
            };
        });

        return { ...result, items: mappedItems };
    });

    /**
     * Gets all pending orders.
     */
    static getPending = cache(async () => {
        const results = await db.query.orders.findMany({
            where: (orders, { eq }) => eq(orders.status, OrderStatus.EN_ATTENTE),
            with: {
                items: {
                    with: {
                        codes: true
                    }
                }
            },
            orderBy: (orders, { desc }) => [desc(orders.createdAt)]
        });

        return (results as any[]).map(order => ({
            ...order,
            items: (order.items || []).map((item: any) => ({
                ...item,
                codes: (item.codes || []).map((c: any) => decrypt(c.code) || "[ERREUR DÉCRYPTAGE]")
            }))
        }));
    });

    /**
     * Gets all paid orders that haven't been fully delivered yet.
     */
    static getPaid = cache(async () => {
        const results = await db.query.orders.findMany({
            where: (orders, { and, eq, inArray }) => and(
                inArray(orders.status, [OrderStatus.PAYE, OrderStatus.LIVRE, OrderStatus.PARTIEL, OrderStatus.NON_PAYE]),
                eq(orders.isDelivered, false)
            ),
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } }
                    }
                }
            }
        });

        return (results as any[]).map(res => ({
            ...res,
            items: (res.items || []).map((item: any) => {
                const standardCodes = (item.codes || []).map((c: any) => {
                    try { return decrypt(c.code) || "[Invalide]"; } catch { return "[Erreur]"; }
                });
                const slotCodes = (item.slots || []).map((s: any) => {
                    try {
                        const decryptedParent = decrypt(s.digitalCode.code);
                        const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                        let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                        if (decryptedSlotPin) slotInfo += ` | PIN: ${decryptedSlotPin}`;
                        return slotInfo;
                    } catch {
                        return "[Erreur Profil]";
                    }
                });
                return { ...item, codes: [...standardCodes, ...slotCodes] };
            })
        }));
    });

    /**
     * Gets orders created today.
     */
    static getToday = cache(async () => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const results = await db.query.orders.findMany({
            where: (orders, { gte }) => gte(orders.createdAt, startOfDay),
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } }
                    }
                },
                client: true
            },
            orderBy: (orders, { desc }) => [desc(orders.createdAt)]
        });

        return (results as any[]).map(res => ({
            ...res,
            nomComplet: res.client?.nomComplet || "Anonyme",
            telephone: res.client?.telephone || res.customerPhone,
            items: (res.items || []).map((item: any) => {
                const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code) || "[ERREUR DÉCRYPTAGE]");
                const slotCodes = (item.slots || []).map((s: any) => {
                    const decryptedParent = decrypt(s.digitalCode.code) || "[ERREUR COMPTE]";
                    const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                    let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                    if (s.code) slotInfo += ` | PIN: ${decryptedSlotPin || "[ERREUR PIN]"}`;
                    return slotInfo;
                });
                return { ...item, codes: [...standardCodes, ...slotCodes] };
            })
        }));
    });

    /**
     * Gets finished orders (limited to 20).
     */
    static getFinished = cache(async () => {
        const results = await db.query.orders.findMany({
            where: (orders, { eq }) => eq(orders.status, OrderStatus.TERMINE),
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } }
                    }
                }
            },
            limit: 20,
            orderBy: (orders, { desc }) => [desc(orders.createdAt)]
        });

        return (results as any[]).map(res => ({
            ...res,
            items: (res.items || []).map((item: any) => {
                const standardCodes = (item.codes || []).map((c: any) => {
                    try { return decrypt(c.code) || "[Invalide]"; } catch { return "[Erreur]"; }
                });
                const slotCodes = (item.slots || []).map((s: any) => {
                    try {
                        const decryptedParent = decrypt(s.digitalCode.code);
                        const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                        let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                        if (decryptedSlotPin) slotInfo += ` | PIN: ${decryptedSlotPin}`;
                        return slotInfo;
                    } catch {
                        return "[Erreur Profil]";
                    }
                });
                return { ...item, codes: [...standardCodes, ...slotCodes] };
            })
        }));
    });

    /**
     * Gets the count of pending orders created today.
     */
    static getPendingCount = cache(async () => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const result = await db.select({ count: count() })
            .from(orders)
            .where(and(
                eq(orders.status, OrderStatus.EN_ATTENTE),
                gte(orders.createdAt, startOfDay)
            ));

        return { count: result[0]?.count || 0 };
    });
}
