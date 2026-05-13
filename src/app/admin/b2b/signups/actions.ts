"use server";

import { db } from "@/db";
import {
    resellerSignupRequests,
    resellers,
    resellerWallets,
    resellerTiers,
    users,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { ResellerNotifications } from "@/services/reseller-notifications.service";

/**
 * Liste les demandes (filtrables par statut). Tri : PENDING en haut, puis date desc.
 */
export const listSignupRequestsAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).default("PENDING"),
        }),
    },
    async ({ status }) => {
        const where = status === "ALL" ? undefined : eq(resellerSignupRequests.status, status);
        const list = await db
            .select()
            .from(resellerSignupRequests)
            .where(where ?? undefined as never)
            .orderBy(desc(resellerSignupRequests.createdAt));
        return { success: true as const, data: list };
    }
);

/**
 * Approuve une demande : crée user RESELLER + reseller + wallet + tier par défaut.
 * Génère un PIN de 4 chiffres aléatoire (admin doit le communiquer manuellement
 * pour cette première version — l'envoi auto email viendra avec EPIC 6).
 */
export const approveSignupRequestAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            requestId: z.number().int().positive(),
            customDiscount: z
                .string()
                .regex(/^\d+(\.\d{1,2})?$/, "Discount invalide")
                .optional(),
        }),
    },
    async ({ requestId, customDiscount }, user) => {
        const request = await db.query.resellerSignupRequests.findFirst({
            where: eq(resellerSignupRequests.id, requestId),
        });
        if (!request) return { success: false as const, error: "Demande introuvable" };
        if (request.status !== "PENDING") {
            return { success: false as const, error: `Déjà ${request.status.toLowerCase()}` };
        }

        // Vérifier que l'email n'existe pas déjà comme user
        const existingUser = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, request.email));
        if (existingUser.length > 0) {
            return {
                success: false as const,
                error: "Un utilisateur avec cet email existe déjà — refuser cette demande ou résoudre le conflit manuellement",
            };
        }

        // Génère un mot de passe + PIN aléatoires (admin les communique au reseller)
        const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
        const generatedPassword = Math.random().toString(36).slice(2, 12);
        const passwordHash = await bcrypt.hash(generatedPassword, 10);
        const pinHash = await bcrypt.hash(generatedPin, 10);

        // Tier par défaut (Bronze)
        const defaultTier = await db.query.resellerTiers.findFirst({
            where: eq(resellerTiers.isDefault, true),
        });

        try {
            const result = await db.transaction(async (tx) => {
                const [newUser] = await tx
                    .insert(users)
                    .values({
                        nom: request.companyName,
                        email: request.email,
                        passwordHash,
                        pinCode: pinHash,
                        role: "RESELLER",
                        tokenVersion: 1,
                    })
                    .returning();

                const [newReseller] = await tx
                    .insert(resellers)
                    .values({
                        userId: newUser.id,
                        companyName: request.companyName,
                        contactPhone: request.contactPhone,
                        customDiscount: customDiscount ?? null,
                        status: "ACTIVE",
                        tierId: defaultTier?.id ?? null,
                    })
                    .returning();

                await tx.insert(resellerWallets).values({
                    resellerId: newReseller.id,
                    balance: "0",
                    totalSpent: "0",
                });

                await tx
                    .update(resellerSignupRequests)
                    .set({
                        status: "APPROVED",
                        processedAt: new Date(),
                        processedByUserId: user.id,
                        createdResellerId: newReseller.id,
                    })
                    .where(eq(resellerSignupRequests.id, request.id));

                return {
                    resellerId: newReseller.id,
                    userId: newUser.id,
                    generatedPin,
                    generatedPassword,
                };
            });

            revalidatePath("/admin/b2b/signups");
            revalidatePath("/admin/b2b");

            // EPIC 6 — Envoi auto WhatsApp des credentials (no-op safe si non configuré).
            // Le modal post-approve les affiche aussi à l'admin en backup.
            ResellerNotifications.notifySignupApproved({
                companyName: request.companyName,
                contactPhone: request.contactPhone,
                email: request.email,
                password: result.generatedPassword,
                pin: result.generatedPin,
            }).catch((err) => {
                console.warn("[signup-approve] notification failed (non-bloquant):", err);
            });

            return {
                success: true as const,
                data: result,
            };
        } catch (err) {
            console.error("[signup] approve failed:", err);
            return { success: false as const, error: "Erreur création reseller" };
        }
    }
);

export const rejectSignupRequestAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            requestId: z.number().int().positive(),
            reason: z.string().min(3).max(500),
        }),
    },
    async ({ requestId, reason }, user) => {
        const request = await db.query.resellerSignupRequests.findFirst({
            where: eq(resellerSignupRequests.id, requestId),
        });
        if (!request) return { success: false as const, error: "Demande introuvable" };
        if (request.status !== "PENDING") {
            return { success: false as const, error: `Déjà ${request.status.toLowerCase()}` };
        }

        await db
            .update(resellerSignupRequests)
            .set({
                status: "REJECTED",
                rejectedReason: reason,
                processedAt: new Date(),
                processedByUserId: user.id,
            })
            .where(eq(resellerSignupRequests.id, requestId));

        // EPIC 6 — Notification WhatsApp polie du rejet (no-op safe si non configuré).
        ResellerNotifications.notifySignupRejected({
            companyName: request.companyName,
            contactPhone: request.contactPhone,
            email: request.email,
            reason,
        }).catch((err) => {
            console.warn("[signup-reject] notification failed (non-bloquant):", err);
        });

        revalidatePath("/admin/b2b/signups");
        return { success: true as const };
    }
);
