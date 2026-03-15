"use server";

import { db } from "@/db";
import { categories, products, productVariants, productVariantSuppliers } from "@/db/schema";
import { revalidatePath } from "next/cache";

export async function createProductAction(formData: {
    name: string;
    description: string;
    categoryId: number;
    imageUrl: string | null;
    requiresPlayerId?: boolean;
    variants: {
        name: string;
        purchasePriceUsd: string;
        salePriceDzd: string;
        linkedSuppliers: {
            supplierId: number;
            purchasePriceUsd: string;
        }[];
    }[];
}) {
    try {
        // 1. Create the product
        const [newProduct] = await db.insert(products).values({
            name: formData.name,
            description: formData.description,
            categoryId: formData.categoryId,
            imageUrl: formData.imageUrl,
            requiresPlayerId: formData.requiresPlayerId ?? false,
        }).returning();

        // 2. Create variants and their supplier links
        for (const v of formData.variants) {
            const [newVariant] = await db.insert(productVariants).values({
                productId: newProduct.id,
                name: v.name,
                purchasePriceUsd: v.purchasePriceUsd,
                salePriceDzd: v.salePriceDzd,
            }).returning();

            if (v.linkedSuppliers.length > 0) {
                await db.insert(productVariantSuppliers).values(
                    v.linkedSuppliers.map(ls => ({
                        variantId: newVariant.id,
                        supplierId: ls.supplierId,
                        purchasePriceUsd: ls.purchasePriceUsd,
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

export async function createCategoryAction(name: string, imageUrl: string | null) {
    try {
        await db.insert(categories).values({
            name,
            imageUrl
        });
        revalidatePath("/admin/catalogue");
        return { success: true };
    } catch (error) {
        console.error("Failed to create category:", error);
        return { success: false, error: (error as Error).message };
    }
}
