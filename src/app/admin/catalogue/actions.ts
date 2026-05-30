"use server";

import { eq, and, ilike, count, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, productVariants, productVariantSuppliers, digitalCodes, digitalCodeSlots } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { encrypt } from "@/lib/encryption";
import { ProductQueries } from "@/services/queries/product.queries";
import { UserRole } from "@/lib/constants";
import { cacheDel, CACHE_KEYS } from "@/lib/redis";

export const getPaginatedProducts = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR],
        schema: z.object({
            page: z.number(),
            limit: z.number(),
            categoryId: z.string().optional(),
            type: z.string().optional(),
            search: z.string().optional(),
            status: z.enum(["ACTIVE", "ARCHIVED"]).optional()
        })
    },
    async (params) => {
        return await ProductQueries.getPaginated(params as any);
    }
);

export const getCategoriesAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR],
        schema: z.object({})
    },
    async () => {
        return await ProductQueries.getCategories();
    }
);

export const createProductAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            name: z.string().min(1),
            description: z.string(),
            categoryId: z.number(),
            imageUrl: z.string().nullable(),
            requiresPlayerId: z.boolean().optional(),
            isManualDelivery: z.boolean().optional(),
            variants: z.array(z.object({
                name: z.string().min(1),
                salePriceDzd: z.string(),
                isSharing: z.boolean().optional(),
                totalSlots: z.number().optional(),
                loadbrainSlug: z.string().nullable().optional(),
                linkedSuppliers: z.array(z.object({
                    supplierId: z.number(),
                    purchasePrice: z.string(),
                    currency: z.string()
                }))
            }))
        })
    },
    async (formData) => {
        try {
            // 0. Validate LoadBrain slugs if any
            const slugsToValidate = formData.variants.map(v => v.loadbrainSlug).filter((s): s is string => !!s);
            if (slugsToValidate.length > 0) {
                const { validateLoadBrainSlug } = await import("@/lib/iptv");
                for (const slug of slugsToValidate) {
                    const valid = await validateLoadBrainSlug(slug);
                    if (!valid) return { success: false, error: `LoadBrain slug "${slug}" introuvable. Mappez-le d'abord dans Modules → Configurer.` };
                }
            }

            // 1-2. Create product + variants + supplier links atomically.
            // Without a tx, a failure mid-loop leaves an orphan product (and possibly
            // orphan variants). Pattern mirrors `bulkInsertCodes` below.
            await db.transaction(async (tx) => {
                const [newProduct] = await tx.insert(products).values({
                    name: formData.name,
                    description: formData.description,
                    categoryId: formData.categoryId,
                    imageUrl: formData.imageUrl,
                    requiresPlayerId: formData.requiresPlayerId ?? false,
                    isManualDelivery: formData.isManualDelivery ?? true,
                }).returning();

                for (const v of formData.variants) {
                    const [newVariant] = await tx.insert(productVariants).values({
                        productId: newProduct.id,
                        name: v.name,
                        salePriceDzd: v.salePriceDzd,
                        isSharing: v.isSharing ?? false,
                        totalSlots: v.totalSlots ?? 1,
                        loadbrainSlug: v.loadbrainSlug || null,
                    }).returning();

                    if (v.linkedSuppliers.length > 0) {
                        await tx.insert(productVariantSuppliers).values(
                            v.linkedSuppliers.map(ls => ({
                                variantId: newVariant.id,
                                supplierId: ls.supplierId,
                                purchasePrice: ls.purchasePrice,
                                currency: ls.currency
                            }))
                        );
                    }
                }
            });

            revalidatePath("/admin/catalogue");
            await cacheDel(CACHE_KEYS.KIOSK_CATALOGUE);
            return { success: true };
        } catch (error) {
            console.error("Failed to create product:", error);
            return { success: false, error: (error as Error).message };
        }
    }
);

export const updateProductAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            id: z.number(),
            formData: z.object({
                name: z.string().min(1),
                description: z.string(),
                categoryId: z.number(),
                imageUrl: z.string().nullable(),
                requiresPlayerId: z.boolean().optional(),
                isManualDelivery: z.boolean().optional(),
                variants: z.array(z.object({
                    id: z.number().nullable().optional(),
                    name: z.string().min(1),
                    salePriceDzd: z.string(),
                    isSharing: z.boolean().optional(),
                    totalSlots: z.number().optional(),
                    loadbrainSlug: z.string().nullable().optional(),
                    linkedSuppliers: z.array(z.object({
                        supplierId: z.number(),
                        purchasePrice: z.string(),
                        currency: z.string()
                    }))
                }))
            })
        })
    },
    async ({ id, formData }) => {
        try {
            // Pre-tx safety check: refuse to delete variants that already appear in orders.
            // (Done outside the tx so we can short-circuit cleanly; the actual mutations are wrapped.)
            const incomingVariants = formData.variants;
            const incomingVariantIds = incomingVariants
                .map(v => v.id)
                .filter((id): id is number => typeof id === 'number');

            const currentVariants = await db.query.productVariants.findMany({
                where: eq(productVariants.productId, id),
            });

            const variantsToDelete = currentVariants.filter(cv => !incomingVariantIds.includes(cv.id));

            if (variantsToDelete.length > 0) {
                const deleteIds = variantsToDelete.map(v => v.id);
                // deleteIds is non-empty here, so inArray is safe.
                const { orderItems } = await import("@/db/schema");
                const [soldItems] = await db
                    .select()
                    .from(orderItems)
                    .where(inArray(orderItems.variantId, deleteIds))
                    .limit(1);

                if (soldItems) {
                    return {
                        success: false,
                        error: "Impossible de supprimer une variante déjà vendue."
                    };
                }
            }

            // All variant mutations happen atomically — an orphaned partial variant
            // set (or supplier links pointing at a deleted variant) is impossible.
            await db.transaction(async (tx) => {
                // 1. Update the product basic info
                await tx.update(products).set({
                    name: formData.name,
                    description: formData.description,
                    categoryId: formData.categoryId,
                    imageUrl: formData.imageUrl,
                    requiresPlayerId: formData.requiresPlayerId ?? false,
                    isManualDelivery: formData.isManualDelivery ?? true,
                }).where(eq(products.id, id));

                // 2. Delete removed variants
                for (const v of variantsToDelete) {
                    await tx.delete(productVariants).where(eq(productVariants.id, v.id));
                }

                // 3. Update or Create variants + replace supplier links
                for (const v of incomingVariants) {
                    let finalVariantId: number;

                    if (v.id) {
                        await tx.update(productVariants).set({
                            name: v.name,
                            salePriceDzd: v.salePriceDzd,
                            isSharing: v.isSharing ?? false,
                            totalSlots: v.totalSlots ?? 1,
                            loadbrainSlug: v.loadbrainSlug || null,
                        }).where(eq(productVariants.id, v.id));
                        finalVariantId = v.id;
                    } else {
                        const [newV] = await tx.insert(productVariants).values({
                            productId: id,
                            name: v.name,
                            salePriceDzd: v.salePriceDzd,
                            isSharing: v.isSharing ?? false,
                            totalSlots: v.totalSlots ?? 1,
                            loadbrainSlug: v.loadbrainSlug || null,
                        }).returning();
                        finalVariantId = newV.id;
                    }

                    await tx.delete(productVariantSuppliers).where(eq(productVariantSuppliers.variantId, finalVariantId));

                    if (v.linkedSuppliers && v.linkedSuppliers.length > 0) {
                        await tx.insert(productVariantSuppliers).values(
                            v.linkedSuppliers.map(ls => ({
                                variantId: finalVariantId,
                                supplierId: ls.supplierId,
                                purchasePrice: ls.purchasePrice,
                                currency: ls.currency
                            }))
                        );
                    }
                }
            });

            revalidatePath("/admin/catalogue");
            await cacheDel(CACHE_KEYS.KIOSK_CATALOGUE);
            return { success: true };
        } catch (error) {
            console.error("Failed to update product:", error);
            return { success: false, error: (error as Error).message };
        }
    }
);

export const deleteProductAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        try {
            const variants = await db.query.productVariants.findMany({
                where: eq(productVariants.productId, id),
                columns: { id: true }
            });

            if (variants.length > 0) {
                const variantIds = variants.map(v => v.id);
                // variantIds is non-empty here, so inArray is safe.
                const { orderItems } = await import("@/db/schema");
                const [hasSales] = await db
                    .select()
                    .from(orderItems)
                    .where(inArray(orderItems.variantId, variantIds))
                    .limit(1);

                if (hasSales) {
                    return {
                        success: false,
                        error: "Produit lié à des ventes. Archiver à la place."
                    };
                }
            }

            await db.delete(products).where(eq(products.id, id));
            revalidatePath("/admin/catalogue");
            await cacheDel(CACHE_KEYS.KIOSK_CATALOGUE);
            return { success: true };
        } catch (error) {
            console.error("Failed to delete product:", error);
            return { success: false, error: (error as Error).message };
        }
    }
);

export const toggleProductStatusAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ id: z.number(), status: z.enum(["ACTIVE", "ARCHIVED"]) })
    },
    async ({ id, status }) => {
        try {
            await db.update(products).set({ status }).where(eq(products.id, id));
            revalidatePath("/admin/catalogue");
            revalidatePath("/kiosk");
            await cacheDel(CACHE_KEYS.KIOSK_CATALOGUE);
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const createCategoryAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ name: z.string().min(1), imageUrl: z.string().nullable() })
    },
    async ({ name, imageUrl }) => {
        try {
            await db.insert(categories).values({ name, imageUrl });
            revalidatePath("/admin/catalogue");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const updateCategoryAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ id: z.number(), name: z.string().min(1), imageUrl: z.string().nullable() })
    },
    async ({ id, name, imageUrl }) => {
        try {
            await db.update(categories).set({ name, imageUrl }).where(eq(categories.id, id));
            revalidatePath("/admin/catalogue");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const deleteCategoryAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ id: z.number() })
    },
    async ({ id }) => {
        try {
            await db.delete(categories).where(eq(categories.id, id));
            revalidatePath("/admin/catalogue");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const bulkInsertCodes = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.discriminatedUnion("type", [
            z.object({ type: z.literal("STANDARD"), variantId: z.number(), codes: z.array(z.string()) }),
            z.object({
                type: z.literal("SHARING"),
                variantId: z.number(),
                accounts: z.array(z.object({
                    email: z.string(),
                    password: z.string(),
                    slots: z.array(z.object({ name: z.string(), code: z.string().optional() }))
                }))
            })
        ])
    },
    async (data) => {
        const { variantId } = data;
        try {
            const variant = await db.query.productVariants.findFirst({
                where: eq(productVariants.id, variantId)
            });

            if (!variant) throw new Error("Variant non trouvée");

            if (data.type === "STANDARD") {
                if (data.codes.length === 0) return { success: true, count: 0 };
                await db.insert(digitalCodes).values(
                    data.codes.map(code => ({ variantId, code: encrypt(code.trim()), status: "DISPONIBLE" as const }))
                );
                return { success: true, count: data.codes.length };
            } else {
                let accountsCount = 0;
                await db.transaction(async (tx) => {
                    for (const accountData of data.accounts) {
                        const fullCode = `${accountData.email} | ${accountData.password}`;
                        const [dc] = await tx.insert(digitalCodes).values({
                            variantId,
                            code: encrypt(fullCode),
                            status: "DISPONIBLE" as const,
                            isDebitCompleted: false
                        }).returning();

                        const slotsToInsert = accountData.slots.map((s, index) => ({
                            digitalCodeId: dc.id,
                            slotNumber: index + 1,
                            profileName: s.name || `Profil ${index + 1}`,
                            code: s.code ? encrypt(s.code) : null,
                            status: "DISPONIBLE" as const
                        }));

                        if (slotsToInsert.length > 0) {
                            await tx.insert(digitalCodeSlots).values(slotsToInsert);
                        }
                        accountsCount++;
                    }
                });
                return { success: true, count: accountsCount };
            }
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const getVariantStockCounts = withAuth(
    { roles: [UserRole.ADMIN], schema: z.object({ variantIds: z.array(z.number()) }) },
    async ({ variantIds }) => {
        if (variantIds.length === 0) return { success: true, counts: {} as Record<number, number> };
        try {
            const rows = await db
                .select({ variantId: digitalCodes.variantId, count: count() })
                .from(digitalCodes)
                .where(and(
                    inArray(digitalCodes.variantId, variantIds),
                    eq(digitalCodes.status, "DISPONIBLE")
                ))
                .groupBy(digitalCodes.variantId);

            const counts: Record<number, number> = {};
            for (const r of rows) counts[r.variantId] = r.count;
            return { success: true, counts };
        } catch (error) {
            return { success: false, error: (error as Error).message, counts: {} as Record<number, number> };
        }
    }
);
