"use server";

import { eq, and, ilike, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, productVariants, productVariantSuppliers, digitalCodes, digitalCodeSlots } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { encrypt } from "@/lib/encryption";

export const getPaginatedProducts = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({
            page: z.number(),
            limit: z.number(),
            categoryId: z.string().optional(),
            search: z.string().optional(),
            status: z.enum(["ACTIVE", "ARCHIVED"]).optional()
        })
    },
    async (params) => {
        const { page, limit, categoryId, search, status = "ACTIVE" } = params;
        const offset = (page - 1) * limit;

        let whereClauses = [];
        whereClauses.push(eq(products.status, status));

        if (categoryId && categoryId !== "all") {
            whereClauses.push(eq(products.categoryId, parseInt(categoryId)));
        }
        if (search) {
            whereClauses.push(ilike(products.name, `%${search}%`));
        }

        const where = whereClauses.length > 0 ? and(...whereClauses) : undefined;

        const productsResult = await db.query.products.findMany({
            where,
            limit,
            offset,
            orderBy: (products, { desc }) => [desc(products.id)],
            with: {
                variants: {
                    with: {
                        variantSuppliers: true
                    }
                }
            }
        });

        const totalRes = await db.select({ count: count() }).from(products).where(where);
        const total = Number(totalRes[0].count);

        return {
            products: productsResult,
            total,
            totalPages: Math.ceil(total / limit)
        };
    }
);

export const createProductAction = withAuth(
    {
        roles: ["ADMIN"],
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
            // 1. Create the product
            const [newProduct] = await db.insert(products).values({
                name: formData.name,
                description: formData.description,
                categoryId: formData.categoryId,
                imageUrl: formData.imageUrl,
                requiresPlayerId: formData.requiresPlayerId ?? false,
                isManualDelivery: formData.isManualDelivery ?? true,
            }).returning();

            // 2. Create variants and their supplier links
            for (const v of formData.variants) {
                const [newVariant] = await db.insert(productVariants).values({
                    productId: newProduct.id,
                    name: v.name,
                    salePriceDzd: v.salePriceDzd,
                    isSharing: v.isSharing ?? false,
                    totalSlots: v.totalSlots ?? 1,
                }).returning();

                if (v.linkedSuppliers.length > 0) {
                    await db.insert(productVariantSuppliers).values(
                        v.linkedSuppliers.map(ls => ({
                            variantId: newVariant.id,
                            supplierId: ls.supplierId,
                            purchasePrice: ls.purchasePrice,
                            currency: ls.currency
                        }))
                    );
                }
            }

            revalidatePath("/admin/catalogue");
            return { success: true };
        } catch (error) {
            console.error("Failed to create product:", error);
            return { success: false, error: (error as Error).message };
        }
    }
);

export const updateProductAction = withAuth(
    {
        roles: ["ADMIN"],
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
            // 1. Update the product basic info
            await db.update(products).set({
                name: formData.name,
                description: formData.description,
                categoryId: formData.categoryId,
                imageUrl: formData.imageUrl,
                requiresPlayerId: formData.requiresPlayerId ?? false,
                isManualDelivery: formData.isManualDelivery ?? true,
            }).where(eq(products.id, id));

            // 2. Synchronize variants (UPSERT pattern)
            const incomingVariants = formData.variants;
            const incomingVariantIds = incomingVariants
                .map(v => v.id)
                .filter((id): id is number => typeof id === 'number');

            const currentVariants = await db.query.productVariants.findMany({
                where: eq(productVariants.productId, id),
            });

            const variantsToDelete = currentVariants.filter(cv => !incomingVariantIds.includes(cv.id));

            // 3. Safety Check: Prevent deletion of variants already sold
            if (variantsToDelete.length > 0) {
                const deleteIds = variantsToDelete.map(v => v.id);
                // Check if any variant has been sold (exists in order_items)
                // We'll import orderItems if needed, but it's in schema
                const { orderItems } = await import("@/db/schema");
                const [soldItems] = await db.select().from(orderItems).where(sql`${orderItems.variantId} IN ${deleteIds}`).limit(1);

                if (soldItems) {
                    return {
                        success: false,
                        error: "Impossible de supprimer une variante déjà vendue."
                    };
                }

                for (const v of variantsToDelete) {
                    await db.delete(productVariants).where(eq(productVariants.id, v.id));
                }
            }

            // 4. Update or Create variants
            for (const v of incomingVariants) {
                let finalVariantId: number;

                if (v.id) {
                    await db.update(productVariants).set({
                        name: v.name,
                        salePriceDzd: v.salePriceDzd,
                        isSharing: v.isSharing ?? false,
                        totalSlots: v.totalSlots ?? 1,
                    }).where(eq(productVariants.id, v.id));
                    finalVariantId = v.id;
                } else {
                    const [newV] = await db.insert(productVariants).values({
                        productId: id,
                        name: v.name,
                        salePriceDzd: v.salePriceDzd,
                        isSharing: v.isSharing ?? false,
                        totalSlots: v.totalSlots ?? 1,
                    }).returning();
                    finalVariantId = newV.id;
                }

                await db.delete(productVariantSuppliers).where(eq(productVariantSuppliers.variantId, finalVariantId));

                if (v.linkedSuppliers && v.linkedSuppliers.length > 0) {
                    await db.insert(productVariantSuppliers).values(
                        v.linkedSuppliers.map(ls => ({
                            variantId: finalVariantId,
                            supplierId: ls.supplierId,
                            purchasePrice: ls.purchasePrice,
                            currency: ls.currency
                        }))
                    );
                }
            }

            revalidatePath("/admin/catalogue");
            return { success: true };
        } catch (error) {
            console.error("Failed to update product:", error);
            return { success: false, error: (error as Error).message };
        }
    }
);

export const deleteProductAction = withAuth(
    {
        roles: ["ADMIN"],
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
                const { orderItems } = await import("@/db/schema");
                const [hasSales] = await db.select().from(orderItems).where(sql`${orderItems.variantId} IN ${variantIds}`).limit(1);

                if (hasSales) {
                    return {
                        success: false,
                        error: "Produit lié à des ventes. Archiver à la place."
                    };
                }
            }

            await db.delete(products).where(eq(products.id, id));
            revalidatePath("/admin/catalogue");
            return { success: true };
        } catch (error) {
            console.error("Failed to delete product:", error);
            return { success: false, error: (error as Error).message };
        }
    }
);

export const toggleProductStatusAction = withAuth(
    {
        roles: ["ADMIN"],
        schema: z.object({ id: z.number(), status: z.enum(["ACTIVE", "ARCHIVED"]) })
    },
    async ({ id, status }) => {
        try {
            await db.update(products).set({ status }).where(eq(products.id, id));
            revalidatePath("/admin/catalogue");
            revalidatePath("/kiosk");
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const createCategoryAction = withAuth(
    {
        roles: ["ADMIN"],
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
        roles: ["ADMIN"],
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
        roles: ["ADMIN"],
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
        roles: ["ADMIN"],
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
