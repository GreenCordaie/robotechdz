"use server";

import { db } from "@/db";
import { shopSettings, users, resellers, resellerWallets, resellerTransactions, auditLogs } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth, logSecurityAction } from "@/lib/security";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { encrypt, decrypt } from "@/lib/encryption";

// Helper to get settings (internal)
async function getSettingsInternal() {
    const settings = await db.query.shopSettings.findFirst();
    if (!settings) {
        const [newSettings] = await db.insert(shopSettings).values({
            shopName: "FLEXBOX DIRECT",
        }).returning();
        return newSettings;
    }
    return settings;
}

export const getShopSettingsAction = withAuth(
    { roles: ["ADMIN"] },
    async () => {
        const settings = await getSettingsInternal();
        return { success: true, data: settings };
    }
);

export async function getPublicSettingsAction() {
    try {
        const settings = await db.query.shopSettings.findFirst();
        return {
            success: true,
            data: {
                isB2bEnabled: !!settings?.isB2bEnabled,
                isMaintenanceMode: !!settings?.isMaintenanceMode,
                shopName: settings?.shopName || "FLEXBOX DIRECT"
            }
        };
    } catch (error) {
        return { success: false, error: "Failed to fetch public settings" };
    }
}

export const saveShopSettingsAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            shopName: z.string().min(1),
            shopTel: z.string().nullable().optional(),
            shopAddress: z.string().nullable().optional(),
            raisonSociale: z.string().nullable().optional(),
            ein: z.string().nullable().optional(),
            footerMessage: z.string().nullable().optional(),
            showCashierOnReceipt: z.boolean().optional(),
            showDateTimeOnReceipt: z.boolean().optional(),
            showLogoOnReceipt: z.boolean().optional(),
            accentColor: z.string().optional(),
            logoUrl: z.string().nullable().optional(),
            dashboardLogoUrl: z.string().nullable().optional(),
            faviconUrl: z.string().nullable().optional(),
            telegramBotToken: z.string().nullable().optional(),
            telegramChatId: z.string().nullable().optional(),
            telegramChatIdAdmin: z.string().nullable().optional(),
            telegramChatIdCaisse: z.string().nullable().optional(),
            telegramChatIdTraiteur: z.string().nullable().optional(),
            webhookUrl: z.string().nullable().optional(),
            whatsappToken: z.string().nullable().optional(),
            whatsappPhoneId: z.string().nullable().optional(),
            isB2bEnabled: z.boolean().optional(),
            defaultResellerDiscount: z.string().optional(),
            minResellerRecharge: z.string().optional(),
            isMaintenanceMode: z.boolean().optional(),
            allowedIps: z.string().nullable().optional(),
        })
    },
    async (data, user) => {
        const settings = await getSettingsInternal();
        const oldData = { ...settings };
        await db.update(shopSettings).set(data).where(eq(shopSettings.id, settings.id));

        await logSecurityAction({
            userId: user.id,
            action: "UPDATE_SETTINGS",
            entityType: "SHOP_SETTINGS",
            entityId: settings.id.toString(),
            oldData,
            newData: data
        });

        revalidatePath("/admin/settings");
        return { success: true };
    }
);

export const addUserAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            nom: z.string().min(1),
            email: z.string().email(),
            password: z.string().min(6),
            role: z.enum(["ADMIN", "CAISSIER", "TRAITEUR", "RESELLER"]),
            pinCode: z.string().optional(),
            avatarUrl: z.string().nullable().optional()
        })
    },
    async (data, admin) => {
        const existing = await db.query.users.findFirst({ where: eq(users.email, data.email) });
        if (existing) return { success: false, error: "Email déjà utilisé" };

        const passwordHash = await bcrypt.hash(data.password, 10);
        const pinValue = data.pinCode || "0000";
        const pinHash = await bcrypt.hash(pinValue, 10);

        const [newUser] = await db.insert(users).values({
            nom: data.nom,
            email: data.email,
            passwordHash,
            role: data.role,
            pinCode: pinHash,
            avatarUrl: data.avatarUrl
        }).returning();

        await logSecurityAction({
            userId: admin.id,
            action: "CREATE_USER",
            entityType: "USER",
            entityId: newUser.id.toString(),
            newData: { nom: data.nom, email: data.email, role: data.role }
        });

        revalidatePath("/admin/settings");
        return { success: true };
    }
);

export const getUsersAction = withAuth(
    { roles: ["ADMIN"] },
    async () => {
        const list = await db.query.users.findMany({
            where: sql`${users.role} != 'RESELLER'`,
            orderBy: [desc(users.id)]
        });
        return { success: true, data: list };
    }
);

export const updateUserAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            id: z.number(),
            data: z.object({
                nom: z.string().optional(),
                email: z.string().email().optional(),
                role: z.enum(["ADMIN", "CAISSIER", "TRAITEUR", "RESELLER"]).optional(),
                pinCode: z.string().optional(),
                avatarUrl: z.string().nullable().optional(),
                password: z.string().min(6).optional()
            })
        })
    },
    async ({ id, data }, admin) => {
        const [oldUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        const updateValues: any = { ...data };
        if (data.password) {
            updateValues.passwordHash = await bcrypt.hash(data.password, 10);
            delete updateValues.password;
        }
        if (data.pinCode) {
            updateValues.pinCode = await bcrypt.hash(data.pinCode, 10);
        }

        await db.update(users).set(updateValues).where(eq(users.id, id));

        await logSecurityAction({
            userId: admin.id,
            action: "UPDATE_USER",
            entityType: "USER",
            entityId: id.toString(),
            oldData: oldUser ? { nom: oldUser.nom, email: oldUser.email, role: oldUser.role } : null,
            newData: { nom: data.nom, email: data.email, role: data.role }
        });

        revalidatePath("/admin/settings");
        return { success: true };
    }
);

export const deleteUserAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ id: z.number() })
    },
    async ({ id }, currentUser) => {
        if (id === currentUser.id) return { success: false, error: "Auto-suppression interdite" };
        const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);

        await db.delete(users).where(eq(users.id, id));

        await logSecurityAction({
            userId: currentUser.id,
            action: "DELETE_USER",
            entityType: "USER",
            entityId: id.toString(),
            oldData: targetUser ? { nom: targetUser.nom, email: targetUser.email, role: targetUser.role } : null
        });

        revalidatePath("/admin/settings");
        return { success: true };
    }
);

export const getResellersAction = withAuth(
    { roles: ["ADMIN"] },
    async () => {
        const list = await db.query.resellers.findMany({
            with: { user: true, wallet: true },
            orderBy: [desc(resellers.id)]
        });
        return { success: true, data: list };
    }
);

export const deleteResellerAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        try {
            await db.transaction(async (tx) => {
                const reseller = await tx.query.resellers.findFirst({ where: eq(resellers.id, id) });
                if (reseller) {
                    await tx.delete(users).where(eq(users.id, reseller.userId));
                    await tx.delete(resellers).where(eq(resellers.id, id));
                }
            });
            revalidatePath("/admin/settings");
            return { success: true };
        } catch (error) {
            return { success: false, error: "Erreur suppression revendeur" };
        }
    }
);

export const createResellerAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            companyName: z.string().min(1),
            contactPhone: z.string().min(1),
            email: z.string().email(),
            nom: z.string().min(1),
            pinCode: z.string().length(4),
            customDiscount: z.string().optional()
        })
    },
    async (data) => {
        try {
            return await db.transaction(async (tx) => {
                const existing = await tx.query.users.findFirst({ where: eq(users.email, data.email) });
                if (existing) return { success: false, error: "Email déjà utilisé" };

                const passwordHash = await bcrypt.hash("reseller123", 10); // Default password
                const pinHash = await bcrypt.hash(data.pinCode, 10);

                const [newUser] = await tx.insert(users).values({
                    nom: data.nom,
                    email: data.email,
                    passwordHash,
                    role: "RESELLER",
                    pinCode: pinHash
                }).returning();

                const [newReseller] = await tx.insert(resellers).values({
                    userId: newUser.id,
                    companyName: data.companyName,
                    contactPhone: data.contactPhone,
                    customDiscount: data.customDiscount || "5.00"
                }).returning();

                await tx.insert(resellerWallets).values({
                    resellerId: newReseller.id,
                    balance: "0.00"
                });

                revalidatePath("/admin/settings");
                return { success: true };
            });
        } catch (error) {
            return { success: false, error: "Erreur lors de la création du revendeur" };
        }
    }
);

// Communication stubs (Integrations)
export const testTelegramBotAction = withAuth(
    { roles: ["ADMIN"], schema: z.object({ token: z.string(), chatId: z.string() }) },
    async () => ({ success: true })
);

export const setTelegramWebhookAction = withAuth(
    { roles: ["ADMIN"], schema: z.object({ token: z.string(), url: z.string() }) },
    async () => ({ success: true })
);

export const testWhatsAppAction = withAuth(
    { roles: ["ADMIN"], schema: z.object({ token: z.string(), phoneId: z.string() }) },
    async () => ({ success: true })
);

export const getAuditLogsAction = withAuth(
    { roles: ["ADMIN"] },
    async () => {
        try {
            const logs = await db.query.auditLogs.findMany({
                orderBy: [desc(auditLogs.createdAt)],
                limit: 100,
                with: {
                    user: true
                }
            });
            return { success: true, data: logs };
        } catch (error) {
            console.error("Audit Log Fetch Error:", error);
            return { success: false, error: "Erreur lors de la lecture des logs d'audit. Vérifiez la base de données." };
        }
    }
);

export const generateBackupCodesAction = withAuth(
    { roles: ["ADMIN"] },
    async (_, user) => {
        const codes = Array.from({ length: 10 }, () =>
            crypto.randomBytes(4).toString("hex").toUpperCase()
        );

        await db.update(users)
            .set({ mfaBackupCodes: encrypt(JSON.stringify(codes)) })
            .where(eq(users.id, user.id));

        await logSecurityAction({
            userId: user.id,
            action: "GENERATE_BACKUP_CODES",
            entityType: "USER",
            entityId: user.id.toString()
        });

        return { success: true, data: codes };
    }
);

export const generateMfaSecretAction = withAuth(
    { roles: ["ADMIN"] },
    async (_, user) => {
        const secret = generateSecret();
        const otpauth = generateURI({
            secret,
            label: user.email,
            issuer: "FLEXBOX DIRECT"
        });
        return { success: true, data: { secret, otpauth } };
    }
);

export const enableMfaAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            secret: z.string(),
            code: z.string().length(6)
        })
    },
    async ({ secret, code }, user) => {
        const isValid = verify({ token: code, secret });
        if (!isValid) return { success: false, error: "Code invalide" };

        await db.update(users)
            .set({ twoFactorSecret: encrypt(secret) })
            .where(eq(users.id, user.id));

        await logSecurityAction({
            userId: user.id,
            action: "ENABLE_MFA",
            entityType: "USER",
            entityId: user.id.toString()
        });

        return { success: true };
    }
);

export const disableMfaAction = withAuth(
    { roles: ["ADMIN"] },
    async (_, user) => {
        await db.update(users)
            .set({ twoFactorSecret: null })
            .where(eq(users.id, user.id));

        await logSecurityAction({
            userId: user.id,
            action: "DISABLE_MFA",
            entityType: "USER",
            entityId: user.id.toString()
        });

        return { success: true };
    }
);
export const exportAuditLogsAction = withAuth(
    { roles: ["ADMIN"] },
    async (_, user) => {
        try {
            const logs = await db.query.auditLogs.findMany({
                orderBy: [desc(auditLogs.createdAt)],
                with: {
                    user: true
                }
            });

            await logSecurityAction({
                userId: user.id,
                action: "EXPORT_AUDIT_LOGS",
                entityType: "SECURITY",
            });

            return { success: true, data: logs };
        } catch (error) {
            console.error("Audit Log Export Error:", error);
            return { success: false, error: "Erreur lors de l'exportation des logs" };
        }
    }
);
