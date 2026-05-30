import "server-only";
import { db } from "@/db";
import { orders, digitalCodes, digitalCodeSlots, orderItems, suppliers, supplierTransactions, productVariantSuppliers, clients, clientPayments, shopSettings, resellers } from "@/db/schema";
import { eq, sql, desc, exists, and, inArray, count, gte, asc, or, ilike, isNull } from "drizzle-orm";
import { cache } from "react";
import { decrypt } from "@/lib/encryption";
import { OrderStatus } from "@/lib/constants";
import { logger } from "@/lib/logger";

// Hard server-side ceiling on caller-controlled `limit` for the unpaginated
// history reader. The paginated reader (`getHistoryPaginated`) is the normal
// path; this cap exists so a caller can't trigger a full-table scan by passing
// e.g. `limit=99999`. No current caller asks above the default (audit grep
// 2026-05-30: only `getHistoryPaginated` is wired in pages/actions), so 500 is
// generously above any realistic admin "all recent" view.
const ORDER_HISTORY_MAX_LIMIT = 500;

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
                purchasePrice: item.purchasePrice,
                purchaseCurrency: item.purchaseCurrency,
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
     * Gets an order by ID with all relations.
     */
    static getById = cache(async (id: number) => {
        const result = await db.query.orders.findFirst({
            where: (orders, { eq }) => eq(orders.id, id),
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } },
                        variant: { with: { product: true } }
                    }
                },
                client: true,
                reseller: true
            }
        });

        if (!result) return null;

        const mappedItems = (result as any).items.map((item: any) => {
            const standardCodes = (item.codes || []).map((c: any) => decrypt(c.code) || "[ERREUR DÉCRYPTAGE]");
            const slotCodes = (item.slots || []).map((s: any) => {
                const decryptedParent = decrypt(s.digitalCode.code) || "[ERREUR COMPTE]";
                const decryptedSlotPin = s.code ? decrypt(s.code) : null;
                let slotInfo = `${decryptedParent} | Profil ${s.slotNumber}`;
                if (s.code) slotInfo += ` | PIN: ${decryptedSlotPin || "[ERREUR PIN]"}`;
                return slotInfo;
            });
            return {
                ...item,
                purchasePrice: item.purchasePrice,
                purchaseCurrency: item.purchaseCurrency,
                codes: [...standardCodes, ...slotCodes]
            };
        });

        return { ...result, items: mappedItems };
    });

    /**
     * Gets all pending orders.
     */
    static getPending = cache(async () => {
        const results = await db.query.orders.findMany({
            where: (orders, { eq, and, isNull }) => and(
                eq(orders.status, OrderStatus.EN_ATTENTE),
                isNull(orders.resellerId)
            ),
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
            where: (orders, { and, eq, inArray, isNull }) => and(
                inArray(orders.status, [OrderStatus.PAYE, OrderStatus.LIVRE, OrderStatus.PARTIEL, OrderStatus.NON_PAYE]),
                eq(orders.isDelivered, false),
                isNull(orders.resellerId)
            ),
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } },
                        variant: { with: { product: true } }
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
                return { ...item, purchasePrice: item.purchasePrice, purchaseCurrency: item.purchaseCurrency, codes: [...standardCodes, ...slotCodes] };
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
            where: (orders, { gte, and, isNull }) => and(
                gte(orders.createdAt, startOfDay),
                isNull(orders.resellerId)
            ),
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
                return {
                    ...item,
                    purchasePrice: item.purchasePrice,
                    purchaseCurrency: item.purchaseCurrency,
                    codes: [...standardCodes, ...slotCodes]
                };
            })
        }));
    });

    /**
     * Gets finished orders (limited to 50).
     */
    static getFinished = cache(async (limit = 50) => {
        const results = await db.query.orders.findMany({
            where: (orders, { eq, and, isNull }) => and(
                eq(orders.status, OrderStatus.TERMINE),
                isNull(orders.resellerId)
            ),
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } },
                        variant: { with: { product: true } }
                    }
                }
            },
            limit,
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
                return {
                    ...item,
                    purchasePrice: item.purchasePrice,
                    purchaseCurrency: item.purchaseCurrency,
                    codes: [...standardCodes, ...slotCodes]
                };
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
                gte(orders.createdAt, startOfDay),
                isNull(orders.resellerId)
            ));

        return { count: result[0]?.count || 0 };
    });

    static getPaidCount = cache(async () => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const result = await db.select({ count: count() })
            .from(orders)
            .where(and(
                eq(orders.status, OrderStatus.PAYE),
                gte(orders.createdAt, startOfDay),
                isNull(orders.resellerId)
            ));

        return { count: result[0]?.count || 0 };
    });

    /**
     * Gets all orders for the history view.
     */
    static getHistory = cache(async (limit = 100) => {
        const requested = Number.isFinite(limit) ? Math.floor(limit) : 100;
        const effectiveLimit = Math.min(Math.max(requested, 1), ORDER_HISTORY_MAX_LIMIT);
        if (requested > ORDER_HISTORY_MAX_LIMIT) {
            logger.warn("OrderQueries.getHistory: caller-requested limit capped", {
                action: "OrderQueries.getHistory",
                metadata: { requested, capped: effectiveLimit, ceiling: ORDER_HISTORY_MAX_LIMIT },
            });
        }

        const results = await db.query.orders.findMany({
            where: (orders, { isNull }) => isNull(orders.resellerId),
            with: {
                items: {
                    with: {
                        codes: true,
                        slots: { with: { digitalCode: true } }
                    }
                },
                client: true
            },
            limit: effectiveLimit,
            orderBy: (orders, { desc }) => [desc(orders.createdAt)]
        });

        return (results as any[]).map(res => ({
            ...res,
            clientName: res.client?.nomComplet || res.customerName || "Anonyme",
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

    static getHistoryPaginated = async (page: number = 1, limit: number = 20, search: string = "") => {
        const offset = (page - 1) * limit;

        const where = search
            ? and(
                isNull(orders.resellerId),
                or(
                    ilike(orders.orderNumber, `%${search}%`),
                    ilike(orders.customerPhone, `%${search}%`)
                )
            )
            : isNull(orders.resellerId);

        const [totalResult, results] = await Promise.all([
            db.select({ count: count() }).from(orders).where(where),
            db.query.orders.findMany({
                where,
                with: {
                    items: {
                        with: {
                            codes: true,
                            slots: { with: { digitalCode: true } },
                            variant: { with: { product: true } }
                        }
                    },
                    client: { columns: { nomComplet: true, telephone: true } }
                },
                limit,
                offset,
                orderBy: (orders, { desc }) => [desc(orders.createdAt)]
            })
        ]);

        const total = totalResult[0]?.count || 0;

        const data = (results as any[]).map(res => ({
            ...res,
            clientName: res.client?.nomComplet || "Anonyme",
            items: (res.items || []).map((item: any) => ({
                ...item,
                name: item.variant?.product?.name || item.name,
                fullCodes: (item.codes || []).map((c: any) => ({
                    id: c.id,
                    code: (() => { try { return decrypt(c.code) || "[Invalide]"; } catch { return "[Erreur]"; } })()
                })),
                fullSlots: (item.slots || []).map((s: any) => {
                    try {
                        return {
                            id: s.id,
                            slotNumber: s.slotNumber,
                            profileName: s.profileName,
                            parentCode: decrypt(s.digitalCode?.code) || "[Erreur Compte]",
                            code: s.code ? decrypt(s.code) : null
                        };
                    } catch { return null; }
                }).filter(Boolean)
            }))
        }));

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    };
}
