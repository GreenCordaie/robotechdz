import crypto from "crypto";

export async function verifyWebhookSignature(headers: Headers, provider: "telegram" | "whatsapp") {
    if (provider === "telegram") {
        const expectedToken = process.env.TELEGRAM_SECRET_TOKEN;
        const receivedToken = headers.get("x-telegram-bot-api-secret-token");

        if (!expectedToken || !receivedToken) return false;

        try {
            const expectedBuffer = Buffer.from(expectedToken);
            const receivedBuffer = Buffer.from(receivedToken);

            if (expectedBuffer.length !== receivedBuffer.length) return false;
            return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
        } catch (e) {
            return false;
        }
    }

    if (provider === "whatsapp") {
        // Waha sends X-Api-Key header for authentication
        const expectedKey = process.env.WHATSAPP_WEBHOOK_SECRET;

        // No secret configured: allow in dev, block in production
        if (!expectedKey) return process.env.NODE_ENV !== "production";

        const receivedKey = headers.get("x-api-key") || headers.get("apikey");
        if (!receivedKey) return false;

        try {
            const expectedBuffer = Buffer.from(expectedKey);
            const receivedBuffer = Buffer.from(receivedKey);
            if (expectedBuffer.length !== receivedBuffer.length) return false;
            return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
        } catch (e) {
            return false;
        }
    }

    return false;
}

export async function isEventProcessed(provider: "telegram" | "whatsapp", externalId: string, customerPhone?: string, payload?: any) {
    const { db } = await import("@/db");
    const { webhookEvents } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");

    const alreadyProcessed = await db.query.webhookEvents.findFirst({
        where: and(eq(webhookEvents.provider, provider), eq(webhookEvents.externalId, externalId))
    });

    if (alreadyProcessed) return true;

    // Insert to mark as processed with payload and phone
    await db.insert(webhookEvents).values({
        provider,
        externalId,
        customerPhone,
        payload
    });

    return false;
}
