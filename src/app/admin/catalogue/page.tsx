import React from "react";
import { db } from "@/db";
import { getPaginatedProducts } from "./actions";
import CatalogueContent from "@/components/admin/CatalogueContent";

export const dynamic = "force-dynamic";

export default async function CataloguePage({
    searchParams,
}: {
    searchParams: { page?: string; search?: string; categoryId?: string; status?: string };
}) {
    const page = Number(searchParams.page) || 1;
    const search = searchParams.search || "";
    const categoryId = searchParams.categoryId || "all";
    const status = (searchParams.status as "ACTIVE" | "ARCHIVED") || "ACTIVE";
    const limit = 10;

    // Fetch static data (categories, suppliers)
    const allCategories = await db.query.categories.findMany();
    const allSuppliers = await db.query.suppliers.findMany();

    // Fetch paginated products
    const result: any = await getPaginatedProducts({
        page,
        limit,
        search,
        categoryId,
        status,
    });

    if (result.success === false) {
        return (
            <div className="p-8 text-white bg-red-900/20 rounded-xl border border-red-500/50">
                Une erreur de sécurité est survenue : {result.error}
            </div>
        );
    }

    const { products, total, totalPages } = result;

    return (
        <CatalogueContent
            initialProducts={products}
            suppliers={allSuppliers}
            categories={allCategories}
            initialTotal={total}
            initialTotalPages={totalPages}
            initialPage={page}
            initialSearch={search}
            initialCategoryId={categoryId}
            initialStatus={status}
        />
    );
}
