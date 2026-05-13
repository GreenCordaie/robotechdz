"use server";

import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { LoadBrainMarketplaceService } from "@/services/loadbrain-marketplace.service";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { categories } from "@/db/schema";

export const listLoadBrainServicesAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({}),
    },
    async () => {
        const services = await LoadBrainMarketplaceService.listAvailableServices();
        return { success: true as const, data: services };
    }
);

export const listCategoriesForLinkAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({}),
    },
    async () => {
        const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);
        return { success: true as const, data: cats };
    }
);

export const linkLoadBrainServiceAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            slug: z.string().min(1),
            productName: z.string().min(2).max(120),
            productDescription: z.string().max(500).optional(),
            categoryId: z.number().int().positive(),
            salePriceDzd: z.string().regex(/^\d+(\.\d{1,2})?$/, "Prix invalide"),
            resellerPriceOverrideDzd: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
            variantName: z.string().min(1).max(80),
            kioskVisible: z.boolean().optional(),
            resellerVisible: z.boolean().optional(),
        }),
    },
    async (input) => {
        const result = await LoadBrainMarketplaceService.linkServiceToProduct(input);
        if (result.success) {
            revalidatePath("/admin/iptv/loadbrain-services");
            revalidatePath("/admin/catalogue");
            revalidatePath("/reseller/shop");
        }
        return result;
    }
);

export const unlinkLoadBrainSlugAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({ variantId: z.number().int().positive() }),
    },
    async ({ variantId }) => {
        const result = await LoadBrainMarketplaceService.unlinkSlugFromVariant(variantId);
        if (result.success) {
            revalidatePath("/admin/iptv/loadbrain-services");
            revalidatePath("/admin/catalogue");
            revalidatePath("/reseller/shop");
        }
        return result;
    }
);
