"use server";

import { db } from "@/db";
import {
    resellers,
    resellerWallets,
    resellerTransactions,
    centralWallet,
    centralWalletTransactions,
    users,
} from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { withAuth, logSecurityAction } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    validateAmountDzd,
    hasSufficientBalance,
    MAX_AMOUNT_DZD,
} from "@/services/central-wallet.service";

const CENTRAL_WALLET_ID = 1;

const amountSchema = z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v.toString() : v))
    .refine((s) => /^\d+(\.\d{1,2})?$/.test(s), { message: "Montant invalide (2 décimales max)" })
    .refine((s) => {
        const n = parseFloat(s);
        return Number.isFinite(n) && n > 0 && n < MAX_AMOUNT_DZD;
    }, { message: `Montant doit être > 0 et < ${MAX_AMOUNT_DZD}` });

/**
 * Ensures the singleton central wallet row exists (id = 1).
 * Idempotent; safe to call within or outside a transaction.
 */
async function ensureCentralWalletExists(): Promise<void> {
    await db
        .insert(centralWallet)
        .values({ id: CENTRAL_WALLET_ID, balance: "0", totalToppedUp: "0", totalDisbursed: "0" })
        .onConflictDoNothing({ target: centralWallet.id });
}

/**
 * Reads the singleton central wallet state.
 */
export const getCentralWalletAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({}).optional(),
    },
    async () => {
        await ensureCentralWalletExists();
        const [row] = await db
            .select()
            .from(centralWallet)
            .where(eq(centralWallet.id, CENTRAL_WALLET_ID))
            .limit(1);

        if (!row) {
            return { success: false as const, error: "Wallet central introuvable" };
        }

        return {
            success: true as const,
            data: {
                balance: row.balance,
                totalToppedUp: row.totalToppedUp,
                totalDisbursed: row.totalDisbursed,
                updatedAt: row.updatedAt,
            },
        };
    }
);

/**
 * Admin tops up the central wallet (records that real funds were received
 * outside the system — bank wire, cash deposit, etc.).
 *
 * Atomic: locks the central_wallet row, increments balance + total_topped_up,
 * inserts an audit transaction.
 */
export const topUpCentralWalletAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            amountDzd: amountSchema,
            reference: z.string().max(120).optional(),
            notes: z.string().max(500).optional(),
        }),
    },
    async (input, user) => {
        const validation = validateAmountDzd(input.amountDzd);
        if (!validation.ok) {
            return { success: false as const, error: validation.error };
        }
        const amount = validation.value;
        const amountStr = validation.normalized;

        await ensureCentralWalletExists();

        try {
            const result = await db.transaction(async (tx) => {
                // Lock the singleton row for the duration of the tx.
                const [walletRow] = await tx.execute(
                    sql`SELECT id, balance, total_topped_up, total_disbursed
                        FROM central_wallet
                        WHERE id = ${CENTRAL_WALLET_ID}
                        FOR UPDATE`
                ) as unknown as Array<{
                    id: number;
                    balance: string;
                    total_topped_up: string;
                    total_disbursed: string;
                }>;

                if (!walletRow) throw new Error("Wallet central introuvable");

                const previousBalance = parseFloat(walletRow.balance);
                const newBalanceCents = Math.round(previousBalance * 100) + Math.round(amount * 100);
                const newBalance = (newBalanceCents / 100).toFixed(2);

                await tx
                    .update(centralWallet)
                    .set({
                        balance: sql`${centralWallet.balance} + ${amountStr}`,
                        totalToppedUp: sql`${centralWallet.totalToppedUp} + ${amountStr}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(centralWallet.id, CENTRAL_WALLET_ID));

                const [txRow] = await tx
                    .insert(centralWalletTransactions)
                    .values({
                        type: "admin_topup",
                        amountDzd: amountStr,
                        balanceAfter: newBalance,
                        adminUserId: user.id,
                        reference: input.reference ?? null,
                        notes: input.notes ?? null,
                    })
                    .returning();

                return { transactionId: txRow.id, previousBalance, newBalance };
            });

            await logSecurityAction({
                userId: user.id,
                action: "CENTRAL_WALLET_TOPUP",
                entityType: "CENTRAL_WALLET",
                entityId: CENTRAL_WALLET_ID.toString(),
                newData: {
                    amount,
                    reference: input.reference ?? null,
                    previousBalance: result.previousBalance,
                    newBalance: result.newBalance,
                    transactionId: result.transactionId,
                },
            });

            revalidatePath("/admin/b2b/central-wallet");

            return {
                success: true as const,
                data: {
                    newBalance: result.newBalance,
                    transactionId: result.transactionId,
                },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erreur top-up";
            console.error("[central-wallet topup] failed:", message);
            return { success: false as const, error: message };
        }
    }
);

/**
 * Debits the central wallet and credits a reseller wallet atomically.
 *
 * Both wallets are locked (`FOR UPDATE`). Fails if central balance is short.
 * Inserts both a central_wallet_transactions row and an existing
 * reseller_transactions row (type=RECHARGE) so the reseller-facing history
 * keeps the same shape it already has.
 */
export const creditResellerFromCentralAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            resellerId: z.number().int().positive(),
            amountDzd: amountSchema,
            reference: z.string().max(120).optional(),
            notes: z.string().max(500).optional(),
        }),
    },
    async (input, user) => {
        const validation = validateAmountDzd(input.amountDzd);
        if (!validation.ok) {
            return { success: false as const, error: validation.error };
        }
        const amount = validation.value;
        const amountStr = validation.normalized;

        await ensureCentralWalletExists();

        try {
            const result = await db.transaction(async (tx) => {
                // 1. Lock central wallet
                const centralRows = await tx.execute(
                    sql`SELECT id, balance FROM central_wallet
                        WHERE id = ${CENTRAL_WALLET_ID}
                        FOR UPDATE`
                ) as unknown as Array<{ id: number; balance: string }>;
                const centralRow = centralRows[0];
                if (!centralRow) throw new Error("Wallet central introuvable");

                if (!hasSufficientBalance(centralRow.balance, amount)) {
                    throw new Error("Solde central insuffisant");
                }

                // 2. Verify reseller is ACTIVE
                const reseller = await tx.query.resellers.findFirst({
                    where: eq(resellers.id, input.resellerId),
                });
                if (!reseller) throw new Error("Reseller introuvable");
                if (reseller.status !== "ACTIVE") {
                    throw new Error("Reseller suspendu — crédit bloqué");
                }

                // 3. Lock or create the reseller wallet row
                let walletRows = await tx.execute(
                    sql`SELECT id, balance FROM reseller_wallets
                        WHERE reseller_id = ${input.resellerId}
                        FOR UPDATE`
                ) as unknown as Array<{ id: number; balance: string }>;

                let resellerWalletId: number;
                let resellerPrevBalance: number;
                if (walletRows.length === 0) {
                    const [created] = await tx
                        .insert(resellerWallets)
                        .values({
                            resellerId: input.resellerId,
                            balance: "0",
                            totalSpent: "0",
                        })
                        .returning();
                    resellerWalletId = created.id;
                    resellerPrevBalance = 0;
                } else {
                    resellerWalletId = walletRows[0].id;
                    resellerPrevBalance = parseFloat(walletRows[0].balance ?? "0");
                }

                // 4. Debit central
                const centralPrev = parseFloat(centralRow.balance);
                const centralAfterCents = Math.round(centralPrev * 100) - Math.round(amount * 100);
                const centralAfter = (centralAfterCents / 100).toFixed(2);

                await tx
                    .update(centralWallet)
                    .set({
                        balance: sql`${centralWallet.balance} - ${amountStr}`,
                        totalDisbursed: sql`${centralWallet.totalDisbursed} + ${amountStr}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(centralWallet.id, CENTRAL_WALLET_ID));

                // 5. Credit reseller
                await tx
                    .update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} + ${amountStr}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerWallets.id, resellerWalletId));

                const resellerAfterCents = Math.round(resellerPrevBalance * 100) + Math.round(amount * 100);
                const resellerAfter = (resellerAfterCents / 100).toFixed(2);

                // 6. Insert central_wallet_transactions row
                const [centralTx] = await tx
                    .insert(centralWalletTransactions)
                    .values({
                        type: "reseller_credit",
                        amountDzd: (-amount).toFixed(2), // negative = OUT
                        balanceAfter: centralAfter,
                        resellerId: input.resellerId,
                        adminUserId: user.id,
                        reference: input.reference ?? null,
                        notes: input.notes ?? null,
                    })
                    .returning();

                // 7. Insert reseller_transactions row (RECHARGE)
                const description = `Crédit depuis wallet central${input.reference ? ` ref: ${input.reference}` : ""}${input.notes ? ` — ${input.notes}` : ""}`;
                await tx.insert(resellerTransactions).values({
                    walletId: resellerWalletId,
                    type: "RECHARGE",
                    amount: amountStr,
                    description,
                    source: "ADMIN_RECHARGE",
                });

                return {
                    transactionId: centralTx.id,
                    centralNewBalance: centralAfter,
                    resellerNewBalance: resellerAfter,
                    centralPrev,
                    resellerPrevBalance,
                };
            });

            await logSecurityAction({
                userId: user.id,
                action: "CENTRAL_WALLET_DISBURSE_TO_RESELLER",
                entityType: "CENTRAL_WALLET",
                entityId: CENTRAL_WALLET_ID.toString(),
                newData: {
                    resellerId: input.resellerId,
                    amount,
                    reference: input.reference ?? null,
                    centralBefore: result.centralPrev,
                    centralAfter: result.centralNewBalance,
                    resellerBefore: result.resellerPrevBalance,
                    resellerAfter: result.resellerNewBalance,
                    transactionId: result.transactionId,
                },
            });

            revalidatePath("/admin/b2b/central-wallet");
            revalidatePath("/admin/b2b/wallets");

            return {
                success: true as const,
                data: {
                    centralNewBalance: result.centralNewBalance,
                    resellerNewBalance: result.resellerNewBalance,
                    transactionId: result.transactionId,
                },
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erreur crédit reseller";
            console.error("[central-wallet credit] failed:", message);
            return { success: false as const, error: message };
        }
    }
);

/**
 * Lists central wallet transactions with optional type filter + pagination.
 */
export const listCentralWalletTransactionsAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            page: z.number().int().min(1).default(1),
            limit: z.number().int().min(1).max(100).default(25),
            type: z.enum(["admin_topup", "reseller_credit", "adjustment"]).optional(),
        }),
    },
    async ({ page, limit, type }) => {
        const offset = (page - 1) * limit;
        const whereParts = [] as any[];
        if (type) whereParts.push(eq(centralWalletTransactions.type, type));
        const whereClause = whereParts.length > 0 ? and(...whereParts) : undefined;

        const items = await db
            .select({
                id: centralWalletTransactions.id,
                type: centralWalletTransactions.type,
                amountDzd: centralWalletTransactions.amountDzd,
                balanceAfter: centralWalletTransactions.balanceAfter,
                resellerId: centralWalletTransactions.resellerId,
                companyName: resellers.companyName,
                adminUserId: centralWalletTransactions.adminUserId,
                adminEmail: users.email,
                reference: centralWalletTransactions.reference,
                notes: centralWalletTransactions.notes,
                createdAt: centralWalletTransactions.createdAt,
            })
            .from(centralWalletTransactions)
            .leftJoin(resellers, eq(resellers.id, centralWalletTransactions.resellerId))
            .leftJoin(users, eq(users.id, centralWalletTransactions.adminUserId))
            .where(whereClause as any)
            .orderBy(desc(centralWalletTransactions.createdAt))
            .limit(limit)
            .offset(offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(centralWalletTransactions)
            .where(whereClause as any);

        return {
            success: true as const,
            data: {
                items,
                pagination: {
                    page,
                    limit,
                    total: Number(count) || 0,
                    totalPages: Math.ceil((Number(count) || 0) / limit),
                },
            },
        };
    }
);

/**
 * Lists active resellers + current wallet balance for the credit dropdown.
 */
export const listResellersForCreditAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({}).optional(),
    },
    async () => {
        const rows = await db
            .select({
                resellerId: resellers.id,
                companyName: resellers.companyName,
                status: resellers.status,
                walletBalance: resellerWallets.balance,
            })
            .from(resellers)
            .leftJoin(resellerWallets, eq(resellerWallets.resellerId, resellers.id))
            .where(eq(resellers.status, "ACTIVE"))
            .orderBy(resellers.companyName);

        return { success: true as const, data: rows };
    }
);
