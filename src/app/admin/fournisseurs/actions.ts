"use server";

import { db } from "@/db";
import { suppliers, supplierTransactions } from "@/db/schema";
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
            where: eq(supplierTransactions.supplierId, supplierId),
            orderBy: [desc(supplierTransactions.createdAt)]
        });
    }
);

export const rechargeSupplierAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ supplierId: z.number(), amount: z.string(), currency: z.string(), note: z.string().optional() })
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
                    reason: data.note || "Recharge de balance"
                });
            });
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
