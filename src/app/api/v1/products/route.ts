import { db } from "@/db";
import { products, productVariants, digitalCodes, digitalCodeSlots } from "@/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { authenticateApiKey, checkApiRateLimit, logApiCall } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface VariantDTO {
    id: number;
    name: string;
    salePriceDzd: string;
    isSharing: boolean;
    availableStock: number;
}

interface ProductDTO {
    id: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    category: string | null;
    minPrice: string;
    availableStock: number;
    variants: VariantDTO[];
}

export async function GET(request: NextRequest) {
    const start = Date.now();
    const endpoint = "/api/v1/products";

    const auth = await authenticateApiKey(request);
    if (!auth) {
        return Response.json(
            { error: "Unauthorized", details: "Invalid or revoked API key" },
            { status: 401 }
        );
    }

    const isBlocked = await checkApiRateLimit(auth.keyHash);
    if (isBlocked) {
        logApiCall(auth.apiKey.id, endpoint, "GET", 429, Date.now() - start);
        return Response.json(
            { error: "Too Many Requests" },
            { status: 429, headers: { "Retry-After": "60" } }
        );
    }

    const categoryFilter = request.nextUrl.searchParams.get("category");

    const allProducts = await db.query.products.findMany({
        where: eq(products.status, "ACTIVE"),
        with: {
            category: true,
            variants: true,
        },
    });

    const productDTOs: ProductDTO[] = [];

    for (const product of allProducts) {
        if (categoryFilter && product.category?.name !== categoryFilter) {
            continue;
        }

        const variantDTOs: VariantDTO[] = [];

        for (const variant of product.variants) {
            let availableStock = 0;

            if (variant.isSharing) {
                // Count available slots in sharing codes
                const result = await db
                    .select({ cnt: count() })
                    .from(digitalCodeSlots)
                    .innerJoin(
                        digitalCodes,
                        and(
                            eq(digitalCodes.id, digitalCodeSlots.digitalCodeId),
                            eq(digitalCodes.variantId, variant.id),
                            eq(digitalCodes.status, "DISPONIBLE")
                        )
                    )
                    .where(eq(digitalCodeSlots.status, "DISPONIBLE"));
                availableStock = result[0]?.cnt ?? 0;
            } else {
                const result = await db
                    .select({ cnt: count() })
                    .from(digitalCodes)
                    .where(
                        and(
                            eq(digitalCodes.variantId, variant.id),
                            eq(digitalCodes.status, "DISPONIBLE")
                        )
                    );
                availableStock = result[0]?.cnt ?? 0;
            }

            variantDTOs.push({
                id: variant.id,
                name: variant.name,
                salePriceDzd: variant.salePriceDzd,
                isSharing: variant.isSharing,
                availableStock,
            });
        }

        const prices = product.variants.map((v) => parseFloat(v.salePriceDzd));
        const minPrice = prices.length > 0 ? Math.min(...prices).toFixed(2) : "0.00";
        const totalStock = variantDTOs.reduce((sum, v) => sum + v.availableStock, 0);

        productDTOs.push({
            id: product.id,
            name: product.name,
            description: product.description,
            imageUrl: product.imageUrl,
            category: product.category?.name ?? null,
            minPrice,
            availableStock: totalStock,
            variants: variantDTOs,
        });
    }

    const responseTimeMs = Date.now() - start;
    logApiCall(auth.apiKey.id, endpoint, "GET", 200, responseTimeMs);

    return Response.json({ data: productDTOs, total: productDTOs.length });
}
