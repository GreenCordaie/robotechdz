import { getSession } from "./auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export class UnauthorizedError extends Error {
    constructor(message = "Accès non autorisé") {
        super(message);
        this.name = "UnauthorizedError";
    }
}

/**
 * Recharges the authenticated user from the database based on the session ID.
 * Ensures the role and existence are verified at the time of the action call.
 */
export async function getAuthenticatedUser() {
    const session = await getSession();
    if (!session || !session.userId) {
        return null;
    }

    const [user] = await db.select({
        id: users.id,
        nom: users.nom,
        email: users.email,
        role: users.role,
    })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);

    return user || null;
}

export type UserContext = { id: number; nom: string; email: string; role: string };

type ActionConfig<T extends z.ZodType> = {
    roles?: ("ADMIN" | "CAISSIER" | "TRAITEUR" | "RESELLER")[];
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
                throw new UnauthorizedError("Session expirée ou invalide");
            }

            // 2. Authorization Check (RBAC)
            if (config.roles && !config.roles.includes(user.role as any)) {
                throw new UnauthorizedError("Permissions insuffisantes");
            }

            // 3. Input Validation (Zod)
            let validatedInput = input;
            if (config.schema) {
                const result = config.schema.safeParse(input);
                if (!result.success) {
                    throw new Error(`Validation échouée: ${result.error.issues.map((e: any) => e.message).join(", ")}`);
                }
                validatedInput = result.data;
            }

            // 4. Execute Action
            return await action(validatedInput, user as UserContext);

        } catch (error: any) {
            console.error("Action Security Error:", error);
            const message = error instanceof UnauthorizedError ? error.message : "Une erreur de sécurité est survenue";
            return { success: false, error: message } as any;
        }
    };
}
