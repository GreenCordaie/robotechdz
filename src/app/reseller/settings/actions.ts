"use server";

import { db } from "@/db";
import { resellers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";

/** Current reseller's white-label branding (shown to their own customers). */
export const getResellerBrandAction = withAuth(
    { roles: [UserRole.RESELLER] },
    async (_, user) => {
        const r = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
            columns: {
                companyName: true,
                brandName: true,
                brandColor: true,
                supportPhone: true,
                supportWhatsapp: true,
            },
        });
        if (!r) return { success: false as const, error: "Reseller introuvable" };
        return {
            success: true as const,
            data: {
                companyName: r.companyName,
                brandName: r.brandName ?? "",
                brandColor: r.brandColor ?? "",
                supportPhone: r.supportPhone ?? "",
                supportWhatsapp: r.supportWhatsapp ?? "",
            },
        };
    },
);

export const updateResellerBrandAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            brandName: z.string().max(60).optional(),
            brandColor: z
                .string()
                .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Couleur hex invalide")
                .or(z.literal(""))
                .optional(),
            supportPhone: z
                .string()
                .max(20)
                .regex(/^[0-9+\s]*$/, "Téléphone invalide")
                .optional(),
            supportWhatsapp: z
                .string()
                .max(20)
                .regex(/^[0-9+\s]*$/, "WhatsApp invalide")
                .optional(),
        }),
    },
    async (input, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
            columns: { id: true },
        });
        if (!reseller) return { success: false as const, error: "Reseller introuvable" };

        const norm = (v?: string) => {
            const t = (v ?? "").trim();
            return t === "" ? null : t;
        };

        await db
            .update(resellers)
            .set({
                brandName: norm(input.brandName),
                brandColor: norm(input.brandColor),
                supportPhone: norm(input.supportPhone),
                supportWhatsapp: norm(input.supportWhatsapp),
            })
            .where(eq(resellers.id, reseller.id));

        revalidatePath("/reseller/settings");
        return { success: true as const };
    },
);
