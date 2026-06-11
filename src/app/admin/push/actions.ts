"use server";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { sql } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { z } from "zod";
import { ensureKeys } from "@/lib/push-sender";

export const getPushPublicKeyAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR] },
    async () => {
        const settings = await ensureKeys();
        return { success: true, publicKey: settings.vapidPublicKey };
    }
);

export const subscribeToPushAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR],
        schema: z.object({
            subscription: z.any() // standard PushSubscription JSON
        })
    },
    async ({ subscription }, user) => {
        try {
            // Check if subscription already exists for this user/endpoint
            const endpoint = subscription.endpoint;
            const existing = await db.query.pushSubscriptions.findFirst({
                where: sql`${pushSubscriptions.userId} = ${user.id} AND ${pushSubscriptions.subscription}->>'endpoint' = ${endpoint}`
            });

            if (existing) {
                return { success: true, message: "Déjà abonné" };
            }

            await db.insert(pushSubscriptions).values({
                userId: user.id,
                subscription: subscription
            });

            return { success: true };
        } catch (error) {
            console.error("Push subscribe error:", error);
            return { success: false, error: (error as Error).message };
        }
    }
);

// Push fan-out helpers moved to "@/lib/push-sender" (server-only, non-action)
// so they can no longer be invoked as client Server Actions.
