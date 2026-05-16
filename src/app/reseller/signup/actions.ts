"use server";

import { db } from "@/db";
import { resellerSignupRequests } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { z } from "zod";
import { headers } from "next/headers";

/**
 * Création publique d'une demande d'accès reseller.
 *
 * Sécurité :
 *   - Honeypot field (`website_url`) → silencieux refuse si rempli
 *   - Rate-limit IP : max 3 demandes / heure / IP (DB-based, fonctionne sans Redis)
 *   - Validation Zod stricte (email + phone + length)
 *   - Aucun appel externe (pas de Telegram/email pour ne pas leak credit)
 *   - Idempotence : si même email a déjà un PENDING, retourne success silencieusement
 */

const signupSchema = z.object({
    email: z.string().email("Email invalide").max(120),
    companyName: z.string().min(2, "Raison sociale trop courte").max(100),
    contactPhone: z
        .string()
        .min(8, "Téléphone trop court")
        .max(20)
        .regex(/^\+?[0-9\s]+$/, "Téléphone invalide"),
    nif: z.string().max(40).optional(),
    rcNumber: z.string().max(40).optional(),
    message: z.string().max(500).optional(),
    websiteUrl: z.string().optional(), // honeypot — doit rester vide
});

export type SignupInput = z.infer<typeof signupSchema>;

const MAX_REQUESTS_PER_HOUR_PER_IP = 3;

export async function createSignupRequestAction(
    raw: SignupInput
): Promise<{ success: true } | { success: false; error: string }> {
    // 1. Validation Zod
    const parsed = signupSchema.safeParse(raw);
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
    }
    const data = parsed.data;

    // 2. Honeypot
    if (data.websiteUrl && data.websiteUrl.length > 0) {
        // Réponse "success" simulée pour ne pas révéler le mécanisme aux bots
        return { success: true };
    }

    // 3. Rate-limit IP
    const hdrs = await headers();
    const ip =
        hdrs.get("cf-connecting-ip") ??
        hdrs.get("x-real-ip") ??
        hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
    const userAgent = hdrs.get("user-agent")?.slice(0, 500) ?? null;

    if (ip !== "unknown") {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recent = await db
            .select({ id: resellerSignupRequests.id })
            .from(resellerSignupRequests)
            .where(
                and(
                    eq(resellerSignupRequests.ipAddress, ip),
                    gte(resellerSignupRequests.createdAt, oneHourAgo)
                )
            );
        if (recent.length >= MAX_REQUESTS_PER_HOUR_PER_IP) {
            return {
                success: false,
                error: "Trop de demandes depuis cette adresse — réessayez dans 1 heure.",
            };
        }
    }

    // 4. Idempotence : si même email a un PENDING, on ne crée pas de doublon
    const existing = await db
        .select({ id: resellerSignupRequests.id, status: resellerSignupRequests.status })
        .from(resellerSignupRequests)
        .where(
            and(
                eq(resellerSignupRequests.email, data.email),
                eq(resellerSignupRequests.status, "PENDING")
            )
        );
    if (existing.length > 0) {
        // Réponse success silencieuse pour ne pas leak l'info "email connu"
        return { success: true };
    }

    // 5. Insertion
    try {
        await db.insert(resellerSignupRequests).values({
            email: data.email,
            companyName: data.companyName,
            contactPhone: data.contactPhone,
            nif: data.nif ?? null,
            rcNumber: data.rcNumber ?? null,
            message: data.message ?? null,
            status: "PENDING",
            ipAddress: ip,
            userAgent,
        });
        return { success: true };
    } catch (err) {
        console.error("[signup] insert failed:", err);
        return { success: false, error: "Erreur serveur. Réessayez." };
    }
}
