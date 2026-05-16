"use server";

import { db } from "@/db";
import {
    products,
    productVariants,
    digitalCodes,
    digitalCodeSlots,
    resellers,
} from "@/db/schema";
import { eq, and, ilike, sql, desc, count } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole, DigitalCodeStatus, DigitalCodeSlotStatus } from "@/lib/constants";
import { z } from "zod";
import { TierService } from "@/services/tier.service";

/**
 * Catalogue reseller : variants visibles aux revendeurs avec :
 *   - prix wholesale (resellerPriceOverrideDzd > salePriceDzd)
 *   - tier discount appliqué
 *   - stock disponible temps réel (count digitalCodes/digitalCodeSlots DISPONIBLE)
 *   - badge livraison : "auto" (LoadBrain), "stock" (codes en DB), "manual" (rien)
 *
 * Pagination + recherche + filtre catégorie. Pas de cache (stock temps réel).
 */
export const getResellerCatalogAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            page: z.number().int().min(1).default(1),
            limit: z.number().int().min(1).max(100).default(24),
            search: z.string().optional(),
            categoryId: z.number().int().optional(),
        }),
    },
    async (params, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
        });
        if (!reseller) {
            return { success: false as const, error: "Compte revendeur introuvable" };
        }

        const offset = (params.page - 1) * params.limit;

        // Conditions sur products + variants
        const productConditions = [eq(products.status, "ACTIVE")];
        if (params.search) {
            productConditions.push(ilike(products.name, `%${params.search}%`));
        }
        if (params.categoryId) {
            productConditions.push(eq(products.categoryId, params.categoryId));
        }

        // Récupère les products avec leurs variants visibles aux resellers
        const rows = await db
            .select({
                productId: products.id,
                productName: products.name,
                productImage: products.imageUrl,
                productDescription: products.description,
                isManualDelivery: products.isManualDelivery,
                requiresPlayerId: products.requiresPlayerId,
                categoryId: products.categoryId,
                variantId: productVariants.id,
                variantName: productVariants.name,
                salePriceDzd: productVariants.salePriceDzd,
                resellerPriceOverrideDzd: productVariants.resellerPriceOverrideDzd,
                isSharing: productVariants.isSharing,
                totalSlots: productVariants.totalSlots,
                loadbrainSlug: productVariants.loadbrainSlug,
            })
            .from(products)
            .innerJoin(productVariants, eq(productVariants.productId, products.id))
            .where(
                and(
                    ...productConditions,
                    eq(productVariants.resellerVisible, true)
                )
            )
            .orderBy(desc(products.id), productVariants.id)
            .limit(params.limit)
            .offset(offset);

        // Count pour pagination
        const [{ totalCount }] = await db
            .select({ totalCount: sql<number>`count(*)::int` })
            .from(products)
            .innerJoin(productVariants, eq(productVariants.productId, products.id))
            .where(
                and(
                    ...productConditions,
                    eq(productVariants.resellerVisible, true)
                )
            );

        // Calcule le stock disponible par variant (batch, 1 query)
        const variantIds = rows.map((r) => r.variantId);
        let stockByVariant = new Map<number, number>();

        if (variantIds.length > 0) {
            // Codes standards
            const standardStock = await db
                .select({
                    variantId: digitalCodes.variantId,
                    cnt: count(digitalCodes.id),
                })
                .from(digitalCodes)
                .where(
                    and(
                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE),
                        sql`${digitalCodes.variantId} IN (${sql.join(
                            variantIds.map((id) => sql`${id}`),
                            sql`, `
                        )})`
                    )
                )
                .groupBy(digitalCodes.variantId);

            for (const row of standardStock) {
                if (row.variantId !== null) {
                    stockByVariant.set(row.variantId, Number(row.cnt));
                }
            }

            // Slots (sharing variants) : count des slots DISPONIBLE dont parent est DISPONIBLE
            const slotStock = await db
                .select({
                    variantId: digitalCodes.variantId,
                    cnt: count(digitalCodeSlots.id),
                })
                .from(digitalCodeSlots)
                .innerJoin(digitalCodes, eq(digitalCodes.id, digitalCodeSlots.digitalCodeId))
                .where(
                    and(
                        eq(digitalCodeSlots.status, DigitalCodeSlotStatus.DISPONIBLE),
                        eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE),
                        sql`${digitalCodes.variantId} IN (${sql.join(
                            variantIds.map((id) => sql`${id}`),
                            sql`, `
                        )})`
                    )
                )
                .groupBy(digitalCodes.variantId);

            for (const row of slotStock) {
                if (row.variantId !== null) {
                    stockByVariant.set(row.variantId, Number(row.cnt));
                }
            }
        }

        // Tier discount (1 query mémoïsée 10min)
        const tier = await TierService.getCurrentTierForReseller(reseller.id);
        const tierDiscountPct = tier ? parseFloat(tier.discountPct) : 0;
        const customDiscountPct = reseller.customDiscount
            ? Math.min(parseFloat(reseller.customDiscount), 100 - tierDiscountPct)
            : 0;
        const totalDiscountPct = tierDiscountPct + customDiscountPct;

        const items = rows.map((r) => {
            const basePrice = r.resellerPriceOverrideDzd
                ? parseFloat(r.resellerPriceOverrideDzd)
                : parseFloat(r.salePriceDzd);
            const finalPrice = basePrice * (1 - totalDiscountPct / 100);
            const stock = stockByVariant.get(r.variantId) ?? 0;
            // Badge livraison
            let deliveryType: "auto" | "stock" | "manual";
            if (r.loadbrainSlug) deliveryType = "auto";
            else if (stock > 0) deliveryType = "stock";
            else deliveryType = "manual";

            return {
                productId: r.productId,
                productName: r.productName,
                productImage: r.productImage,
                productDescription: r.productDescription,
                categoryId: r.categoryId,
                variantId: r.variantId,
                variantName: r.variantName,
                isSharing: !!r.isSharing,
                totalSlots: r.totalSlots,
                basePrice,
                finalPrice,
                discountPct: totalDiscountPct,
                stock,
                deliveryType,
                loadbrainSlug: r.loadbrainSlug,
            };
        });

        return {
            success: true as const,
            data: {
                items,
                pagination: {
                    page: params.page,
                    limit: params.limit,
                    total: Number(totalCount),
                    totalPages: Math.ceil(Number(totalCount) / params.limit),
                },
                pricing: {
                    tierName: tier?.name ?? null,
                    tierColor: tier?.color ?? null,
                    tierDiscountPct,
                    customDiscountPct,
                    totalDiscountPct,
                },
            },
        };
    }
);

export interface ResellerCatalogItem {
    productId: number;
    productName: string;
    productImage: string | null;
    productDescription: string | null;
    categoryId: number | null;
    variantId: number;
    variantName: string;
    isSharing: boolean;
    totalSlots: number | null;
    basePrice: number;
    finalPrice: number;
    discountPct: number;
    stock: number;
    deliveryType: "auto" | "stock" | "manual";
    loadbrainSlug: string | null;
}

export interface ResellerCatalogPricing {
    tierName: string | null;
    tierColor: string | null;
    tierDiscountPct: number;
    customDiscountPct: number;
    totalDiscountPct: number;
}
