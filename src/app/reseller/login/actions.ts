"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSession } from "@/lib/auth";

import bcrypt from "bcryptjs";

export async function loginResellerAction(email: string, pin: string) {
    if (!email || !pin) {
        return { success: false, error: "Email et PIN requis" };
    }

    try {
        // Find user by email and role RESELLER
        const user = await db.query.users.findFirst({
            where: and(
                eq(users.email, email),
                eq(users.role, "RESELLER")
            )
        });

        if (!user) {
            return { success: false, error: "Identifiants invalides ou accès non autorisé" };
        }

        // Verify PIN securely using bcrypt
        const isPinValid = await bcrypt.compare(pin, user.pinCode);

        if (!isPinValid) {
            return { success: false, error: "Identifiants invalides" };
        }

        // Create secure session
        await createSession({
            id: user.id,
            role: user.role
        });

        // Anti-brute-force delay
        await new Promise(resolve => setTimeout(resolve, 500));

        return { success: true };
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: "Une erreur est survenue lors de la connexion" };
    }
}
