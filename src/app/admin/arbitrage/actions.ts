"use server";

import { z } from "zod";
import { withAuth, logSecurityAction } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { revalidatePath } from "next/cache";

const lbUrl = process.env.LOADBRAIN_URL || "https://api.loadbrain.shop";
// LoadBrain admin routes are gated by the shared INTERNAL_TOKEN (not the
// tenant API key). Read it from env only — never hardcode a fallback secret.
const lbInternalToken = process.env.LOADBRAIN_INTERNAL_TOKEN ?? "";

const getHeaders = () => ({
    "Content-Type": "application/json",
    "X-Internal-Token": lbInternalToken,
});

export const getBsvTrackedLinksAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const res = await fetch(`${lbUrl}/api/v1/giftcards/admin/bsv-tracker`, {
                method: "GET",
                headers: getHeaders(),
                cache: "no-store",
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`LoadBrain API error: ${res.status} - ${err}`);
            }
            const data = await res.json();
            return { success: true as const, data: data.data };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    }
);

export const addBsvTrackedLinkAction = withAuth(
    { 
        roles: [UserRole.ADMIN],
        schema: z.object({
            url: z.string().url("Veuillez entrer une URL BSV valide"),
            title: z.string().optional()
        })
    },
    async (input, user) => {
        try {
            const res = await fetch(`${lbUrl}/api/v1/giftcards/admin/bsv-tracker/add`, {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify(input),
            });
            
            const data = await res.json();
            
            if (!res.ok || !data.success) {
                throw new Error(data.error?.message || data.error || "Erreur lors de l'ajout du lien sur LoadBrain");
            }

            await logSecurityAction({
                userId: user.id,
                action: "BSV_TRACKER_ADD_LINK",
                entityType: "bsv_tracker",
                newData: { url: input.url, title: input.title },
            });

            revalidatePath("/admin/arbitrage");
            return { success: true as const, data: data.data };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    }
);

export const removeBsvTrackedLinkAction = withAuth(
    { 
        roles: [UserRole.ADMIN],
        schema: z.object({
            id: z.string()
        })
    },
    async ({ id }, user) => {
        try {
            const res = await fetch(`${lbUrl}/api/v1/giftcards/admin/bsv-tracker/${id}`, {
                method: "DELETE",
                headers: getHeaders(),
            });
            
            const data = await res.json();
            
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Erreur lors de la suppression sur LoadBrain");
            }

            await logSecurityAction({
                userId: user.id,
                action: "BSV_TRACKER_REMOVE_LINK",
                entityType: "bsv_tracker",
                entityId: id,
            });

            revalidatePath("/admin/arbitrage");
            return { success: true as const };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    }
);
