"use server";

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export async function uploadImage(formData: FormData) {
    try {
        const file = formData.get("file") as File;
        if (!file) {
            return { success: false, error: "Aucun fichier fourni" };
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Generate unique name
        const fileExtension = file.name.split(".").pop();
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}.${fileExtension}`;

        // Ensure directory exists
        const uploadsDir = join(process.cwd(), "public", "uploads");
        await mkdir(uploadsDir, { recursive: true });

        const path = join(uploadsDir, uniqueName);
        await writeFile(path, buffer);

        return {
            success: true,
            url: `/uploads/${uniqueName}`
        };
    } catch (error) {
        console.error("Upload error:", error);
        return { success: false, error: (error as Error).message };
    }
}
