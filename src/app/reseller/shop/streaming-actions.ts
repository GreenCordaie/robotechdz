"use server";

import { db } from "@/db";
import {
    productVariants,
    digitalCodes,
    digitalCodeSlots,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole, DigitalCodeStatus, DigitalCodeSlotStatus } from "@/lib/constants";

/**
 * A sellable streaming sharing offer (e.g. "NETFLIX — 1 profil 45 jours").
 * Backed by a LOCAL `is_sharing` product variant, allocated at checkout via
 * the legacy `{ id, quantity }` cart line (allocateOrderStock mints the
 * /activer magic link per profile).
 */
export interface StreamingOffer {
    readonly variantId: number;
    readonly title: string;
    readonly priceDzd: number;
    /**
     * Profiles that can be delivered INSTANTLY. Mirrors allocateOrderStock's
     * filter exactly: a profile counts only when BOTH the slot AND its parent
     * account are DISPONIBLE. A DISPONIBLE slot on a sold-out account is NOT
     * allocatable, so it must never inflate the displayed stock.
     */
    readonly stock: number;
}

/**
 * Reseller-facing Netflix offer(s). Surfaces local `is_sharing` Netflix
 * variants (e.g. "NETFLIX 45 JOURS") in the reseller shop, which the existing
 * G2Bulk-driven catalog never lists.
 */
export const getResellerNetflixOffersAction = withAuth(
    { roles: [UserRole.RESELLER] },
    async () => {
        try {
            const variants = await db.query.productVariants.findMany({
                where: and(
                    eq(productVariants.isSharing, true),
                    eq(productVariants.resellerVisible, true),
                ),
                with: { product: true },
            });

            const netflix = variants.filter((v) =>
                ((v as { product?: { name?: string } }).product?.name ?? "")
                    .toLowerCase()
                    .includes("netflix"),
            );

            const offers: StreamingOffer[] = [];
            for (const v of netflix) {
                const [row] = await db
                    .select({ cnt: sql<number>`count(*)::int` })
                    .from(digitalCodeSlots)
                    .innerJoin(
                        digitalCodes,
                        eq(digitalCodes.id, digitalCodeSlots.digitalCodeId),
                    )
                    .where(
                        and(
                            eq(digitalCodeSlots.status, DigitalCodeSlotStatus.DISPONIBLE),
                            eq(digitalCodes.status, DigitalCodeStatus.DISPONIBLE),
                            eq(digitalCodes.variantId, v.id),
                        ),
                    );

                const product = (v as { product?: { name?: string } }).product;
                const price = v.resellerPriceOverrideDzd
                    ? parseFloat(v.resellerPriceOverrideDzd)
                    : parseFloat(v.salePriceDzd);

                offers.push({
                    variantId: v.id,
                    title: product?.name ? `${product.name} — ${v.name}` : v.name,
                    priceDzd: price,
                    stock: row?.cnt ?? 0,
                });
            }

            return { success: true as const, data: offers };
        } catch (error) {
            console.error("[reseller] getNetflixOffers failed:", error);
            return { success: false as const, error: "Erreur lors du chargement de l'offre Netflix" };
        }
    },
);
