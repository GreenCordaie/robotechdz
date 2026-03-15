"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createSession, deleteSession, getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function loginAction(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
        return { success: false, error: "Veuillez remplir tous les champs" };
    }

    try {
        const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

        if (user.length === 0) {
            return { success: false, error: "Identifiants invalides" };
        }

        const isPasswordValid = await bcrypt.compare(password, user[0].passwordHash);

        if (!isPasswordValid) {
            return { success: false, error: "Identifiants invalides" };
        }

        const { passwordHash, ...safeUser } = user[0];
        await createSession(safeUser);

        // Success
        return { success: true, user: safeUser };
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: "Une erreur est survenue" };
    }
}

export async function logoutAction() {
    await deleteSession();
    redirect("/admin/login");
}

export async function verifyPinAction(pin: string) {
    try {
        const session = await getSession();
        if (!session) return { success: false, error: "Session expirée" };

        const user = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);

        if (user.length === 0) return { success: false, error: "Utilisateur introuvable" };

        const isValid = user[0].pinCode === pin;

        return { success: isValid };
    } catch (error) {
        console.error("PIN verification error:", error);
        return { success: false, error: "Erreur" };
    }
}
