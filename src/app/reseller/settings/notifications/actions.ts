"use server";

import { db } from "@/db";
import { resellers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    RESELLER_NOTIF_EVENTS,
    RESELLER_NOTIF_EVENT_LABELS,
    type ResellerNotifEventKey,
} from "@/services/reseller-notifications.service";

const eventKeys = Object.values(RESELLER_NOTIF_EVENTS) as [ResellerNotifEventKey, ...ResellerNotifEventKey[]];

/**
 * Récupère les préférences notif WhatsApp du reseller courant + le catalogue.
 * Retourne tous les events avec leur état (default true si manquant).
 */
export const getResellerNotifPrefsAction = withAuth(
    { roles: [UserRole.RESELLER] },
    async (_, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
            columns: { id: true, notificationPreferences: true },
        });
        if (!reseller) return { success: false as const, error: "Reseller introuvable" };

        const stored = (reseller.notificationPreferences ?? {}) as Record<string, boolean>;
        const items = eventKeys.map((key) => ({
            eventKey: key,
            label: RESELLER_NOTIF_EVENT_LABELS[key],
            enabled: stored[key] !== false,
        }));

        return { success: true as const, data: items };
    }
);

/**
 * Toggle une préférence. Idempotent : passer enabled=true ou false écrase.
 */
export const updateResellerNotifPrefAction = withAuth(
    {
        roles: [UserRole.RESELLER],
        schema: z.object({
            eventKey: z.enum(eventKeys),
            enabled: z.boolean(),
        }),
    },
    async ({ eventKey, enabled }, user) => {
        const reseller = await db.query.resellers.findFirst({
            where: eq(resellers.userId, user.id),
            columns: { id: true, notificationPreferences: true },
        });
        if (!reseller) return { success: false as const, error: "Reseller introuvable" };

        const current = (reseller.notificationPreferences ?? {}) as Record<string, boolean>;
        const next: Record<string, boolean> = { ...current, [eventKey]: enabled };

        await db
            .update(resellers)
            .set({ notificationPreferences: next })
            .where(eq(resellers.id, reseller.id));

        revalidatePath("/reseller/settings/notifications");
        return { success: true as const };
    }
);
