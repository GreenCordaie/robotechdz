"use server";

/**
 * Manual Products — admin-side CRUD for the chef's curated catalogue.
 * Reseller-visible rows are surfaced via /reseller/shop/manual-delivery.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { manualOrders, manualProducts, orders, resellerTransactions, resellerWallets, resellers, users } from "@/db/schema";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";

export interface ManualProductAdminRow {
    readonly id: number;
    readonly title: string;
    readonly description: string | null;
    readonly category: string | null;
    readonly priceDzd: number;
    readonly imageUrl: string | null;
    readonly isActive: boolean;
    readonly sortOrder: number;
}

export const listManualProductsAdminAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
    async (): Promise<{ success: true; data: ReadonlyArray<ManualProductAdminRow> }> => {
        const rows = await db.query.manualProducts.findMany({
            orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.title)],
        });
        return {
            success: true,
            data: rows.map((r) => ({
                id: r.id,
                title: r.title,
                description: r.description,
                category: r.category,
                priceDzd: parseFloat(r.priceDzd),
                imageUrl: r.imageUrl,
                isActive: r.isActive,
                sortOrder: r.sortOrder,
            })),
        };
    },
);

const upsertSchema = z.object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    category: z.string().trim().max(80).optional().or(z.literal("")),
    priceDzd: z.number().nonnegative().max(10_000_000),
    imageUrl: z.string().trim().max(1000).optional().or(z.literal("")),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.number().int().min(0).max(10_000).optional().default(100),
});

export const upsertManualProductAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN], schema: upsertSchema },
    async (input) => {
        const values = {
            title: input.title,
            description: input.description ? input.description : null,
            category: input.category ? input.category : null,
            priceDzd: input.priceDzd.toFixed(2),
            imageUrl: input.imageUrl ? input.imageUrl : null,
            isActive: input.isActive ?? true,
            sortOrder: input.sortOrder ?? 100,
            updatedAt: new Date(),
        };
        if (input.id) {
            const [updated] = await db
                .update(manualProducts)
                .set(values)
                .where(eq(manualProducts.id, input.id))
                .returning({ id: manualProducts.id });
            if (!updated) {
                return { success: false as const, error: "Produit introuvable" };
            }
            return { success: true as const, data: { id: updated.id } };
        }
        const [created] = await db
            .insert(manualProducts)
            .values(values)
            .returning({ id: manualProducts.id });
        return { success: true as const, data: { id: created.id } };
    },
);

export const deleteManualProductAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }) => {
        // Soft-disable instead of hard delete so existing orders keep
        // their product snapshot intact.
        await db
            .update(manualProducts)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(manualProducts.id, id));
        return { success: true as const };
    },
);

// ─── Order queue (chef-side) ─────────────────────────────────────────

export interface ManualOrderRow {
    readonly id: number;
    readonly localOrderId: number;
    readonly orderNumber: string;
    readonly resellerName: string | null;
    readonly resellerPhone: string | null;
    readonly productTitle: string;
    readonly pricePaidDzd: number;
    readonly customerPhone: string | null;
    readonly customerNote: string | null;
    readonly deliveryNote: string | null;
    readonly status: "PENDING_DELIVERY" | "DELIVERED" | "CANCELLED" | "REFUNDED";
    readonly createdAt: string;
    readonly deliveredAt: string | null;
}

export const listManualOrdersAdminAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z
            .object({
                status: z
                    .enum(["PENDING_DELIVERY", "DELIVERED", "CANCELLED", "REFUNDED", "ALL"])
                    .optional()
                    .default("PENDING_DELIVERY"),
                limit: z.number().int().min(1).max(200).optional().default(50),
            })
            .optional()
            .default({ status: "PENDING_DELIVERY", limit: 50 }),
    },
    async (input): Promise<{ success: true; data: ReadonlyArray<ManualOrderRow> }> => {
        const where = input.status === "ALL"
            ? undefined
            : eq(manualOrders.status, input.status);

        const rows = await db
            .select({
                id: manualOrders.id,
                localOrderId: manualOrders.localOrderId,
                orderNumber: orders.orderNumber,
                resellerName: resellers.companyName,
                resellerPhone: resellers.contactPhone,
                productTitle: manualOrders.productTitleSnapshot,
                pricePaidDzd: manualOrders.pricePaidDzd,
                customerPhone: manualOrders.customerPhone,
                customerNote: manualOrders.customerNote,
                deliveryNote: manualOrders.deliveryNote,
                status: manualOrders.status,
                createdAt: manualOrders.createdAt,
                deliveredAt: manualOrders.deliveredAt,
            })
            .from(manualOrders)
            .innerJoin(orders, eq(orders.id, manualOrders.localOrderId))
            .leftJoin(resellers, eq(resellers.id, manualOrders.resellerId))
            .where(where)
            .orderBy(desc(manualOrders.createdAt))
            .limit(input.limit);

        return {
            success: true,
            data: rows.map((r) => ({
                id: r.id,
                localOrderId: r.localOrderId,
                orderNumber: r.orderNumber,
                resellerName: r.resellerName,
                resellerPhone: r.resellerPhone,
                productTitle: r.productTitle,
                pricePaidDzd: parseFloat(r.pricePaidDzd),
                customerPhone: r.customerPhone,
                customerNote: r.customerNote,
                deliveryNote: r.deliveryNote,
                status: r.status,
                createdAt: r.createdAt?.toISOString() ?? "",
                deliveredAt: r.deliveredAt?.toISOString() ?? null,
            })),
        };
    },
);

export const markManualOrderDeliveredAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            id: z.number().int().positive(),
            deliveryNote: z.string().trim().max(2000).optional().or(z.literal("")),
        }),
    },
    async (input, user) => {
        const result = await db
            .update(manualOrders)
            .set({
                status: "DELIVERED",
                deliveryNote: input.deliveryNote ? input.deliveryNote : null,
                deliveredAt: new Date(),
                deliveredByUserId: user.id,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(manualOrders.id, input.id),
                    eq(manualOrders.status, "PENDING_DELIVERY"),
                ),
            )
            .returning({ id: manualOrders.id, localOrderId: manualOrders.localOrderId });
        if (result.length === 0) {
            return { success: false as const, error: "Commande déjà traitée" };
        }
        return { success: true as const };
    },
);

export const refundManualOrderAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            id: z.number().int().positive(),
            reason: z.string().trim().max(500).optional().or(z.literal("")),
        }),
    },
    async (input) => {
        try {
            await db.transaction(async (tx) => {
                const row = await tx.query.manualOrders.findFirst({
                    where: and(
                        eq(manualOrders.id, input.id),
                        eq(manualOrders.status, "PENDING_DELIVERY"),
                    ),
                });
                if (!row) {
                    throw new Error("Commande introuvable ou déjà traitée");
                }
                const refund = parseFloat(row.pricePaidDzd);

                const reseller = await tx.query.resellers.findFirst({
                    where: eq(resellers.id, row.resellerId),
                    with: { wallet: true },
                });
                if (reseller?.wallet) {
                    await tx
                        .update(resellerWallets)
                        .set({
                            balance: sql`${resellerWallets.balance} + ${refund}`,
                            totalSpent: sql`GREATEST(${resellerWallets.totalSpent} - ${refund}, 0)`,
                            updatedAt: new Date(),
                        })
                        .where(eq(resellerWallets.id, reseller.wallet.id));
                    await tx.insert(resellerTransactions).values({
                        walletId: reseller.wallet.id,
                        type: "REFUND",
                        amount: refund.toString(),
                        orderId: row.localOrderId,
                        description: `Manual refund — ${(input.reason || row.productTitleSnapshot).slice(0, 200)}`,
                        source: "MANUAL",
                    });
                }
                await tx
                    .update(orders)
                    .set({ status: "REMBOURSE" })
                    .where(eq(orders.id, row.localOrderId));
                await tx
                    .update(manualOrders)
                    .set({
                        status: "REFUNDED",
                        deliveryNote: input.reason ? input.reason : row.deliveryNote,
                        updatedAt: new Date(),
                    })
                    .where(eq(manualOrders.id, input.id));
            });
            return { success: true as const };
        } catch (err) {
            return {
                success: false as const,
                error: err instanceof Error ? err.message : "Erreur remboursement",
            };
        }
    },
);

void isNull;
void users;
