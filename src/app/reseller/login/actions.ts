"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { logSecurityAction } from "@/lib/security";
import { verify } from "otplib";
import { encrypt, decrypt } from "@/lib/encryption";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/rate-limit";

export async function loginResellerAction(email: string, pin: string, honeypot?: string) {
    // 1. Honeypot check
    if (honeypot) {
        await logSecurityAction({
            userId: null,
            action: "AUTH_BOT_DETECTED",
            entityType: "AUTH",
            newData: { email, source: "Honeypot" }
        });
        return { success: false, error: "Connexion refusée" };
    }

    if (!email || !pin) {
        return { success: false, error: "Email et PIN requis" };
    }

    try {
        // 0. Rate Limit Check
        const limit = await checkRateLimit(email);
        if (limit.isBlocked) {
            return { success: false, error: `Trop de tentatives. Réessayez dans ${Math.ceil((limit.blockedUntil!.getTime() - Date.now()) / 60000)} minutes.` };
        }

        // Find user by email and role RESELLER
        const user = await db.query.users.findFirst({
            where: and(
                eq(users.email, email),
                eq(users.role, "RESELLER")
            )
        });

        if (!user) {
            await recordFailure(email);
            await logSecurityAction({
                userId: null,
                action: "AUTH_FAILED_USER_NOT_FOUND",
                entityType: "AUTH",
                newData: { email, role: "RESELLER" }
            });
            return { success: false, error: "Identifiants invalides ou accès non autorisé" };
        }

        // Verify PIN securely using bcrypt
        const isPinValid = await bcrypt.compare(pin, user.pinCode);

        if (!isPinValid) {
            await recordFailure(email);
            await logSecurityAction({
                userId: user.id,
                action: "AUTH_FAILED_WRONG_PASSWORD",
                entityType: "AUTH",
                newData: { email }
            });
            return { success: false, error: "Identifiants invalides" };
        }

        // Reset on success
        await resetRateLimit(email);

        // 2FA CHECK
        if (user.twoFactorSecret) {
            return {
                success: true,
                mfaRequired: true,
                tempUserId: user.id
            };
        }

        // Create secure session
        await createSession({
            id: user.id,
            role: user.role,
            tokenVersion: user.tokenVersion
        });

        // Audit Success
        await logSecurityAction({
            userId: user.id,
            action: "AUTH_SUCCESS",
            entityType: "AUTH",
            newData: { role: "RESELLER" }
        });

        // Anti-brute-force delay
        await new Promise(resolve => setTimeout(resolve, 500));

        return { success: true };
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: "Une erreur est survenue lors de la connexion" };
    }
}

export async function verifyResellerMfaAction(userId: number, code: string) {
    try {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId)
        });

        if (!user || user.role !== "RESELLER") return { success: false, error: "Utilisateur introuvable" };
        if (!user.twoFactorSecret) return { success: false, error: "2FA non configuré" };

        let isValid: any = verify({ token: code, secret: decrypt(user.twoFactorSecret) as string });
        let isBackupCode = false;

        if (!isValid && user.mfaBackupCodes) {
            const backupCodes: string[] = JSON.parse(decrypt(user.mfaBackupCodes) as string);
            const codeIndex = backupCodes.indexOf(code.toUpperCase());

            if (codeIndex !== -1) {
                isValid = true;
                isBackupCode = true;
                // Remove used backup code
                backupCodes.splice(codeIndex, 1);
                await db.update(users)
                    .set({ mfaBackupCodes: backupCodes.length === 0 ? null : encrypt(JSON.stringify(backupCodes)) })
                    .where(eq(users.id, user.id));
            }
        }

        if (!isValid) {
            await logSecurityAction({
                userId: user.id,
                action: "AUTH_MFA_FAILED",
                entityType: "AUTH",
                newData: { role: "RESELLER", code }
            });
            return { success: false, error: "Code invalide" };
        }

        await createSession({
            id: user.id,
            role: user.role,
            tokenVersion: user.tokenVersion
        });

        await logSecurityAction({
            userId: user.id,
            action: isBackupCode ? "AUTH_MFA_BACKUP_SUCCESS" : "AUTH_MFA_SUCCESS",
            entityType: "AUTH",
            newData: { role: "RESELLER" }
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: "Erreur technique" };
    }
}
