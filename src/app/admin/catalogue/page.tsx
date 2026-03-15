import React from "react";
import { db } from "@/db";
import { categories, products, productVariants, suppliers } from "@/db/schema";
import CatalogueContent from "@/components/admin/CatalogueContent";

export const dynamic = "force-dynamic";

export default async function CataloguePage() {
    const allCategories = await db.query.categories.findMany();
    const allSuppliers = await db.query.suppliers.findMany();

    const productsWithVariants = await db.query.products.findMany({
        with: {
            variants: {
                with: {
                    variantSuppliers: true
                }
            }
        }
    });

    return (
        <CatalogueContent
            products={productsWithVariants}
            suppliers={allSuppliers}
            categories={allCategories}
        />
    );
}
