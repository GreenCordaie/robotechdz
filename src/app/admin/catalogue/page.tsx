import React from "react";
import { ProductQueries } from "@/services/queries/product.queries";
import CatalogueViewSwitcher from "./CatalogueViewSwitcher";
import { getCurrentUser } from "@/lib/security";
import { redirect } from "next/navigation";
import { UserRole, ProductStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function CataloguePage({
    searchParams,
}: {
    searchParams: { page?: string; search?: string; categoryId?: string; status?: string };
}) {
    const user = await getCurrentUser();
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
        redirect("/admin/login");
    }

    const page = Number(searchParams.page) || 1;
    const search = searchParams.search || "";
    const categoryId = searchParams.categoryId || "all";
    const status = (searchParams.status as ProductStatus) || ProductStatus.ACTIVE;
    const limit = 12; // Standardised limit

    const [categories, suppliers, result] = await Promise.all([
        ProductQueries.getCategories(),
        ProductQueries.getSuppliers(),
        ProductQueries.getPaginated({ page, limit, search, categoryId, status })
    ]);

    return (
        <CatalogueViewSwitcher
            initialProducts={result.products}
            suppliers={suppliers}
            categories={categories}
            initialTotal={result.total}
            initialTotalPages={result.totalPages}
            initialPage={page}
            initialSearch={search}
            initialCategoryId={categoryId}
            initialStatus={status}
        />
    );
}
