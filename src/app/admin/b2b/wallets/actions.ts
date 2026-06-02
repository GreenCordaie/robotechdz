"use server";

import { db } from "@/db";
import {
    resellers,
    resellerWallets,
    resellerTransactions,
    auditLogs,
    users,
    shopSettings,
    centralWallet,
    centralWalletTransactions,
} from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ResellerNotifications } from "@/services/reseller-notifications.service";

const CENTRAL_WALLET_ID = 1;

/**
 * Ensures the singleton central wallet row exists. Idempotent.
 * Kept here (duplicated with central-wallet/actions.ts) to avoid cross-imports
 * between two "use server" files which Next.js sometimes mis-bundles.
 */
async function ensureCentralWalletExists(): Promise<void> {
    await db
        .insert(centralWallet)
        .values({
            id: CENTRAL_WALLET_ID,
            balance: "0",
            totalToppedUp: "0",
            totalDisbursed: "0",
        })
        .onConflictDoNothing({ target: centralWallet.id });
}

/**
 * Vue admin de tous les wallets reseller : balance + tier + dernière activité.
 * Sert de point d'entrée pour la recharge manuelle (le reseller vient en
 * boutique, paie cash/carte, admin crédite manuellement son wallet).
 */
export const listResellerWalletsForAdminAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            search: z.string().optional(),
        }),
    },
    async ({ search }) => {
        const rows = await db
            .select({
                resellerId: resellers.id,
                companyName: resellers.companyName,
                contactPhone: resellers.contactPhone,
                resellerStatus: resellers.status,
                userEmail: users.email,
                walletId: resellerWallets.id,
                balance: resellerWallets.balance,
                totalSpent: resellerWallets.totalSpent,
                updatedAt: resellerWallets.updatedAt,
            })
            .from(resellers)
            .innerJoin(users, eq(users.id, resellers.userId))
            .leftJoin(resellerWallets, eq(resellerWallets.resellerId, resellers.id))
            .orderBy(desc(resellers.createdAt));

        const filtered = search
            ? rows.filter(
                  (r) =>
                      r.companyName.toLowerCase().includes(search.toLowerCase()) ||
                      r.userEmail.toLowerCase().includes(search.toLowerCase()) ||
                      (r.contactPhone ?? "").includes(search)
              )
            : rows;

        return { success: true as const, data: filtered };
    }
);

/**
 * Recharge manuelle du wallet reseller — passage OBLIGATOIRE par le wallet central.
 *
 * Le reseller a payé en boutique (cash, CIB, Edahabia, virement, autre). Pour que
 * la compta B2B reste cohérente, on enregistre l'encaissement ET le décaissement
 * dans le central — net = 0 sur le central mais trace complète des deux flux.
 *
 * Transaction atomique :
 *   1. Lock central_wallet FOR UPDATE
 *   2. Lock/crée reseller_wallet FOR UPDATE
 *   3. central += amount   → insert central_wallet_transactions type=admin_topup (cash in)
 *   4. central -= amount   → insert central_wallet_transactions type=reseller_credit (cash out)
 *      (net central inchangé, mais both topped_up and disbursed counters bougent)
 *   5. reseller += amount  → insert reseller_transactions type=RECHARGE
 *   6. Audit log RESELLER_WALLET_MANUAL_RECHARGE
 *
 * Ainsi le central reste la source de vérité unique : impossible de créditer
 * un reseller sans laisser de trace côté central.
 *
 * AUCUN appel externe (Telegram/WhatsApp/email). L'admin communique
 * manuellement au reseller via le canal de son choix.
 */
export const adminRechargeWalletAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            resellerId: z.number().int().positive(),
            amountDzd: z
                .string()
                .regex(/^\d+(\.\d{1,2})?$/, "Montant invalide")
                .refine((s) => parseFloat(s) > 0, "Montant doit être > 0"),
            method: z.enum(["CASH", "CIB", "EDAHABIA", "BANK_TRANSFER", "OTHER"]),
            referenceNumber: z.string().max(80).optional(),
            note: z.string().max(500).optional(),
        }),
    },
    async (input, user) => {
        const amount = parseFloat(input.amountDzd);

        // Récupère min recharge depuis shop_settings (optionnel)
        const settings = await db.select({ minRecharge: shopSettings.minResellerRecharge })
            .from(shopSettings).limit(1);
        const minRecharge = settings[0]?.minRecharge
            ? parseFloat(settings[0].minRecharge)
            : 0;
        if (minRecharge > 0 && amount < minRecharge) {
            return {
                success: false as const,
                error: `Montant minimum : ${minRecharge} DZD`,
            };
        }

        await ensureCentralWalletExists();

        const amountStr = amount.toFixed(2);
        const referenceText = `${input.method}${input.referenceNumber ? ` #${input.referenceNumber}` : ""}`;

        try {
            const result = await db.transaction(async (tx) => {
                // 1. Lock central wallet
                const centralRows = (await tx.execute(
                    sql`SELECT id, balance FROM central_wallet
                        WHERE id = ${CENTRAL_WALLET_ID}
                        FOR UPDATE`
                )) as unknown as Array<{ id: number; balance: string }>;
                const centralRow = centralRows[0];
                if (!centralRow) throw new Error("Wallet central introuvable");
                const centralPrev = parseFloat(centralRow.balance);

                // 2. Lookup + lock reseller
                const reseller = await tx.query.resellers.findFirst({
                    where: eq(resellers.id, input.resellerId),
                    with: { wallet: true },
                });
                if (!reseller) {
                    throw new Error("Reseller introuvable");
                }
                if (reseller.status !== "ACTIVE") {
                    throw new Error("Reseller suspendu — recharge bloquée");
                }

                let wallet = reseller.wallet;
                if (!wallet) {
                    const [newWallet] = await tx
                        .insert(resellerWallets)
                        .values({
                            resellerId: reseller.id,
                            balance: "0",
                            totalSpent: "0",
                        })
                        .returning();
                    wallet = newWallet;
                }

                // Re-lock the wallet row inside the tx to avoid race with checkout
                const walletLockedRows = (await tx.execute(
                    sql`SELECT id, balance FROM reseller_wallets
                        WHERE id = ${wallet.id}
                        FOR UPDATE`
                )) as unknown as Array<{ id: number; balance: string }>;
                const lockedWallet = walletLockedRows[0];
                if (!lockedWallet) throw new Error("Wallet reseller introuvable");
                const previousBalance = parseFloat(lockedWallet.balance ?? "0");

                // 3. Central IN — record cash received (admin_topup)
                const centralAfterTopupCents =
                    Math.round(centralPrev * 100) + Math.round(amount * 100);
                const centralAfterTopup = (centralAfterTopupCents / 100).toFixed(2);
                await tx
                    .update(centralWallet)
                    .set({
                        balance: sql`${centralWallet.balance} + ${amountStr}`,
                        totalToppedUp: sql`${centralWallet.totalToppedUp} + ${amountStr}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(centralWallet.id, CENTRAL_WALLET_ID));

                const [topupTx] = await tx
                    .insert(centralWalletTransactions)
                    .values({
                        type: "admin_topup",
                        amountDzd: amountStr,
                        balanceAfter: centralAfterTopup,
                        adminUserId: user.id,
                        reference: referenceText,
                        notes:
                            `Pass-through recharge reseller #${reseller.id} ${reseller.companyName}` +
                            (input.note ? ` — ${input.note}` : ""),
                    })
                    .returning();

                // 4. Central OUT — disburse to reseller (reseller_credit)
                const centralAfterDisburseCents =
                    centralAfterTopupCents - Math.round(amount * 100);
                const centralAfterDisburse = (centralAfterDisburseCents / 100).toFixed(2);
                await tx
                    .update(centralWallet)
                    .set({
                        balance: sql`${centralWallet.balance} - ${amountStr}`,
                        totalDisbursed: sql`${centralWallet.totalDisbursed} + ${amountStr}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(centralWallet.id, CENTRAL_WALLET_ID));

                const [disburseTx] = await tx
                    .insert(centralWalletTransactions)
                    .values({
                        type: "reseller_credit",
                        amountDzd: (-amount).toFixed(2),
                        balanceAfter: centralAfterDisburse,
                        resellerId: reseller.id,
                        adminUserId: user.id,
                        reference: referenceText,
                        notes:
                            `Pass-through depuis recharge directe (paire avec central tx #${topupTx.id})` +
                            (input.note ? ` — ${input.note}` : ""),
                    })
                    .returning();

                // 5. Credit reseller wallet
                const newBalance = previousBalance + amount;
                await tx
                    .update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} + ${amountStr}`,
                        updatedAt: new Date(),
                    })
                    .where(eq(resellerWallets.id, wallet.id));

                const description = `Recharge admin (${input.method})${
                    input.referenceNumber ? ` ref: ${input.referenceNumber}` : ""
                }${input.note ? ` — ${input.note}` : ""}`;

                const [tx2] = await tx
                    .insert(resellerTransactions)
                    .values({
                        walletId: wallet.id,
                        type: "RECHARGE",
                        amount: amountStr,
                        description,
                        source: "ADMIN_RECHARGE",
                    })
                    .returning();

                // 6. Audit log
                await tx.insert(auditLogs).values({
                    userId: user.id,
                    action: "RESELLER_WALLET_MANUAL_RECHARGE",
                    entityType: "RESELLER_WALLET",
                    entityId: wallet.id.toString(),
                    newData: {
                        resellerId: reseller.id,
                        companyName: reseller.companyName,
                        amount,
                        method: input.method,
                        referenceNumber: input.referenceNumber ?? null,
                        previousBalance,
                        newBalance,
                        transactionId: tx2.id,
                        centralTopupTxId: topupTx.id,
                        centralDisburseTxId: disburseTx.id,
                    },
                });

                return {
                    transactionId: tx2.id,
                    previousBalance,
                    newBalance,
                    amount,
                    centralTopupTxId: topupTx.id,
                    centralDisburseTxId: disburseTx.id,
                };
            });

            revalidatePath("/admin/b2b/wallets");
            revalidatePath("/admin/b2b");
            revalidatePath("/admin/b2b/central-wallet");

            // EPIC 6 — Auto-notify reseller via WhatsApp (no-op safe si non configuré).
            // Lookup reseller info pour le message (companyName + contactPhone).
            // Fire-and-forget — l'échec d'envoi ne doit pas faire échouer la recharge.
            const resellerInfo = await db.query.resellers.findFirst({
                where: eq(resellers.id, input.resellerId),
            });
            if (resellerInfo) {
                ResellerNotifications.notifyWalletRecharged({
                    resellerId: resellerInfo.id,
                    companyName: resellerInfo.companyName,
                    contactPhone: resellerInfo.contactPhone,
                    previousBalance: result.previousBalance,
                    newBalance: result.newBalance,
                    amount: result.amount,
                    method: input.method,
                }).catch((err) => {
                    console.warn("[recharge] notification failed (non-bloquant):", err);
                });
            }

            // EPIC 1 / Phase G — dispatch outbound webhook wallet.recharged
            const { dispatchResellerEvent } = await import("@/services/webhook-dispatcher.service");
            dispatchResellerEvent(input.resellerId, "wallet.recharged", {
                amount: result.amount,
                method: input.method,
                referenceNumber: input.referenceNumber ?? null,
                previousBalance: result.previousBalance,
                newBalance: result.newBalance,
                transactionId: result.transactionId,
            }).catch((err) => {
                console.warn("[recharge] webhook dispatch failed (non-bloquant):", err);
            });

            return { success: true as const, data: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erreur recharge";
            console.error("[recharge] failed:", message);
            return { success: false as const, error: message };
        }
    }
);

/**
 * Historique des recharges récentes (audit / reporting admin).
 */
export const listRecentRechargesAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            resellerId: z.number().int().optional(),
            limit: z.number().int().min(1).max(200).default(50),
        }),
    },
    async ({ resellerId, limit }) => {
        const whereParts = [eq(resellerTransactions.type, "RECHARGE")];
        if (resellerId) {
            // Filter via wallet → reseller mapping
            const wallets = await db
                .select({ id: resellerWallets.id })
                .from(resellerWallets)
                .where(eq(resellerWallets.resellerId, resellerId));
            const walletIds = wallets.map((w) => w.id);
            if (walletIds.length === 0) {
                return { success: true as const, data: [] };
            }
            whereParts.push(sql`${resellerTransactions.walletId} IN (${sql.join(walletIds.map(id => sql`${id}`), sql`, `)})`);
        }

        const list = await db
            .select({
                id: resellerTransactions.id,
                walletId: resellerTransactions.walletId,
                amount: resellerTransactions.amount,
                description: resellerTransactions.description,
                createdAt: resellerTransactions.createdAt,
                resellerId: resellers.id,
                companyName: resellers.companyName,
            })
            .from(resellerTransactions)
            .innerJoin(resellerWallets, eq(resellerWallets.id, resellerTransactions.walletId))
            .innerJoin(resellers, eq(resellers.id, resellerWallets.resellerId))
            .where(and(...whereParts))
            .orderBy(desc(resellerTransactions.createdAt))
            .limit(limit);

        return { success: true as const, data: list };
    }
);
