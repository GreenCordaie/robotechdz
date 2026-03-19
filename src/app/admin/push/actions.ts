"use server";

import { db } from "@/db";
import { pushSubscriptions, shopSettings, users } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import webpush from "web-push";
import { revalidatePath } from "next/cache";

// Initialize VAPID keys if not present
async function ensureKeys() {
    const settings = await db.query.shopSettings.findFirst();
    if (settings && settings.vapidPublicKey && settings.vapidPrivateKey) {
        webpush.setVapidDetails(
            'mailto:admin@flexbox.dz',
            settings.vapidPublicKey,
            settings.vapidPrivateKey
        );
        return settings;
    }

    // Generate new keys if missing
    const keys = webpush.generateVAPIDKeys();
    if (settings) {
        await db.update(shopSettings).set({
            vapidPublicKey: keys.publicKey,
            vapidPrivateKey: keys.privateKey
        }).where(eq(shopSettings.id, settings.id));
    }

    webpush.setVapidDetails(
        'mailto:admin@flexbox.dz',
        keys.publicKey,
        keys.privateKey
    );

    return { ...settings, vapidPublicKey: keys.publicKey };
}

export const getPushPublicKeyAction = withAuth(
    { roles: ["ADMIN", "CAISSIER", "TRAITEUR"] },
    async () => {
        const settings = await ensureKeys();
        return { success: true, publicKey: settings.vapidPublicKey };
    }
);

export const subscribeToPushAction = withAuth(
    {
        roles: ["ADMIN", "CAISSIER", "TRAITEUR"],
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

export const sendPushToRoleAction = async (role: string, payload: { title: string; body: string; url?: string }) => {
    try {
        const settings = await ensureKeys();
        if (!settings.vapidPublicKey || !settings.vapidPrivateKey) return;

        // Find users with the role
        const targetUsers = await db.query.users.findMany({
            where: eq(users.role, role as any),
            columns: { id: true }
        });

        if (targetUsers.length === 0) return;
        const userIds = targetUsers.map(u => u.id);

        // Find subscriptions for these users
        const subscriptions = await db.query.pushSubscriptions.findMany({
            where: inArray(pushSubscriptions.userId, userIds)
        });

        for (const sub of subscriptions) {
            try {
                await webpush.sendNotification(
                    sub.subscription as any,
                    JSON.stringify(payload)
                );
            } catch (err: any) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription expired or gone, delete it
                    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
                } else {
                    console.error("Error sending push:", err);
                }
            }
        }
    } catch (error) {
        console.error("Global push send error:", error);
    }
};

export const sendPushToUserAction = async (userId: number, payload: { title: string; body: string; url?: string }) => {
    try {
        const settings = await ensureKeys();
        if (!settings.vapidPublicKey || !settings.vapidPrivateKey) return;

        // Find subscriptions for this user
        const subscriptions = await db.query.pushSubscriptions.findMany({
            where: eq(pushSubscriptions.userId, userId)
        });

        for (const sub of subscriptions) {
            try {
                await webpush.sendNotification(
                    sub.subscription as any,
                    JSON.stringify(payload)
                );
            } catch (err: any) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
                }
            }
        }
    } catch (error) {
        console.error("User push send error:", error);
    }
};
