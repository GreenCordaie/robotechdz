"use server";

import { db } from "@/db";
import { suppliers, supplierTransactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
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

                // Atomic increment (matches allocateOrderStock / reverseSupplierDebits /
                // updateItemPurchasePrice). A JS read-modify-write here would lose a
                // concurrent sale debit (which updates balance via sql`balance - x`).
                await tx.update(suppliers)
                    .set({ balance: sql`${suppliers.balance} + ${parseFloat(data.amount)}` })
                    .where(eq(suppliers.id, data.supplierId));
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

            // Sync update to CRM
            const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, data.supplierId) });
            if (supplier) {
                const { N8nService } = await import("@/services/n8n.service");
                N8nService.syncSupplierToCRM(supplier, 'RECHARGE').catch(() => { });
            }

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
        // Use .returning() instead of a second findFirst-by-name. The name lookup was
        // both racy (two concurrent creates with the same name would pick the wrong row)
        // and unnecessary — Postgres already hands the inserted row back.
        const [supplier] = await db.insert(suppliers).values({
            name: data.name,
            currency: data.currency,
            balance: data.initialBalance || "0"
        }).returning();
        revalidatePath("/admin/fournisseurs");

        // Sync new supplier to CRM
        if (supplier) {
            const { N8nService } = await import("@/services/n8n.service");
            N8nService.syncSupplierToCRM(supplier, 'CREATED').catch(() => { });
        }

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

            // Sync update to CRM
            const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
            if (supplier) {
                const { N8nService } = await import("@/services/n8n.service");
                N8nService.syncSupplierToCRM(supplier, 'ADJUSTMENT').catch(() => { });
            }

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

            // Sync update to CRM
            const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, data.supplierId) });
            if (supplier) {
                const { N8nService } = await import("@/services/n8n.service");
                N8nService.syncSupplierToCRM(supplier, 'PAYMENT').catch(() => { });
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// External balance suppliers (CapSolver, 2Captcha, AntiCaptcha, Mudfish,
// LoadBrain modules with credit, …). UI lives on the same /admin/fournisseurs
// page; rows have type = 'EXTERNAL_API' and a provider_kind matching the
// fetcher registry in src/lib/balance-fetchers/.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchProviderBalance, listFetchers, BalanceFetchError } from "@/lib/balance-fetchers";

/** List the registered provider kinds so the "Add external supplier" form can populate its dropdown. */
export const listFetcherKindsAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => listFetchers().map((f) => ({ kind: f.kind, label: f.label })),
);

/**
 * Create an external supplier row. Secrets stay in env — `apiKeyEnv` records
 * the env var NAME (e.g. "CAPSOLVER_KEY") so rotation is just an env swap.
 */
export const createExternalSupplierAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            name: z.string().min(1),
            providerKind: z.string().min(1),
            currency: z.string().default("USD"),
            alertThreshold: z.string().optional(),
            apiKeyEnv: z.string().optional(),
            endpoint: z.string().url().optional(),
            notes: z.string().optional(),
            module: z.string().optional(), // only for provider_kind = 'lb_module'
        }),
    },
    async (data) => {
        try {
            const externalConfig = {
                apiKeyEnv: data.apiKeyEnv,
                endpoint: data.endpoint,
                notes: data.notes,
                ...(data.module ? { module: data.module } : {}),
            };
            const [row] = await db.insert(suppliers).values({
                name: data.name,
                currency: data.currency,
                type: "EXTERNAL_API",
                providerKind: data.providerKind,
                externalConfig,
                alertThreshold: data.alertThreshold,
            }).returning({ id: suppliers.id });
            revalidatePath("/admin/fournisseurs");
            return { success: true, id: row.id };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    },
);

/** Trigger a one-shot fetch for a single external supplier (UI "Refresh" button). */
export const refreshSupplierBalanceAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ supplierId: z.number() }),
    },
    async ({ supplierId }) => {
        try {
            const row = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId) });
            if (!row) return { success: false, error: "Supplier not found" };
            if (row.type !== "EXTERNAL_API" || !row.providerKind) {
                return { success: false, error: "Not an external supplier" };
            }

            const { value, currency, fetchedAt } = await fetchProviderBalance(
                row.providerKind,
                row.externalConfig,
            );

            await db.update(suppliers).set({
                balance: String(value),
                currency,
                lastBalanceAt: fetchedAt,
            }).where(eq(suppliers.id, supplierId));

            revalidatePath("/admin/fournisseurs");
            return {
                success: true,
                balance: value,
                currency,
                lastBalanceAt: fetchedAt.toISOString(),
            };
        } catch (error) {
            const msg = error instanceof BalanceFetchError ? error.message : (error as Error).message;
            return { success: false, error: msg };
        }
    },
);
