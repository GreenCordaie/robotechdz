"use server";

import { redirect } from "next/navigation";
import { verify } from "otplib";

async function getDeps() {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const bcrypt = (await import("bcryptjs")).default;
    const { createSession, deleteSession, getSession } = await import("@/lib/auth");
    const { logSecurityAction } = await import("@/lib/security");
    const { encrypt, decrypt } = await import("@/lib/encryption");
    const { checkRateLimit, recordFailure, resetRateLimit } = await import("@/lib/rate-limit");

    return { db, users, eq, bcrypt, createSession, deleteSession, getSession, logSecurityAction, encrypt, decrypt, checkRateLimit, recordFailure, resetRateLimit };
}

export async function loginAction(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const honeypot = formData.get("website_url") as string;

    const { db, users, eq, bcrypt, createSession, logSecurityAction, checkRateLimit, recordFailure, resetRateLimit } = await getDeps();

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

    if (!email || !password) {
        return { success: false, error: "Veuillez remplir tous les champs" };
    }

    try {
        // 0. Rate Limit Check
        const limit = await checkRateLimit(email);
        if (limit.isBlocked) {
            return { success: false, error: `Trop de tentatives. Réessayez dans ${Math.ceil((limit.blockedUntil!.getTime() - Date.now()) / 60000)} minutes.` };
        }

        const userList = await db.select().from(users).where(eq(users.email, email)).limit(1);

        if (userList.length === 0) {
            await recordFailure(email);
            await logSecurityAction({
                userId: null,
                action: "AUTH_FAILED_USER_NOT_FOUND",
                entityType: "AUTH",
                newData: { email }
            });
            return { success: false, error: "Identifiants invalides" };
        }

        const user = userList[0];

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
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

        const { id, role, nom, tokenVersion } = user;
        await createSession({ id, role, tokenVersion });

        // Audit Success
        await logSecurityAction({
            userId: id,
            action: "AUTH_SUCCESS",
            entityType: "AUTH",
        });

        // Artificial delay to thwart brute-force bots
        await new Promise(resolve => setTimeout(resolve, 500));

        // Success
        return {
            success: true,
            user: { id, role, email, nom }
        };
    } catch (error) {
        console.error("🔥 LOGIN ACTION CRITICAL ERROR:", error);
        return { success: false, error: "Une erreur est survenue" };
    }
}

export async function verifyMfaAction(userId: number, code: string) {
    try {
        const { db, users, eq, createSession, logSecurityAction, encrypt, decrypt, checkRateLimit, recordFailure, resetRateLimit } = await getDeps();

        // 0. Rate Limit Check (MFA)
        const limit = await checkRateLimit(`mfa:${userId}`);
        if (limit.isBlocked) return { success: false, error: "Trop de tentatives MFA (15m)." };

        const userList = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (userList.length === 0) return { success: false, error: "Utilisateur introuvable" };

        const user = userList[0];
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
                newData: { code }
            });
            await recordFailure(`mfa:${user.id}`);
            return { success: false, error: "Code invalide" };
        }

        const { id, role, email, nom, tokenVersion } = user;
        await resetRateLimit(`mfa:${user.id}`);
        await createSession({ id, role, tokenVersion });

        await logSecurityAction({
            userId: id,
            action: isBackupCode ? "AUTH_MFA_BACKUP_SUCCESS" : "AUTH_MFA_SUCCESS",
            entityType: "AUTH",
        });

        return {
            success: true,
            user: { id, role, email, nom }
        };
    } catch (error) {
        return { success: false, error: "Erreur technique" };
    }
}

export async function logoutAction() {
    const { deleteSession } = await getDeps();
    await deleteSession();
    redirect("/admin/login");
}

export async function verifyPinAction(pin: string) {
    try {
        const { db, users, eq, bcrypt, getSession } = await getDeps();
        const session = await getSession();
        if (!session) return { success: false, error: "Session expirée" };

        const user = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);

        if (user.length === 0) return { success: false, error: "Utilisateur introuvable" };

        const isValid = await bcrypt.compare(pin, user[0].pinCode);

        return { success: isValid };
    } catch (error) {
        console.error("PIN verification error:", error);
        return { success: false, error: "Erreur" };
    }
}
