"use server";

import { writeFile, mkdir } from "fs/promises";
import { join, basename, extname } from "path";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { resellers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB — a logo doesn't need more

/**
 * Reseller-scoped image upload (logo). Mirrors the admin uploadImage flow
 * (Cloudflare R2 when configured, else local public/uploads) but gated to the
 * RESELLER role so partners can upload their own white-label logo.
 */
export const uploadResellerImage = withAuth(
    { roles: [UserRole.RESELLER] },
    async (formData: any) => {
        try {
            const file = formData.get("file") as File;
            if (!file) return { success: false as const, error: "Aucun fichier fourni" };
            if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
                return { success: false as const, error: "Type non autorisé (images seulement)." };
            }
            if (file.size > MAX_LOGO_SIZE) {
                return { success: false as const, error: "Logo trop volumineux (max 2 Mo)." };
            }

            const buffer = Buffer.from(await file.arrayBuffer());
            const safeExtension = extname(basename(file.name)).toLowerCase();
            const uniqueName = `${randomUUID()}${safeExtension}`;

            const { uploadToR2, isR2Configured } = await import("@/lib/r2");
            if (isR2Configured) {
                const url = await uploadToR2(buffer, uniqueName, file.type);
                return { success: true as const, url };
            }

            const uploadsDir = join(process.cwd(), "public", "uploads");
            await mkdir(uploadsDir, { recursive: true });
            const finalPath = join(uploadsDir, uniqueName);
            if (!finalPath.startsWith(uploadsDir)) {
                throw new Error("Chemin invalide");
            }
            await writeFile(finalPath, buffer);
            return { success: true as const, url: `/uploads/${uniqueName}` };
        } catch (err) {
            console.error("[reseller] logo upload error:", err);
            return { success: false as const, error: "Erreur lors du transfert du fichier." };
        }
    },
);

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
                brandLogoUrl: true,
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
                brandLogoUrl: r.brandLogoUrl ?? "",
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
            brandLogoUrl: z.string().max(500).optional(),
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
                brandLogoUrl: norm(input.brandLogoUrl),
                supportPhone: norm(input.supportPhone),
                supportWhatsapp: norm(input.supportWhatsapp),
            })
            .where(eq(resellers.id, reseller.id));

        revalidatePath("/reseller/settings");
        return { success: true as const };
    },
);
