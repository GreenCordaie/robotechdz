"use server";

import { db } from "@/db";
import { digitalCodes, productVariants, products, digitalCodeSlots } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { encrypt, decrypt } from "@/lib/encryption";

export async function getSharedAccountsInventory() {
    const results = await db.query.productVariants.findMany({
        where: eq(productVariants.isSharing, true),
        with: {
            product: true,
            digitalCodes: {
                where: eq(digitalCodes.status, "DISPONIBLE"),
                with: {
                    slots: {
                        with: {
                            orderItem: {
                                with: {
                                    order: {
                                        with: {
                                            client: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: [desc(digitalCodes.createdAt)]
            }
        }
    });

    // Decrypt codes for admin view
    return results.map(v => ({
        ...v,
        digitalCodes: v.digitalCodes.map(dc => ({
            ...dc,
            code: decrypt(dc.code) || dc.code,
            slots: dc.slots.map(s => ({
                ...s,
                code: s.code ? (decrypt(s.code) || s.code) : null
            }))
        }))
    }));
}

export const getSharingVariants = withAuth(
    { roles: ["ADMIN"] },
    async () => {
        return await db.query.productVariants.findMany({
            where: eq(productVariants.isSharing, true),
            with: {
                product: true
            }
        });
    }
);

export const addSharedAccount = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            variantId: z.number(),
            email: z.string().min(1),
            password: z.string().min(1),
            slots: z.array(z.object({
                profileName: z.string().optional(),
                pinCode: z.string().optional()
            }))
        })
    },
    async ({ variantId, email, password, slots: slotsData }) => {
        try {
            const variant = await db.query.productVariants.findFirst({
                where: eq(productVariants.id, variantId)
            });

            if (!variant) throw new Error("Variante non trouvée");

            const fullCode = `${email} | ${password}`;
            const totalSlots = variant.totalSlots || 1;

            await db.transaction(async (tx) => {
                const [dc] = await tx.insert(digitalCodes).values({
                    variantId,
                    code: encrypt(fullCode),
                    status: "DISPONIBLE",
                    isDebitCompleted: false
                }).returning();

                const slots = Array.from({ length: totalSlots }).map((_, i) => ({
                    digitalCodeId: dc.id,
                    slotNumber: i + 1,
                    profileName: slotsData[i]?.profileName || `Profil ${i + 1}`,
                    code: slotsData[i]?.pinCode ? encrypt(slotsData[i].pinCode) : null,
                    status: "DISPONIBLE" as const
                }));

                await tx.insert(digitalCodeSlots).values(slots);
            });

            revalidatePath("/admin/comptes-partages");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const deleteSharedAccount = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        try {
            const account = await db.query.digitalCodes.findFirst({
                where: eq(digitalCodes.id, id),
                with: { slots: true }
            });

            if (!account) throw new Error("Compte non trouvé");

            const soldSlots = account.slots.filter(s => s.status === "VENDU").length;
            if (soldSlots > 0) {
                throw new Error("Impossible de supprimer un compte ayant des profils déjà vendus.");
            }

            await db.delete(digitalCodes).where(eq(digitalCodes.id, id));

            revalidatePath("/admin/comptes-partages");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const updateSharedAccount = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            id: z.number(),
            email: z.string().min(1),
            password: z.string().min(1),
            slots: z.array(z.object({
                id: z.number(),
                profileName: z.string().optional(),
                pinCode: z.string().optional()
            })).optional()
        })
    },
    async ({ id, email, password, slots: slotsData }) => {
        try {
            const fullCode = `${email} | ${password}`;

            await db.transaction(async (tx) => {
                await tx.update(digitalCodes)
                    .set({ code: encrypt(fullCode) })
                    .where(eq(digitalCodes.id, id));

                if (slotsData) {
                    for (const s of slotsData) {
                        await tx.update(digitalCodeSlots)
                            .set({
                                profileName: s.profileName,
                                code: s.pinCode ? encrypt(s.pinCode) : null
                            })
                            .where(eq(digitalCodeSlots.id, s.id));
                    }
                }
            });

            revalidatePath("/admin/comptes-partages");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
export const getAvailableVariantsForLinking = withAuth(
    { roles: ["ADMIN"] },
    async () => {
        return await db.query.productVariants.findMany({
            where: eq(productVariants.isSharing, false),
            with: {
                product: true
            }
        });
    }
);

export const linkProductToSharing = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            variantId: z.number(),
            totalSlots: z.number().min(1)
        })
    },
    async ({ variantId, totalSlots }) => {
        try {
            await db.update(productVariants)
                .set({
                    isSharing: true,
                    totalSlots
                })
                .where(eq(productVariants.id, variantId));

            revalidatePath("/admin/comptes-partages");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
