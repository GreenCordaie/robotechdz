import "server-only";
import { db } from "@/db";
import { pushSubscriptions, shopSettings, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";

/**
 * Server-side Web Push helpers.
 *
 * These were previously exported from a "use server" file, which turned them
 * into client-callable Server Actions — any authenticated (or crafted) request
 * could fan out push notifications to a whole role. They are pure internal
 * helpers, so they live here (no "use server") and are invoked only from
 * trusted server code (cashier flow, workers).
 */

export type PushPayload = { title: string; body: string; url?: string };

/** Ensures VAPID keys exist (generating + persisting them once if missing). */
export async function ensureKeys() {
    const settings = await db.query.shopSettings.findFirst();
    if (settings && settings.vapidPublicKey && settings.vapidPrivateKey) {
        webpush.setVapidDetails("mailto:admin@flexbox.dz", settings.vapidPublicKey, settings.vapidPrivateKey);
        return settings;
    }

    const keys = webpush.generateVAPIDKeys();
    if (settings) {
        await db.update(shopSettings)
            .set({ vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey })
            .where(eq(shopSettings.id, settings.id));
    }

    webpush.setVapidDetails("mailto:admin@flexbox.dz", keys.publicKey, keys.privateKey);
    return { ...settings, vapidPublicKey: keys.publicKey };
}

async function deliver(subscription: unknown, subId: number, payload: PushPayload) {
    try {
        await webpush.sendNotification(subscription as webpush.PushSubscription, JSON.stringify(payload));
    } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subId));
        } else {
            console.error("Error sending push:", err);
        }
    }
}

/** Sends a push notification to every subscription of every user with `role`. */
export async function sendPushToRole(role: string, payload: PushPayload) {
    try {
        const settings = await ensureKeys();
        if (!settings.vapidPublicKey || !settings.vapidPrivateKey) return;

        const targetUsers = await db.query.users.findMany({
            where: eq(users.role, role as never),
            columns: { id: true },
        });
        if (targetUsers.length === 0) return;

        const subscriptions = await db.query.pushSubscriptions.findMany({
            where: inArray(pushSubscriptions.userId, targetUsers.map((u) => u.id)),
        });
        for (const sub of subscriptions) await deliver(sub.subscription, sub.id, payload);
    } catch (error) {
        console.error("Global push send error:", error);
    }
}

/** Sends a push notification to every subscription of a single user. */
export async function sendPushToUser(userId: number, payload: PushPayload) {
    try {
        const settings = await ensureKeys();
        if (!settings.vapidPublicKey || !settings.vapidPrivateKey) return;

        const subscriptions = await db.query.pushSubscriptions.findMany({
            where: eq(pushSubscriptions.userId, userId),
        });
        for (const sub of subscriptions) await deliver(sub.subscription, sub.id, payload);
    } catch (error) {
        console.error("User push send error:", error);
    }
}
