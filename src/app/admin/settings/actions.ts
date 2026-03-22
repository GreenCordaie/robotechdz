"use server";

import { db } from "@/db";
import {
    shopSettings, users, resellers, resellerWallets, resellerTransactions,
    supportTickets, digitalCodes, digitalCodeSlots, clients,
    clientPayments, productVariantSuppliers, auditLogs, orderItems, orders, supplierTransactions, suppliers,
    whatsappFaqs
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth, logSecurityAction } from "@/lib/security";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { encrypt } from "@/lib/encryption";
// Dynamic Query imports are handled inside actions to prevent client-side leakage
import { UserRole } from "@/lib/constants";

export const getShopSettingsAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        const { SystemQueries } = await import("@/services/queries/system.queries");
        const settings = await SystemQueries.getSettings();
        return { success: true, data: settings };
    }
);

export async function getPublicSettingsAction() {
    try {
        const { SystemQueries } = await import("@/services/queries/system.queries");
        const data = await SystemQueries.getPublicSettings();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: "Failed to fetch public settings" };
    }
}

export const saveShopSettingsAction = withAuth(
    {
        roles: [UserRole.ADMIN],
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
            whatsappSenderNumber: z.string().nullable().optional(),
            isB2bEnabled: z.boolean().optional(),
            defaultResellerDiscount: z.string().optional(),
            minResellerRecharge: z.string().optional(),
            isMaintenanceMode: z.boolean().optional(),
            allowedIps: z.string().nullable().optional(),
            whatsappMessageTemplate: z.string().nullable().optional(),
            chatbotEnabled: z.boolean().optional(),
            chatbotGreeting: z.string().nullable().optional(),
            whatsappWebhookUrl: z.string().nullable().optional(),
            whatsappVerifyToken: z.string().nullable().optional(),
            geminiApiKey: z.string().nullable().optional(),
            chatbotRole: z.string().nullable().optional(),
            whatsappApiUrl: z.string().nullable().optional(),
            whatsappApiKey: z.string().nullable().optional(),
            whatsappInstanceName: z.string().nullable().optional(),
            n8nWebhookUrl: z.string().nullable().optional(),
            usdExchangeRate: z.string().optional(),
        })
    },
    async (data, user) => {
        const { SystemQueries } = await import("@/services/queries/system.queries");
        const settings = await SystemQueries.getSettings();
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

export const activateTelegramWebhookAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            token: z.string(),
            url: z.string()
        })
    },
    async ({ token, url }) => {
        try {
            const webhookPath = url.endsWith('/') ? url + 'api/telegram/webhook' : url + '/api/telegram/webhook';
            const secretToken = process.env.TELEGRAM_SECRET_TOKEN || "flexbox_secure_token_2026";

            const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: webhookPath,
                    secret_token: secretToken,
                    allowed_updates: ["message", "edited_message", "callback_query"]
                })
            });

            const result = await response.json();
            if (result.ok) {
                return { success: true, message: result.description };
            } else {
                return { success: false, error: result.description };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
);

export const addUserAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            nom: z.string().min(1),
            email: z.string().email(),
            password: z.string().min(6),
            role: z.enum([UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR, UserRole.RESELLER]),
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
    { roles: [UserRole.ADMIN] },
    async () => {
        const { SystemQueries } = await import("@/services/queries/system.queries");
        const list = await SystemQueries.getUsers();
        return { success: true, data: list };
    }
);

export const updateUserAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            id: z.number(),
            data: z.object({
                nom: z.string().optional(),
                email: z.string().email().optional(),
                role: z.enum([UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR, UserRole.RESELLER]).optional(),
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
        roles: [UserRole.ADMIN],
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
    { roles: [UserRole.ADMIN] },
    async () => {
        const { ResellerQueries } = await import("@/services/queries/reseller.queries");
        const list = await ResellerQueries.getAll();
        return { success: true, data: list };
    }
);

export const deleteResellerAction = withAuth(
    {
        roles: [UserRole.ADMIN],
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
        roles: [UserRole.ADMIN],
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

                const passwordHash = await bcrypt.hash("reseller123", 10);
                const pinHash = await bcrypt.hash(data.pinCode, 10);

                const [newUser] = await tx.insert(users).values({
                    nom: data.nom,
                    email: data.email,
                    passwordHash,
                    role: UserRole.RESELLER,
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

export const testN8nAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        const { N8nService } = await import("@/services/n8n.service");
        const success = await N8nService.triggerEvent("INTEGRATION_TEST", {
            message: "Test depuis l'interface d'administration FLEXBOX DIRECT.",
            sender: "Admin UI",
        });

        if (success) {
            return { success: true, message: "Événement de test envoyé avec succès à n8n !" };
        } else {
            return { success: false, error: "Échec de l'envoi à n8n. Vérifiez l'URL du Webhook." };
        }
    }
);

export const getAuditLogsAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const { SystemQueries } = await import("@/services/queries/system.queries");
            const logs = await SystemQueries.getAuditLogs(100);
            return { success: true, data: logs };
        } catch (error) {
            console.error("Audit Log Fetch Error:", error);
            return { success: false, error: "Erreur lors de la lecture des logs d'audit." };
        }
    }
);

export const exportAuditLogsAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const { SystemQueries } = await import("@/services/queries/system.queries");
            const logs = await SystemQueries.getAuditLogs(10000); // Higher limit for export
            return { success: true, data: logs };
        } catch (error) {
            return { success: false, error: "Erreur lors de l'exportation des logs" };
        }
    }
);

export const generateBackupCodesAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async (_, user) => {
        const codes = Array.from({ length: 10 }, () =>
            crypto.randomBytes(4).toString("hex").toUpperCase()
        );
        await db.update(users).set({ mfaBackupCodes: encrypt(JSON.stringify(codes)) }).where(eq(users.id, user.id));
        return { success: true, data: codes };
    }
);

export const generateMfaSecretAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async (_, user) => {
        const secret = generateSecret();
        const otpauth = generateURI({ secret, label: user.email, issuer: "FLEXBOX DIRECT" });
        return { success: true, data: { secret, otpauth } };
    }
);

export const enableMfaAction = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({ secret: z.string(), code: z.string().length(6) }) },
    async ({ secret, code }, user) => {
        const isValid = verify({ token: code, secret });
        if (!isValid) return { success: false, error: "Code invalide" };
        await db.update(users).set({ twoFactorSecret: encrypt(secret) }).where(eq(users.id, user.id));
        return { success: true };
    }
);

export const disableMfaAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async (_, user) => {
        await db.update(users).set({ twoFactorSecret: null }).where(eq(users.id, user.id));
        return { success: true };
    }
);

export const resetProductionDataAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ confirmation: z.string() })
    },
    async (data, user) => {
        if (data.confirmation !== "PERMANENT DELETE") {
            return { success: false, error: "Confirmation incorrecte" };
        }

        try {
            await db.transaction(async (tx) => {
                await tx.delete(supportTickets);
                await tx.delete(clientPayments);
                await tx.delete(digitalCodeSlots);
                await tx.delete(digitalCodes);
                await tx.delete(orderItems);
                await tx.delete(orders);
                await tx.delete(resellerTransactions);
                await tx.delete(resellerWallets);
                await tx.delete(resellers);
                await tx.delete(supplierTransactions);
                await tx.delete(productVariantSuppliers);
                await tx.delete(suppliers);
                await tx.delete(clients);
                await tx.delete(auditLogs);
            });

            await logSecurityAction({
                userId: user.id,
                action: "FACTORY_RESET",
                entityType: "DATABASE",
                entityId: "SYSTEM",
                newData: { timestamp: new Date() }
            });

            revalidatePath("/admin/settings");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const exportDatabaseAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const data = {
                settings: await db.query.shopSettings.findMany(),
                users: await db.query.users.findMany(),
                suppliers: await db.query.suppliers.findMany(),
                orders: await db.query.orders.findMany(),
                resellers: await db.query.resellers.findMany(),
                categories: await db.query.categories.findMany(),
                products: await db.query.products.findMany(),
                exportDate: new Date().toISOString()
            };
            return { success: true, data };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getWhatsAppQrAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const { SystemQueries } = await import("@/services/queries/system.queries");
            const settings = await SystemQueries.getSettings();

            const wahaUrl = (settings.whatsappApiUrl || "http://localhost:3001").replace(/\/$/, "");
            const wahaKey = settings.whatsappApiKey || "abc";
            const session = settings.whatsappInstanceName || "default";
            const headers = { "X-Api-Key": wahaKey };

            // 1. Vérifier le statut de la session Waha
            const sessionRes = await fetch(`${wahaUrl}/api/sessions/${session}`, { headers, cache: "no-store" });
            if (!sessionRes.ok) {
                return { success: false, error: `Waha inaccessible (${sessionRes.status}). Vérifiez que Docker est démarré.` };
            }
            const sessionData = await sessionRes.json();
            const status = sessionData.status as string;

            if (status === "WORKING") {
                return { success: true, data: { status: "WORKING", phone: sessionData.me?.id || null } };
            }

            if (status === "SCAN_QR_CODE") {
                // Récupérer le screenshot du QR depuis Waha
                const qrRes = await fetch(`${wahaUrl}/api/screenshot?session=${session}`, { headers, cache: "no-store" });
                if (qrRes.ok) {
                    const buf = await qrRes.arrayBuffer();
                    const base64 = `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
                    return { success: true, data: { status: "SCAN_QR_CODE", qrBase64: base64 } };
                }
            }

            return { success: true, data: { status } };
        } catch (error: any) {
            console.error("Erreur getWhatsAppQrAction:", error);
            return { success: false, error: error.message };
        }
    }
);

export const getFaqsAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        const faqs = await db.query.whatsappFaqs.findMany({ orderBy: (f, { asc }) => [asc(f.id)] });
        return { success: true, faqs };
    }
);

export const saveFaqsAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            faqs: z.array(z.object({
                id: z.number().optional(),
                question: z.string().min(1),
                answer: z.string().min(1),
            }))
        })
    },
    async ({ faqs }) => {
        await db.transaction(async (tx) => {
            // Delete all existing, re-insert (simpler than upsert)
            await tx.delete(whatsappFaqs);
            if (faqs.length > 0) {
                await tx.insert(whatsappFaqs).values(
                    faqs.map(f => ({ question: f.question, answer: f.answer }))
                );
            }
        });
        revalidatePath("/admin/settings");
        const updated = await db.query.whatsappFaqs.findMany({ orderBy: (f, { asc }) => [asc(f.id)] });
        return { success: true, faqs: updated };
    }
);
