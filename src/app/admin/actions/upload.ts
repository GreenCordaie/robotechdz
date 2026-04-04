"use server";

import { writeFile, mkdir } from "fs/promises";
import { join, basename, extname } from "path";
import { randomUUID } from "crypto";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { UserRole } from "@/lib/constants";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadImage = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        // Schema empty because we use FormData
    },
    async (formData: any) => {
        try {
            const file = formData.get("file") as File;
            if (!file) {
                return { success: false, error: "Aucun fichier fourni" };
            }

            // 1. MIME Type Validation (Stored XSS Protection)
            if (!ALLOWED_MIME_TYPES.includes(file.type)) {
                return { success: false, error: "Type de fichier non autorisé. Seules les images sont permises." };
            }

            // 2. Size Validation
            if (file.size > MAX_FILE_SIZE) {
                return { success: false, error: "Fichier trop volumineux (max 5Mo)." };
            }

            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            // 3. Path Traversal & Injection Protection
            const safeExtension = extname(basename(file.name)).toLowerCase();
            const uniqueName = `${randomUUID()}${safeExtension}`;

            // --- Phase 3: Cloudflare R2 Integration ---
            const { uploadToR2, isR2Configured } = await import("@/lib/r2");

            if (isR2Configured) {
                const publicUrl = await uploadToR2(buffer, uniqueName, file.type);
                return {
                    success: true,
                    url: publicUrl
                };
            }

            // Fallback for local development if R2 is not configured
            const uploadsDir = join(process.cwd(), "public", "uploads");
            await mkdir(uploadsDir, { recursive: true });
            const finalPath = join(uploadsDir, uniqueName);

            if (!finalPath.startsWith(uploadsDir)) {
                throw new Error("Violation de sécurité : Chemin de fichier invalide.");
            }

            await writeFile(finalPath, buffer);

            return {
                success: true,
                url: `/uploads/${uniqueName}`
            };
        } catch (error) {
            console.error("Upload error:", error);
            return { success: false, error: "Erreur lors du transfert du fichier." };
        }
    }
);
