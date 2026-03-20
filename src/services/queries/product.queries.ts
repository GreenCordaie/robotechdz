import "server-only";
import { db } from "@/db";
import { categories, products, productVariants, productVariantSuppliers } from "@/db/schema";
import { eq, and, ilike, count } from "drizzle-orm";
import { cache } from "react";
import { ProductStatus } from "@/lib/constants";

export class ProductQueries {

    /**
     * Gets paginated products with variants and supplier links.
     */
    static getPaginated = cache(async (params: {
        page: number;
        limit: number;
        categoryId?: string;
        search?: string;
        status?: ProductStatus;
    }) => {
        const { page, limit, categoryId, search, status = ProductStatus.ACTIVE } = params;
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
    });

    /**
     * Gets all categories.
     */
    static getCategories = cache(async () => {
        return await db.query.categories.findMany({
            orderBy: (categories, { asc }) => [asc(categories.name)]
        });
    });

    /**
     * Gets all suppliers.
     */
    static getSuppliers = cache(async () => {
        return await db.query.suppliers.findMany({
            orderBy: (suppliers, { asc }) => [asc(suppliers.name)]
        });
    });

    /**
     * Gets a single product by ID.
     */
    static getById = cache(async (id: number) => {
        return await db.query.products.findFirst({
            where: eq(products.id, id),
            with: {
                category: true,
                variants: {
                    with: {
                        variantSuppliers: true
                    }
                }
            }
        });
    });
}
