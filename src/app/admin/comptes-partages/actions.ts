"use server";

import { db } from "@/db";
import { digitalCodes, productVariants, products, digitalCodeSlots } from "@/db/schema";
import { eq, and, sql, desc, exists } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { encrypt, decrypt } from "@/lib/encryption";
import { N8nService } from "@/services/n8n.service";
import { UserRole } from "@/lib/constants";
import { AccountService } from "@/services/account.service";

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
    { roles: [UserRole.ADMIN] },
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
        roles: [UserRole.ADMIN],
        schema: z.object({
            variantId: z.number(),
            email: z.string().min(1),
            password: z.string().min(1),
            slots: z.array(z.object({
                profileName: z.string().optional(),
                pinCode: z.string().optional()
            })),
            purchasePrice: z.string().optional(),
            purchaseCurrency: z.string().optional().default("DZD"),
            expiresAt: z.string().optional()
        })
    },
    async ({ variantId, email, password, slots: slotsData, purchasePrice, purchaseCurrency, expiresAt }) => {
        try {
            const variant = await db.query.productVariants.findFirst({
                where: eq(productVariants.id, variantId),
                with: { product: true }
            });

            if (!variant) throw new Error("Variante non trouvée");

            const fullCode = `${email} | ${password}`;
            const totalSlots = variant.totalSlots || 1;

            await AccountService.addSharedAccountInternal({
                variantId,
                email,
                password,
                purchasePrice,
                purchaseCurrency,
                expiresAt,
                slotsConfig: slotsData
            });

            // Trigger Notion Sync (Async)
            N8nService.syncSharedAccountToNotion({
                productName: variant.product?.name || "Produit Inconnu",
                email: email,
                pass: password,
                variantName: variant.name,
                slotsCount: totalSlots
            });

            revalidatePath("/admin/comptes-partages");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

/**
 * Quick Entry: Auto-parses "email | pass" and creates account + profiles.
 * Upgraded to support multi-line bulk entry.
 */
export const addSharedAccountQuick = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            variantId: z.number().optional(), // Optional if autoClassify is true
            rawInput: z.string().min(3),
            purchasePrice: z.string().optional(),
            purchaseCurrency: z.string().optional().default("DZD"),
            expiresAt: z.string().optional(),
            autoClassify: z.boolean().default(false)
        })
    },
    async ({ variantId, rawInput, purchasePrice, purchaseCurrency, expiresAt, autoClassify }) => {
        try {
            const lines = rawInput.split("\n").map(l => l.trim()).filter(l => l.length > 5);
            let successCount = 0;
            let errors: string[] = [];

            // Fetch available sharing variants once if auto-classifying
            let sharingVariants: any[] = [];
            if (autoClassify) {
                sharingVariants = await db.query.productVariants.findMany({
                    where: eq(productVariants.isSharing, true),
                    with: { product: true }
                });
            }

            for (const line of lines) {
                try {
                    // Extract email and password
                    // Matches formats: "email | pass", "email : pass", "email pass", "product | email | pass"
                    const parts = line.split(/[|:\s]+/).filter(p => p.length > 0);

                    let targetVariantId = variantId;
                    let email = "";
                    let password = "";

                    if (autoClassify) {
                        // Try to find a variant whose name or product name matches any part of the line
                        const foundVariant = sharingVariants.find(v => {
                            const fullName = `${v.product?.name} ${v.name}`.toLowerCase();
                            return parts.some(p => p.length > 3 && fullName.includes(p.toLowerCase()));
                        });

                        if (!foundVariant) {
                            errors.push(`Ligne ignored (Produit non trouvé): ${line}`);
                            continue;
                        }
                        targetVariantId = foundVariant.id;

                        // Filter out parts that might be the product name to find email/pass
                        const dataParts = parts.filter(p => {
                            const fullName = `${foundVariant.product?.name} ${foundVariant.name}`.toLowerCase();
                            return !fullName.includes(p.toLowerCase());
                        });

                        if (dataParts.length < 2) {
                            errors.push(`Ligne invalide (Email/Pass manquants): ${line}`);
                            continue;
                        }
                        email = dataParts[0];
                        password = dataParts[1];
                    } else {
                        if (!variantId) throw new Error("ID Variante requis si l'auto-classification est désactivée");
                        if (parts.length < 2) {
                            errors.push(`Ligne invalide: ${line}`);
                            continue;
                        }
                        email = parts[0];
                        password = parts[1];
                    }

                    const variant = await db.query.productVariants.findFirst({
                        where: eq(productVariants.id, targetVariantId!),
                        with: { product: true }
                    });

                    if (!variant) continue;

                    await AccountService.addSharedAccountInternal({
                        variantId: targetVariantId!,
                        email,
                        password,
                        purchasePrice,
                        purchaseCurrency,
                        expiresAt
                    });

                    // Sync to Notion (Async) - We do this for each to maintain parity
                    N8nService.syncSharedAccountToNotion({
                        productName: variant.product?.name || "Produit Inconnu",
                        email: email,
                        pass: password,
                        variantName: variant.name,
                        slotsCount: variant.totalSlots || 1
                    }).catch(() => { });

                    successCount++;
                } catch (err) {
                    errors.push(`Erreur sur la ligne "${line}": ${(err as Error).message}`);
                }
            }

            revalidatePath("/admin/comptes-partages");

            return {
                success: true,
                message: `${successCount} compte(s) ajouté(s). ${errors.length} erreur(s).`,
                errors: errors.length > 0 ? errors : undefined
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

/**
 * Trigger manual pull from Notion for shared accounts.
 */
export const syncWithNotion = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            await N8nService.triggerEvent("NOTION_PULL_ACCOUNTS", {
                adminTriggered: true,
                requestedAt: new Date().toISOString()
            });
            return { success: true, message: "Synchronisation Notion lancée avec succès." };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const deleteSharedAccount = withAuth(
    {
        roles: [UserRole.ADMIN],
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
        roles: [UserRole.ADMIN],
        schema: z.object({
            id: z.number(),
            email: z.string().min(1),
            password: z.string().min(1),
            slots: z.array(z.object({
                id: z.number(),
                profileName: z.string().optional(),
                pinCode: z.string().optional()
            })).optional(),
            purchasePrice: z.string().optional(),
            purchaseCurrency: z.string().optional()
        })
    },
    async ({ id, email, password, slots: slotsData, purchasePrice, purchaseCurrency }) => {
        try {
            const fullCode = `${email} | ${password}`;

            await db.transaction(async (tx) => {
                await tx.update(digitalCodes)
                    .set({
                        code: encrypt(fullCode),
                        purchasePrice: purchasePrice || null,
                        purchaseCurrency: purchaseCurrency || "DZD"
                    })
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
    { roles: [UserRole.ADMIN] },
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
        roles: [UserRole.ADMIN],
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
export const attribuerSlotAutomatiqueAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.TRAITEUR],
        schema: z.object({
            orderItemId: z.number(),
            variantId: z.number()
        })
    },
    async ({ orderItemId, variantId }) => {
        try {
            return await db.transaction(async (tx) => {
                // 1. Try to find a local available slot
                const availableSlot = await tx.query.digitalCodeSlots.findFirst({
                    where: (table, { and, eq }) => and(
                        eq(table.status, "DISPONIBLE"),
                        exists(
                            tx.select()
                                .from(digitalCodes)
                                .where(and(
                                    eq(digitalCodes.id, table.digitalCodeId),
                                    eq(digitalCodes.variantId, variantId),
                                    eq(digitalCodes.status, "DISPONIBLE")
                                ))
                        )
                    )
                });

                if (!availableSlot) {
                    // 2. FALLBACK: Notify n8n to pull from Notion immediately
                    // This is Fire & Forget for the background sync, but we notify user.
                    const variant = await tx.query.productVariants.findFirst({
                        where: eq(productVariants.id, variantId),
                        with: { product: true }
                    });

                    N8nService.triggerEvent("NOTION_AUTO_PULL", {
                        variantId,
                        variantName: variant?.name,
                        productName: variant?.product?.name,
                        requestedBy: "TRAITEUR_AUTO"
                    }).catch(() => { });

                    throw new Error("🚨 Stock local épuisé. Une demande de récupération automatique (Auto-Pull) a été envoyée à Notion. Veuillez réessayer dans quelques secondes.");
                }

                // 3. Assign the slot
                await tx.update(digitalCodeSlots)
                    .set({
                        status: "VENDU",
                        orderItemId
                    })
                    .where(eq(digitalCodeSlots.id, availableSlot.id));

                // 4. Check parent code status
                const remainingSlots = await tx.query.digitalCodeSlots.findMany({
                    where: (dcs, { and, eq }) => and(
                        eq(dcs.digitalCodeId, availableSlot.digitalCodeId),
                        eq(dcs.status, "DISPONIBLE")
                    )
                });

                if (remainingSlots.length === 0) {
                    await tx.update(digitalCodes)
                        .set({ status: "VENDU" })
                        .where(eq(digitalCodes.id, availableSlot.digitalCodeId));
                }

                revalidatePath("/admin/traitement");
                return { success: true };
            });
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
