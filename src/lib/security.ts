import { getSession } from "./auth";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { headers } from "next/headers";
import { cache } from "react";
import { sendTelegramNotification } from "./telegram";

async function getSecurityDeps() {
    const { db } = await import("@/db");
    const { users, auditLogs, shopSettings } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    return { db, users, auditLogs, shopSettings, eq };
}

export class UnauthorizedError extends Error {
    constructor(message = "Accès non autorisé") {
        super(message);
        this.name = "UnauthorizedError";
    }
}

/**
 * Cache shop settings for the duration of the request to avoid redundant DB queries.
 */
export const getCachedSettings = cache(async () => {
    const { db } = await getSecurityDeps();
    return await db.query.shopSettings.findFirst();
});

/**
 * Recharges the authenticated user from the database based on the session ID.
 * Ensures the role and existence are verified at the time of the action call.
 */
export async function getAuthenticatedUser() {
    try {
        const session = await getSession();
        if (!session || !session.userId) {
            return null;
        }

        const { db, users, eq } = await getSecurityDeps();

        const [user] = await db.select({
            id: users.id,
            nom: users.nom,
            email: users.email,
            role: users.role,
            tokenVersion: users.tokenVersion,
            lastActiveAt: users.lastActiveAt,
        })
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);

        if (!user) return null;

        // JWT Revocation check: compare version in token with version in DB
        if (session.tokenVersion !== undefined && user.tokenVersion !== session.tokenVersion) {
            console.warn(`🔐 Revocation: Token version mismatch for user ${user.id} (Session: ${session.tokenVersion}, DB: ${user.tokenVersion})`);
            return null;
        }

        return user;
    } catch (error) {
        return null;
    }
}

export const getCurrentUser = getAuthenticatedUser;

/**
 * Sanitizes sensitive fields from log data objects.
 */
function sanitizeSensitiveData(data: any): any {
    if (!data || typeof data !== "object") return data;
    const sensitiveKeys = ["code", "password", "passwordHash", "pinCode", "secret", "twoFactorSecret", "mfaBackupCodes"];

    const sanitized = { ...data };
    for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
            sanitized[key] = "[MASKED]";
        } else if (typeof sanitized[key] === "object") {
            sanitized[key] = sanitizeSensitiveData(sanitized[key]);
        }
    }
    return sanitized;
}

/**
 * Logs a security or administrative action to the audit_logs table.
 */
export async function logSecurityAction(params: {
    userId: number | null;
    action: string;
    entityType?: string;
    entityId?: string;
    oldData?: any;
    newData?: any;
}) {
    const headerList = headers();
    const ipAddress = headerList.get("x-forwarded-for") || "unknown";
    const userAgent = headerList.get("user-agent") || "unknown";

    try {
        const { db, auditLogs } = await getSecurityDeps();
        await db.insert(auditLogs).values({
            userId: params.userId,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            oldData: sanitizeSensitiveData(params.oldData),
            newData: sanitizeSensitiveData(params.newData),
            ipAddress,
            userAgent,
        });
    } catch (error) {
        console.error("Critical: Failed to save audit log:", error);
    }
}

export type UserContext = { id: number; nom: string; email: string; role: string };

type ActionConfig<T extends z.ZodType> = {
    roles?: (UserRole)[];
    schema?: T;
};

/**
 * Higher-Order Function to wrap Server Actions with security checks.
 * - Authenticates the session.
 * - Authorizes based on roles.
 * - Validates inputs using Zod.
 */
export function withAuth<T extends z.ZodType, R>(
    config: ActionConfig<T>,
    action: (input: z.infer<T>, user: UserContext) => Promise<R>
) {
    return async (input: z.infer<T>): Promise<R | { success: false; error: string }> => {
        try {
            // 1. Authentication Check
            const user = await getAuthenticatedUser();
            if (!user) {
                const session = await getSession();
                console.warn("🔐 Auth Failed:", {
                    hasSession: !!session,
                    reason: session ? "User not found in DB" : "No session cookie"
                });
                throw new UnauthorizedError("Session expirée ou invalide");
            }

            // 2. Maintenance Mode Check
            // Allow ADMIN to bypass maintenance mode
            const settings = await getCachedSettings();
            if (user.role !== UserRole.ADMIN) {
                if (settings?.isMaintenanceMode) {
                    // Send alert for maintenance block
                    await sendTelegramNotification(
                        `🚨 ACCÈS BLOQUÉ: L'utilisateur ${user.nom} (${user.role}) a tenté d'accéder au système alors que le MODE MAINTENANCE est activé.`,
                        [UserRole.ADMIN]
                    ).catch(() => { });

                    throw new UnauthorizedError("Système en maintenance. Toutes les opérations sont suspendues.");
                }
            }

            // 3. IP Whitelisting (ADMIN only)
            if (user.role === UserRole.ADMIN && settings?.allowedIps) {
                const headerList = headers();

                // Secure IP extraction: prioritize headers that are harder to spoof depending on the proxy setup
                const ipAddress =
                    headerList.get("cf-connecting-ip") ||
                    headerList.get("x-real-ip") ||
                    headerList.get("x-forwarded-for")?.split(',').pop()?.trim() || // Last IP in chain is usually safer if proxy is trusted
                    "unknown";

                const allowedIpsList = settings.allowedIps.split(',').map(ip => ip.trim());

                if (allowedIpsList.length > 0 && !allowedIpsList.includes(ipAddress)) {
                    // Log attempt
                    await logSecurityAction({
                        userId: user.id,
                        action: "IP_WHITELIST_BLOCKED",
                        entityType: "SECURITY",
                        newData: { attemptedIp: ipAddress, allowedIps: settings.allowedIps }
                    });

                    // Telegram Alert
                    await sendTelegramNotification(
                        `🛑 ACCÈS IP BLOQUÉ: Tentative d'accès ADMIN depuis une IP non autorisée (${ipAddress}).`,
                        ['ADMIN']
                    ).catch(() => { });

                    throw new UnauthorizedError("Accès restreint : Votre adresse IP n'est pas autorisée.");
                }
            }

            // 4. Authorization Check (RBAC)
            if (config.roles && !config.roles.includes(user.role as any)) {
                // Log unauthorized access attempts for security review
                await logSecurityAction({
                    userId: user.id,
                    action: "UNAUTHORIZED_ACCESS_ATTEMPT",
                    entityType: "SERVER_ACTION",
                    newData: { actionName: action.name || "anonymous", attemptedRoles: config.roles }
                });

                // Escalate to Telegram for unauthorized attempts
                await sendTelegramNotification(
                    `⚠️ ALERTE SÉCURITÉ: Tentative d'accès non autorisé par ${user.nom} (${user.role}) à l'action ${action.name || "système"}.`,
                    [UserRole.ADMIN]
                ).catch(() => { });

                throw new UnauthorizedError("Permissions insuffisantes");
            }

            // 4. Input Validation (Zod)
            let validatedInput = input;
            if (config.schema) {
                const result = config.schema.safeParse(input);
                if (!result.success) {
                    throw new Error(`Validation échouée: ${result.error.issues.map((e: any) => e.message).join(", ")}`);
                }
                validatedInput = result.data;
            }

            // 5. Update Activity Timestamp
            try {
                const { db, users, eq } = await getSecurityDeps();
                await db.update(users)
                    .set({ lastActiveAt: new Date() })
                    .where(eq(users.id, user.id));
            } catch (e) {
                console.error("Activity Update Error:", e);
            }

            // 6. Execute Action
            return await action(validatedInput, user as UserContext);

        } catch (error: any) {
            console.error("Action Security Error:", error);
            const message = error instanceof UnauthorizedError ? error.message : `Une erreur de sécurité est survenue : ${error.message}`;
            return { success: false, error: message } as any;
        }
    };
}
