"use server";

import { db } from "@/db";
import { suppliers, supplierTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { SupplierQueries } from "@/services/queries/supplier.queries";
import { UserRole } from "@/lib/constants";

export const getSuppliersAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        return await SupplierQueries.getAll();
    }
);

export const getSupplierHistoryAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ supplierId: z.number() })
    },
    async ({ supplierId }) => {
        return await SupplierQueries.getHistory(supplierId);
    }
);

export const getSupplierStatsAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const stats = await SupplierQueries.getFinancialStats();
            return {
                success: true,
                data: stats
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const rechargeSupplierAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            supplierId: z.number(),
            amount: z.string(),
            currency: z.string(),
            note: z.string().optional(),
            paymentStatus: z.enum(["PAID", "UNPAID"]).default("PAID"),
            paidAt: z.string().optional(),
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
        roles: [UserRole.ADMIN],
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
        roles: [UserRole.ADMIN],
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
        roles: [UserRole.ADMIN],
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
        roles: [UserRole.ADMIN],
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
        roles: [UserRole.ADMIN],
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

                    await tx.insert(supplierTransactions).values({
                        supplierId: id,
                        type: "AJUSTEMENT",
                        amount: (parseFloat(data.forcedBalance) - parseFloat(oldBalance || "0")).toString(),
                        currency: supplier.currency || "USD",
                        reason: `Correction manuelle : ${data.reason}`
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
        roles: [UserRole.ADMIN],
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
