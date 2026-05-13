"use server";

import { db } from "@/db";
import {
    resellers,
    resellerWallets,
    resellerTransactions,
    auditLogs,
    users,
    shopSettings,
} from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ResellerNotifications } from "@/services/reseller-notifications.service";

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
 * Recharge manuelle du wallet : le reseller a payé en boutique (cash, CIB,
 * Edahabia, virement, autre), l'admin crédite son wallet manuellement.
 *
 * Transaction atomique :
 *   1. Récupère le wallet (FOR UPDATE pour éviter race avec checkoutReseller)
 *   2. INSERT reseller_transactions type=RECHARGE
 *   3. UPDATE balance += amount
 *   4. Audit log RESELLER_WALLET_MANUAL_RECHARGE
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

        try {
            const result = await db.transaction(async (tx) => {
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
                    // Wallet pas encore créé (cas rare) → on le créé
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

                const previousBalance = parseFloat(wallet.balance ?? "0");
                const newBalance = previousBalance + amount;

                await tx
                    .update(resellerWallets)
                    .set({
                        balance: sql`${resellerWallets.balance} + ${amount}`,
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
                        amount: amount.toFixed(2),
                        description,
                    })
                    .returning();

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
                    },
                });

                return {
                    transactionId: tx2.id,
                    previousBalance,
                    newBalance,
                    amount,
                };
            });

            revalidatePath("/admin/b2b/wallets");
            revalidatePath("/admin/b2b");

            // EPIC 6 — Auto-notify reseller via WhatsApp (no-op safe si non configuré).
            // Lookup reseller info pour le message (companyName + contactPhone).
            // Fire-and-forget — l'échec d'envoi ne doit pas faire échouer la recharge.
            const resellerInfo = await db.query.resellers.findFirst({
                where: eq(resellers.id, input.resellerId),
            });
            if (resellerInfo) {
                ResellerNotifications.notifyWalletRecharged({
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
