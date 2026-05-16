"use server";

import { db } from "@/db";
import { resellerWebhooks, resellers } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

/**
 * CRUD côté reseller pour ses propres webhooks sortants.
 * Chaque action vérifie l'ownership (resellers.userId === user.id).
 */

const VALID_EVENTS = ["order.paid", "credentials.ready", "wallet.recharged"] as const;
type ValidEvent = (typeof VALID_EVENTS)[number];

async function getResellerForUser(userId: number) {
    return db.query.resellers.findFirst({
        where: eq(resellers.userId, userId),
    });
}

export const listMyWebhooksAction = withAuth(
    { roles: [UserRole.RESELLER], schema: z.object({}) },
    async (_, user) => {
        const reseller = await getResellerForUser(user.id);
        if (!reseller) return { success: false as const, error: "Compte revendeur introuvable" };
        const list = await db
            .select()
            .from(resellerWebhooks)
            .where(eq(resellerWebhooks.resellerId, reseller.id))
            .orderBy(desc(resellerWebhooks.createdAt));
        return { success: true as const, data: list };
    }
);

export const createMyWebhookAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            url: z.string().url("URL invalide").max(500),
            events: z
                .array(z.enum(VALID_EVENTS as unknown as [ValidEvent, ...ValidEvent[]]))
                .min(1, "Choisir au moins 1 event"),
        }),
    },
    async ({ url, events }, user) => {
        const reseller = await getResellerForUser(user.id);
        if (!reseller) return { success: false as const, error: "Compte revendeur introuvable" };

        // Sécurité : refuse les URLs vers localhost / 127.0.0.1 / 0.0.0.0 / 169.254 / .local
        // pour éviter le SSRF (un reseller malveillant pointe vers ressources internes).
        if (/^https?:\/\/(127\.|0\.|169\.254\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|.+\.local|.+\.internal)/i.test(url)) {
            return {
                success: false as const,
                error: "URL invalide — adresse privée/locale refusée",
            };
        }

        // Génère un secret HMAC stable (le reseller doit le copier 1x)
        const secret = crypto.randomBytes(32).toString("hex");

        const [created] = await db
            .insert(resellerWebhooks)
            .values({
                resellerId: reseller.id,
                url,
                events: events.join(","),
                secret,
                isActive: true,
            })
            .returning();

        revalidatePath("/reseller/webhooks");
        return { success: true as const, data: created };
    }
);

export const toggleMyWebhookAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            id: z.number().int().positive(),
            isActive: z.boolean(),
        }),
    },
    async ({ id, isActive }, user) => {
        const reseller = await getResellerForUser(user.id);
        if (!reseller) return { success: false as const, error: "Compte revendeur introuvable" };

        const existing = await db.query.resellerWebhooks.findFirst({
            where: and(eq(resellerWebhooks.id, id), eq(resellerWebhooks.resellerId, reseller.id)),
        });
        if (!existing) return { success: false as const, error: "Webhook introuvable" };

        await db
            .update(resellerWebhooks)
            .set({ isActive })
            .where(eq(resellerWebhooks.id, id));

        revalidatePath("/reseller/webhooks");
        return { success: true as const };
    }
);

export const deleteMyWebhookAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        const reseller = await getResellerForUser(user.id);
        if (!reseller) return { success: false as const, error: "Compte revendeur introuvable" };

        const existing = await db.query.resellerWebhooks.findFirst({
            where: and(eq(resellerWebhooks.id, id), eq(resellerWebhooks.resellerId, reseller.id)),
        });
        if (!existing) return { success: false as const, error: "Webhook introuvable" };

        await db.delete(resellerWebhooks).where(eq(resellerWebhooks.id, id));
        revalidatePath("/reseller/webhooks");
        return { success: true as const };
    }
);

/**
 * Envoie un event "ping" de test au webhook (utile au reseller pour vérifier
 * que sa receiver app est OK). Ne fait pas progresser les stats deliveriesOk/Failed
 * réelles — juste un round-trip de validation.
 */
export const testMyWebhookAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        const reseller = await getResellerForUser(user.id);
        if (!reseller) return { success: false as const, error: "Compte revendeur introuvable" };

        const hook = await db.query.resellerWebhooks.findFirst({
            where: and(eq(resellerWebhooks.id, id), eq(resellerWebhooks.resellerId, reseller.id)),
        });
        if (!hook) return { success: false as const, error: "Webhook introuvable" };

        // On dispatch un event "test" — pas un event business réel.
        // Le receiver verra X-Robotech-Event: order.paid (template) + flag _test:true
        // pour pouvoir filter dans son code.
        try {
            const { dispatchResellerEvent } = await import("@/services/webhook-dispatcher.service");
            await dispatchResellerEvent(reseller.id, "order.paid", {
                _test: true,
                orderNumber: "TEST-" + Date.now(),
                message: "Ceci est un événement de test généré depuis le portail revendeur",
            });
            return { success: true as const };
        } catch (err) {
            return {
                success: false as const,
                error: err instanceof Error ? err.message : "Erreur dispatch",
            };
        }
    }
);
