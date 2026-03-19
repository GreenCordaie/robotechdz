"use server";

import { db } from "@/db";
import { suppliers, supplierTransactions, orderItems, orders, shopSettings } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth, logSecurityAction } from "@/lib/security";
import { z } from "zod";

export const getSuppliersAction = withAuth(
    { roles: ["ADMIN"] },
    async () => {
        return await db.query.suppliers.findMany({
            orderBy: [desc(suppliers.id)], // suppliers table has no createdAt
            with: { transactions: { limit: 5, orderBy: [desc(supplierTransactions.createdAt)] } }
        });
    }
);

export const getSupplierHistoryAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ supplierId: z.number() })
    },
    async ({ supplierId }) => {
        return await db.query.supplierTransactions.findMany({
            where: supplierId > 0 ? eq(supplierTransactions.supplierId, supplierId) : undefined,
            orderBy: [desc(supplierTransactions.createdAt)],
            with: { supplier: true }
        });
    }
);

export const getSupplierStatsAction = withAuth(
    { roles: ["ADMIN"] },
    async () => {
        try {
            const settings = await db.query.shopSettings.findFirst();
            const exchangeRate = parseFloat(settings?.usdExchangeRate || "245");

            const allTransactions = await db.query.supplierTransactions.findMany();

            let totalPaidDzd = 0;
            let totalUnpaidDzd = 0;

            allTransactions.forEach(r => {
                const amount = parseFloat(r.amount);
                const txRate = r.exchangeRate ? parseFloat(r.exchangeRate) : exchangeRate;
                const dzdAmount = r.currency === "USD" ? amount * txRate : amount;

                if (r.type === "RECHARGE") {
                    if (r.paymentStatus === "PAID") {
                        totalPaidDzd += dzdAmount;
                    } else {
                        totalUnpaidDzd += dzdAmount;
                    }
                } else if (r.type === "PAYMENT") {
                    // Payment reduces debt and increases total paid
                    totalUnpaidDzd -= dzdAmount;
                    totalPaidDzd += dzdAmount;
                }
            });

            // 2. Profit Net
            const salesItems = await db.select({
                price: orderItems.price,
                quantity: orderItems.quantity,
                purchasePrice: orderItems.purchasePrice,
                purchaseCurrency: orderItems.purchaseCurrency
            }).from(orderItems)
                .innerJoin(orders, eq(orderItems.orderId, orders.id))
                .where(
                    sql`${orders.status} IN ('PAYE', 'LIVRE', 'TERMINE')`
                );

            let totalNetProfit = 0;
            salesItems.forEach(item => {
                const saleTotal = parseFloat(item.price) * (item.quantity || 1);
                let costDzd = 0;

                if (item.purchasePrice) {
                    const pPrice = parseFloat(item.purchasePrice);
                    costDzd = item.purchaseCurrency === 'USD'
                        ? pPrice * (item.quantity || 1) * exchangeRate
                        : pPrice * (item.quantity || 1);
                } else {
                    // Fallback to 85% cost (15% margin) like in dashboard
                    costDzd = saleTotal * 0.85;
                }

                totalNetProfit += (saleTotal - costDzd);
            });

            return {
                success: true,
                data: {
                    totalPaidDzd: totalPaidDzd.toFixed(2),
                    totalUnpaidDzd: totalUnpaidDzd.toFixed(2),
                    netProfit: totalNetProfit.toFixed(2),
                    exchangeRate: exchangeRate.toString()
                }
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const rechargeSupplierAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            supplierId: z.number(),
            amount: z.string(),
            currency: z.string(),
            note: z.string().optional(),
            paymentStatus: z.enum(["PAID", "UNPAID"]).default("PAID"),
            paidAt: z.string().optional(), // ISO string
            exchangeRate: z.string().optional()
        })
    },
    async (data) => {
        try {
            await db.transaction(async (tx) => {
                const supplier = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, data.supplierId) });
                if (!supplier) throw new Error("Fournisseur introuvable");

                const newBalance = (parseFloat(supplier.balance || "0") + parseFloat(data.amount)).toString();

                await tx.update(suppliers).set({ balance: newBalance }).where(eq(suppliers.id, data.supplierId));
                await tx.insert(supplierTransactions).values({
                    supplierId: data.supplierId,
                    type: "RECHARGE",
                    amount: data.amount,
                    currency: data.currency,
                    reason: data.note || "Recharge de balance",
                    paymentStatus: data.paymentStatus,
                    paidAt: data.paymentStatus === "PAID" ? (data.paidAt ? new Date(data.paidAt) : new Date()) : null,
                    exchangeRate: data.exchangeRate
                });
            });
            revalidatePath("/admin/fournisseurs");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const markTransactionAsPaidAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ transactionId: z.number() })
    },
    async ({ transactionId }) => {
        try {
            await db.update(supplierTransactions)
                .set({ paymentStatus: "PAID", paidAt: new Date() })
                .where(eq(supplierTransactions.id, transactionId));
            revalidatePath("/admin/fournisseurs");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const addSupplierAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ name: z.string().min(1), currency: z.enum(["USD", "DZD"]), initialBalance: z.string().optional() })
    },
    async (data) => {
        await db.insert(suppliers).values({ name: data.name, currency: data.currency, balance: data.initialBalance || "0" });
        revalidatePath("/admin/fournisseurs");
        return { success: true };
    }
);

export const deleteSupplierAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        await db.delete(suppliers).where(eq(suppliers.id, id));
        revalidatePath("/admin/fournisseurs");
        return { success: true };
    }
);

export const archiveSupplierAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        await db.update(suppliers).set({ status: "INACTIVE" }).where(eq(suppliers.id, id));
        revalidatePath("/admin/fournisseurs");
        return { success: true };
    }
);

export const rechargeSupplier = rechargeSupplierAction;

export const adjustSupplierAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            id: z.number(),
            data: z.object({
                name: z.string().optional(),
                forcedBalance: z.string().optional(),
                reason: z.string().min(1)
            })
        })
    },
    async ({ id, data }, user) => {
        try {
            await db.transaction(async (tx) => {
                const supplier = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
                if (!supplier) throw new Error("Fournisseur introuvable");

                const updatePayload: any = {};
                if (data.name) updatePayload.name = data.name;

                if (data.forcedBalance !== undefined) {
                    const oldBalance = supplier.balance;
                    updatePayload.balance = data.forcedBalance;

                    // Log this adjustment specifically
                    await tx.insert(supplierTransactions).values({
                        supplierId: id,
                        type: "AJUSTEMENT",
                        amount: (parseFloat(data.forcedBalance) - parseFloat(oldBalance || "0")).toString(),
                        currency: supplier.currency || "USD",
                        reason: `Correction manuelle : ${data.reason}`
                    });

                    // Log to central Audit Log
                    await logSecurityAction({
                        userId: user.id,
                        action: "SUPPLIER_BALANCE_ADJUST",
                        entityType: "SUPPLIER",
                        entityId: id.toString(),
                        oldData: { balance: oldBalance },
                        newData: { balance: data.forcedBalance, reason: data.reason }
                    });
                }

                if (Object.keys(updatePayload).length > 0) {
                    await tx.update(suppliers).set(updatePayload).where(eq(suppliers.id, id));
                }
            });

            revalidatePath("/admin/fournisseurs");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
export const paySupplierAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            supplierId: z.number(),
            amount: z.string(),
            currency: z.string(),
            note: z.string().optional(),
            exchangeRate: z.string().optional()
        })
    },
    async (data) => {
        try {
            await db.insert(supplierTransactions).values({
                supplierId: data.supplierId,
                type: "PAYMENT",
                amount: data.amount,
                currency: data.currency,
                reason: data.note || "Paiement de dette / Virement",
                paymentStatus: "PAID",
                paidAt: new Date(),
                exchangeRate: data.exchangeRate
            });
            revalidatePath("/admin/fournisseurs");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
