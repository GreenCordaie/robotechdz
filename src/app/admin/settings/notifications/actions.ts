"use server";

import { db } from "@/db";
import { notificationTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    TEMPLATE_DEFAULTS,
    TEMPLATE_VARIABLES,
    getTemplateLabel,
    renderTemplate,
} from "@/services/notification-templates.service";

const eventKeys = Object.keys(TEMPLATE_DEFAULTS);

/**
 * Liste tous les templates avec leur état (DB override ou default).
 */
export const listTemplatesAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN], schema: z.object({}) },
    async () => {
        const overrides = await db.select().from(notificationTemplates);
        const overrideMap = new Map(overrides.map((r) => [r.eventKey, r]));

        const items = eventKeys.map((key) => {
            const row = overrideMap.get(key);
            return {
                eventKey: key,
                label: getTemplateLabel(key),
                body: row?.body ?? TEMPLATE_DEFAULTS[key],
                isCustom: !!row,
                updatedAt: row?.updatedAt ?? null,
                variables: TEMPLATE_VARIABLES[key] ?? [],
                defaultBody: TEMPLATE_DEFAULTS[key],
            };
        });

        return { success: true as const, data: items };
    }
);

/**
 * Sauvegarde un template (UPSERT).
 */
export const updateTemplateAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            eventKey: z.string().refine((v) => eventKeys.includes(v), { message: "Event inconnu" }),
            body: z.string().min(1).max(2000),
        }),
    },
    async ({ eventKey, body }, user) => {
        await db
            .insert(notificationTemplates)
            .values({ eventKey, body, updatedAt: new Date(), updatedByUserId: user.id })
            .onConflictDoUpdate({
                target: notificationTemplates.eventKey,
                set: { body, updatedAt: new Date(), updatedByUserId: user.id },
            });

        revalidatePath("/admin/settings/notifications");
        return { success: true as const };
    }
);

/**
 * Reset au default — supprime la row pour faire retomber sur TEMPLATE_DEFAULTS.
 */
export const resetTemplateAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            eventKey: z.string().refine((v) => eventKeys.includes(v), { message: "Event inconnu" }),
        }),
    },
    async ({ eventKey }) => {
        await db.delete(notificationTemplates).where(eq(notificationTemplates.eventKey, eventKey));
        revalidatePath("/admin/settings/notifications");
        return { success: true as const };
    }
);

/**
 * Preview server-side (réutilise le même renderer que prod).
 */
export const previewTemplateAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        schema: z.object({
            body: z.string().min(1).max(2000),
            vars: z.record(z.string(), z.union([z.string(), z.number()])),
        }),
    },
    async ({ body, vars }) => {
        const rendered = renderTemplate(body, vars);
        return { success: true as const, data: { rendered } };
    }
);
