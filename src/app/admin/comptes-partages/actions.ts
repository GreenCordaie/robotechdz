"use server";

import { db } from "@/db";
import { digitalCodes, productVariants, products, digitalCodeSlots, auditLogs } from "@/db/schema";
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

    // Decrypt codes for admin view — outlookPassword is NEVER exposed (only hasOutlookPassword boolean)
    return results.map(v => ({
        ...v,
        digitalCodes: v.digitalCodes.map(dc => ({
            ...dc,
            code: decrypt(dc.code) || dc.code,
            outlookPassword: undefined, // never expose
            hasOutlookPassword: !!dc.outlookPassword,
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
            outlookPassword: z.string().optional(),
            slots: z.array(z.object({
                profileName: z.string().optional(),
                pinCode: z.string().optional()
            })),
            purchasePrice: z.string().optional(),
            purchaseCurrency: z.string().optional().default("DZD"),
            expiresAt: z.string().optional()
        })
    },
    async ({ variantId, email, password, outlookPassword, slots: slotsData, purchasePrice, purchaseCurrency, expiresAt }) => {
        try {
            const variant = await db.query.productVariants.findFirst({
                where: eq(productVariants.id, variantId),
                with: { product: true }
            });

            if (!variant) throw new Error("Variante non trouvée");

            const totalSlots = variant.totalSlots || 1;

            const result = await AccountService.addSharedAccountInternal({
                variantId,
                email,
                password,
                outlookPassword,
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
            return { success: true, generatedPins: result.generatedPins };
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

                    const outlookPassword = parts.length >= 3 ? parts[2] : undefined;

                    await AccountService.addSharedAccountInternal({
                        variantId: targetVariantId!,
                        email,
                        password,
                        outlookPassword,
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
            outlookPassword: z.string().optional(),
            slots: z.array(z.object({
                id: z.number(),
                profileName: z.string().optional(),
                pinCode: z.string().optional()
            })).optional(),
            purchasePrice: z.string().optional(),
            purchaseCurrency: z.string().optional()
        })
    },
    async ({ id, email, password, outlookPassword, slots: slotsData, purchasePrice, purchaseCurrency }) => {
        try {
            const fullCode = `${email} | ${password}`;

            await db.transaction(async (tx) => {
                const updateData: Record<string, any> = {
                    code: encrypt(fullCode),
                    purchasePrice: purchasePrice || null,
                    purchaseCurrency: purchaseCurrency || "DZD"
                };
                if (outlookPassword !== undefined) {
                    updateData.outlookPassword = outlookPassword ? encrypt(outlookPassword) : null;
                }

                await tx.update(digitalCodes)
                    .set(updateData)
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

export const getSharedAccountsHistory = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        const results = await db.query.digitalCodes.findMany({
            where: eq(digitalCodes.status, "VENDU"),
            with: {
                variant: {
                    with: {
                        product: true
                    }
                },
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
            orderBy: [desc(digitalCodes.id)],
            limit: 50
        });

        // Decrypt for admin view
        return results.map(dc => ({
            ...dc,
            code: decrypt(dc.code) || dc.code,
            slots: dc.slots.map(s => ({
                ...s,
                code: s.code ? (decrypt(s.code) || s.code) : null
            }))
        }));
    }
);

export const resolveHouseholdAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.TRAITEUR],
        schema: z.object({
            slotId: z.number()
        })
    },
    async ({ slotId }) => {
        try {
            const slot = await db.query.digitalCodeSlots.findFirst({
                where: eq(digitalCodeSlots.id, slotId),
                with: {
                    digitalCode: true,
                    orderItem: {
                        with: {
                            order: {
                                with: { client: true }
                            }
                        }
                    }
                }
            });

            if (!slot) throw new Error("Slot introuvable");
            if (slot.status !== "VENDU") throw new Error("Le slot n'est pas au statut VENDU");
            if (!slot.digitalCode?.outlookPassword) throw new Error("Le mot de passe Outlook est manquant pour ce compte");

            const rawPhone = slot.orderItem?.order?.customerPhone || slot.orderItem?.order?.client?.telephone;
            if (!rawPhone) throw new Error("Le client n'a pas de numéro de téléphone associé");

            const phone = rawPhone.replace(/\D/g, '') + '@c.us';

            const { NetflixResolverService } = await import("@/services/netflix-resolver.service");
            const outlookPass = decrypt(slot.digitalCode.outlookPassword!) || "";
            const codeRaw = decrypt(slot.digitalCode.code!) || "";
            const [email] = codeRaw.split('|').map(s => s.trim());

            const result = await NetflixResolverService.resolve(email, outlookPass);

            if (result.type === 'NOT_FOUND') {
                return { success: false, error: "Aucun email de vérification trouvé ces 15 dernières minutes" };
            }
            if (result.type === 'ERROR') {
                return { success: false, error: "Erreur technique lors de la connexion IMAP: " + result.error };
            }

            const { sendWhatsAppMessage } = await import("@/lib/whatsapp");
            const settings = await db.query.shopSettings.findFirst();
            const waSettings = {
                whatsappApiUrl: settings?.whatsappApiUrl ?? undefined,
                whatsappApiKey: settings?.whatsappApiKey ?? undefined,
                whatsappInstanceName: settings?.whatsappInstanceName ?? undefined
            };

            if (result.type === 'CODE') {
                await sendWhatsAppMessage(phone, `✅ Voici votre code de vérification Netflix :\n*${result.value}*`, waSettings);
            } else if (result.type === 'LINK') {
                await sendWhatsAppMessage(phone, `✅ Voici votre lien de mise à jour Netflix :\n${result.value}\n\n⚠️ Veuillez ouvrir ce lien en utilisant les données mobiles et non le wifi.`, waSettings);
            }

            await db.insert(auditLogs).values({
                action: 'NETFLIX_RESOLVE_MANUAL',
                entityType: 'SLOT',
                entityId: String(slotId),
                newData: {
                    type: result.type,
                    value: result.type === 'CODE' || result.type === 'LINK' ? result.value : null,
                    attempts: result.attempts,
                    phone: phone.slice(0, 6) + '****',
                    trigger: 'ADMIN'
                }
            }).catch(() => { });

            return { success: true, result };

        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);
