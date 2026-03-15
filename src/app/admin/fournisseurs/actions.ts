"use server";

import { db } from "@/db";
import { suppliers, supplierTransactions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getSuppliers() {
    const data = await db.query.suppliers.findMany({
        with: {
            transactions: {
                limit: 1,
                orderBy: [desc(supplierTransactions.createdAt)]
            }
        }
    });

    // Robustly ensure default suppliers exist
    const defaults = [
        { name: "PrepaidForge", balanceUsd: "450.00", balanceDzd: "101250", exchangeRate: "225" },
        { name: "G2A Business", balanceUsd: "12.50", balanceDzd: "2812", exchangeRate: "225" },
        { name: "Binance P2P", balanceUsd: "1200.00", balanceDzd: "271200", exchangeRate: "226" },
    ];

    for (const s of defaults) {
        const existing = data.find(ex => ex.name === s.name);
        if (!existing) {
            await db.insert(suppliers).values(s);
        }
    }

    return await db.query.suppliers.findMany({
        with: {
            transactions: {
                limit: 1,
                orderBy: [desc(supplierTransactions.createdAt)]
            }
        }
    });
}

export async function getSupplierHistory() {
    const history = await db.query.supplierTransactions.findMany({
        with: {
            supplier: true
        },
        orderBy: [desc(supplierTransactions.createdAt)],
        limit: 20
    });

    if (history.length === 0) {
        // Seed some history if empty
        const allSuppliers = await db.query.suppliers.findMany();
        if (allSuppliers.length >= 2) {
            const seedHistory = [
                { supplierId: allSuppliers[0].id, amountUsd: "1000.00", exchangeRate: "226.50", amountDzd: "226500", status: "COMPLETED" },
                { supplierId: allSuppliers[1].id, amountUsd: "250.00", exchangeRate: "224.00", amountDzd: "56000", status: "PENDING" },
                { supplierId: allSuppliers[1].id, amountUsd: "500.00", exchangeRate: "225.20", amountDzd: "112600", status: "COMPLETED" },
            ];
            for (const h of seedHistory) {
                await db.insert(supplierTransactions).values(h);
            }
            return await db.query.supplierTransactions.findMany({
                with: { supplier: true },
                orderBy: [desc(supplierTransactions.createdAt)]
            });
        }
    }

    return history;
}

export async function rechargeSupplier(supplierId: number, amount: string, rate: string, currency: 'USD' | 'DZD' = 'USD') {
    try {
        let amountUsdVal: string;
        let amountDzdVal: string;

        if (currency === 'DZD') {
            amountDzdVal = amount;
            // USD = DZD / Rate
            amountUsdVal = (parseFloat(amount) / parseFloat(rate)).toFixed(2);
        } else {
            amountUsdVal = amount;
            // DZD = USD * Rate
            amountDzdVal = (parseFloat(amount) * parseFloat(rate)).toFixed(2);
        }

        // 1. Create transaction with RECHARGE type
        await db.insert(supplierTransactions).values({
            supplierId,
            type: "RECHARGE",
            amountUsd: amountUsdVal,
            exchangeRate: rate,
            amountDzd: amountDzdVal,
            status: "COMPLETED"
        });

        // 2. Update supplier balance
        const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
        if (supplier) {
            const newBalanceUsd = (parseFloat(supplier.balanceUsd || "0") + parseFloat(amountUsdVal)).toString();
            const newBalanceDzd = (parseFloat(supplier.balanceDzd || "0") + parseFloat(amountDzdVal)).toString();

            await db.update(suppliers).set({
                balanceUsd: newBalanceUsd,
                balanceDzd: newBalanceDzd,
                exchangeRate: rate
            }).where(eq(suppliers.id, supplierId));
        }

        revalidatePath("/admin/fournisseurs");
        return { success: true };
    } catch (error) {
        console.error("Recharge failed:", error);
        return { success: false, error: (error as Error).message };
    }
}

export async function adjustSupplierAction(id: number, data: { name?: string; forcedRate?: string; forcedBalance?: string; reason: string }) {
    try {
        const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
        if (!supplier) throw new Error("Fournisseur non trouvé");

        const updateData: any = {};
        if (data.name) updateData.name = data.name;

        const finalRate = data.forcedRate || supplier.exchangeRate || "225";
        updateData.exchangeRate = finalRate;

        if (data.forcedBalance !== undefined) {
            const newBalanceUsd = parseFloat(data.forcedBalance);
            const newBalanceDzd = newBalanceUsd * parseFloat(finalRate);

            updateData.balanceUsd = newBalanceUsd.toString();
            updateData.balanceDzd = newBalanceDzd.toString();

            // Log the adjustment in transactions
            const diffUsd = newBalanceUsd - parseFloat(supplier.balanceUsd || "0");
            const diffDzd = newBalanceDzd - parseFloat(supplier.balanceDzd || "0");

            await db.insert(supplierTransactions).values({
                supplierId: id,
                type: "AJUSTEMENT",
                amountUsd: diffUsd.toString(),
                exchangeRate: finalRate,
                amountDzd: diffDzd.toString(),
                reason: data.reason,
                status: "COMPLETED"
            });
        } else if (data.forcedRate !== undefined) {
            // If only rate changed, update the DZD balance based on current USD balance
            const currentUsd = parseFloat(supplier.balanceUsd || "0");
            const newDzd = currentUsd * parseFloat(data.forcedRate);
            updateData.balanceDzd = newDzd.toString();

            await db.insert(supplierTransactions).values({
                supplierId: id,
                type: "AJUSTEMENT",
                amountUsd: "0",
                exchangeRate: data.forcedRate,
                amountDzd: "0", // Rate change only
                reason: data.reason,
                status: "COMPLETED"
            });
        }

        await db.update(suppliers).set(updateData).where(eq(suppliers.id, id));

        revalidatePath("/admin/fournisseurs");
        return { success: true };
    } catch (error) {
        console.error("Adjustment failed:", error);
        return { success: false, error: (error as Error).message };
    }
}

export async function addSupplierAction(data: { name: string; exchangeRate: string; balance: string; currency: 'USD' | 'DZD' }) {
    try {
        let balanceUsd: string;
        let balanceDzd: string;

        if (data.currency === 'DZD') {
            balanceDzd = data.balance;
            // USD = DZD / Rate
            balanceUsd = (parseFloat(data.balance) / parseFloat(data.exchangeRate)).toFixed(2);
        } else {
            balanceUsd = data.balance;
            // DZD = USD * Rate
            balanceDzd = (parseFloat(data.balance) * parseFloat(data.exchangeRate)).toFixed(2);
        }

        await db.insert(suppliers).values({
            name: data.name,
            exchangeRate: data.exchangeRate,
            balanceUsd,
            balanceDzd,
            baseCurrency: data.currency
        });

        revalidatePath("/admin/fournisseurs");
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

export async function deleteSupplierAction(id: number) {
    try {
        await db.delete(suppliers).where(eq(suppliers.id, id));
        revalidatePath("/admin/fournisseurs");
        return { success: true };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}
