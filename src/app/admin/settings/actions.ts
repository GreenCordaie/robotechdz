"use server";

import { db } from "@/db";
import { shopSettings, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

// --- SHOP SETTINGS ACTIONS ---

export async function getShopSettingsAction() {
    try {
        const settings = await db.select().from(shopSettings).limit(1);
        return { success: true, data: settings[0] || null };
    } catch (error) {
        console.error("Error fetching settings:", error);
        return { success: false, error: "Erreur lors de la récupération des paramètres" };
    }
}

export async function saveShopSettingsAction(data: any) {
    try {
        const existing = await db.select().from(shopSettings).limit(1);

        if (existing.length > 0) {
            await db.update(shopSettings)
                .set(data)
                .where(eq(shopSettings.id, existing[0].id));
        } else {
            await db.insert(shopSettings).values(data);
        }

        revalidatePath("/admin/settings");
        return { success: true };
    } catch (error) {
        console.error("Error saving settings:", error);
        return { success: false, error: "Erreur lors de l'enregistrement" };
    }
}

// --- TEAM ACTIONS ---

export async function getUsersAction() {
    try {
        const team = await db.select().from(users);
        // Remove password hashes before sending to client
        const safeTeam = team.map(({ passwordHash, ...rest }) => rest);
        return { success: true, data: safeTeam };
    } catch (error) {
        console.error("Error fetching team:", error);
        return { success: false, error: "Erreur lors de la récupération de l'équipe" };
    }
}

export async function addUserAction(userData: {
    nom: string;
    email: string;
    password?: string;
    pinCode: string;
    role: "ADMIN" | "CAISSIER" | "TRAITEUR";
}) {
    try {
        // Simple hash (3 rounds for speed in local dev, adjust as needed)
        const passwordHash = userData.password
            ? await bcrypt.hash(userData.password, 10)
            : await bcrypt.hash("flexbox123", 10); // Default password

        await db.insert(users).values({
            nom: userData.nom,
            email: userData.email,
            passwordHash,
            pinCode: userData.pinCode,
            role: userData.role,
        });

        revalidatePath("/admin/settings");
        return { success: true };
    } catch (error: any) {
        console.error("Error adding user:", error);
        if (error.code === '23505') { // Unique constraint violation
            return { success: false, error: "Cet email est déjà utilisé" };
        }
        return { success: false, error: "Erreur lors de l'ajout du membre" };
    }
}

export async function updateUserAction(id: number, data: any) {
    try {
        const updateData = { ...data };
        if (data.password) {
            updateData.passwordHash = await bcrypt.hash(data.password, 10);
            delete updateData.password;
        }

        await db.update(users)
            .set(updateData)
            .where(eq(users.id, id));

        revalidatePath("/admin/settings");
        return { success: true };
    } catch (error) {
        console.error("Error updating user:", error);
        return { success: false, error: "Erreur lors de la mise à jour" };
    }
}

export async function deleteUserAction(id: number) {
    try {
        await db.delete(users).where(eq(users.id, id));
        revalidatePath("/admin/settings");
        return { success: true };
    } catch (error) {
        console.error("Error deleting user:", error);
        return { success: false, error: "Erreur lors de la suppression" };
    }
}

export async function testTelegramBotAction(token: string, chatId: string) {
    if (!token || !chatId) {
        return { success: false, error: "Token et Chat ID requis" };
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: "🚀 *FLEXBOX DIRECT* : Test de connexion réussi !\n\nVotre système est prêt à envoyer des notifications.",
                parse_mode: "Markdown",
            }),
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            return { success: true };
        } else {
            console.error("Telegram API Error:", data);
            return {
                success: false,
                error: data.description || "Erreur de l'API Telegram"
            };
        }
    } catch (error) {
        console.error("Fetch error:", error);
        return { success: false, error: "Erreur de connexion à l'API Telegram" };
    }
}

export async function setTelegramWebhookAction(token: string, appUrl: string) {
    if (!token || !appUrl) {
        return { success: false, error: "Token et URL de l'application requis" };
    }

    try {
        // Remove trailing slash from appUrl if present
        const cleanUrl = appUrl.replace(/\/$/, "");
        const webhookUrl = `${cleanUrl}/api/telegram/webhook`;
        const secretToken = process.env.TELEGRAM_SECRET_TOKEN || "flexbox_secure_token_2026";

        const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}&secret_token=${secretToken}`, {
            method: "POST",
        });

        const data = await response.json();

        if (response.ok && data.ok) {
            return { success: true };
        } else {
            console.error("Telegram Webhook Error:", data);
            return {
                success: false,
                error: data.description || "Erreur lors de la configuration du Webhook"
            };
        }
    } catch (error) {
        console.error("Webhook fetch error:", error);
        return { success: false, error: "Erreur de connexion à l'API Telegram" };
    }
}
