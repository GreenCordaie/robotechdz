import "server-only";
import { db } from "@/db";
import { orders, digitalCodes, iptvProvisions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { eventBus, SystemEvent } from "@/lib/events";
import { sendTelegramNotification } from "@/lib/telegram";
import { DigitalCodeStatus, DeliveryMethod, OrderStatus } from "@/lib/constants";
import {
    isIbosolPayload,
    isPartialSuccess,
    formatIbosolCode,
    parseIbosolExpires,
    parseIbosolCustomData,
} from "@/lib/ibosol-credentials";

/**
 * Shape of the LoadBrain task payload — accepted both from the webhook event
 * (POST /api/loadbrain/webhook) and from the polling fallback (GET /api/v1/provision/:taskId).
 */
export interface LoadBrainTaskEvent {
    orderId: string;
    status?: string;
    credentials?: any;
    error?: string;
    errorCode?: string;
}

/**
 * Apply a "completed" task to local DB. Idempotent — safe to call multiple times
 * (existing digital_codes guard, status-bound iptv_provisions update).
 *
 * Used by:
 *   - Webhook handler (POST /api/loadbrain/webhook) on event.status === "completed"
 *   - syncStaleProvisions polling fallback when webhook 404'd or signature was rejected
 */
export async function processCompletedTask(event: LoadBrainTaskEvent): Promise<void> {
    const baseOrderNumber = event.orderId?.replace(/-item-\d+$/, "") || event.orderId;

    const order = await db.query.orders.findFirst({
        where: eq(orders.orderNumber, baseOrderNumber),
        with: {
            client: true,
            items: {
                with: {
                    codes: true,
                    variant: { with: { product: true } },
                }
            }
        }
    });

    if (!order) {
        console.error(`[LoadBrain] No order: ${baseOrderNumber}`);
        return;
    }

    const iptvItems = (order as any).items.filter((item: any) => item.variant?.loadbrainSlug);
    const itemIdMatch = event.orderId?.match(/-item-(\d+)$/);
    const targetItem = itemIdMatch
        ? iptvItems.find((i: any) => i.id === parseInt(itemIdMatch[1]))
        : iptvItems[0];

    if (!targetItem) {
        console.error(`[LoadBrain] No matching IPTV order_item for ${event.orderId}`);
        return;
    }

    if (!targetItem.variantId) {
        console.error(`[LoadBrain] order_item #${targetItem.id} has null variantId — cannot insert credentials`);
        await db.update(iptvProvisions).set({
            status: "failed",
            error: "order_item.variantId is null",
            errorCode: "INVALID_ORDER_ITEM",
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
        ));
        sendTelegramNotification(
            `❌ *Webhook anomalie*\n📋 \`${order.orderNumber}\`\nOrder item #${targetItem.id} sans variantId — credentials non enregistrées.`,
            ["ADMIN"]
        ).catch(() => {});
        return;
    }

    const creds = event.credentials || {};
    const ibosolMode = isIbosolPayload(creds);
    const screens = creds.screens || [];

    if (!ibosolMode && screens.length === 0) {
        console.error(`[LoadBrain] completed event with empty credentials for ${event.orderId}`);
        await db.update(iptvProvisions).set({
            status: "failed",
            error: "Empty credentials in completed webhook",
            errorCode: "EMPTY_CREDENTIALS",
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
            inArray(iptvProvisions.status, ["queued", "processing"]),
        ));
        sendTelegramNotification(
            `⚠️ *Webhook vide*\n📋 \`${order.orderNumber}\`\nLoadBrain a renvoyé completed sans credentials. Action SAV requise.`,
            ["ADMIN"]
        ).catch(() => {});
        return;
    }

    const targetCustomData = parseIbosolCustomData(targetItem.customData);
    const comboRequested = !!targetCustomData?.combo;
    const partial = ibosolMode && isPartialSuccess(creds, comboRequested);
    const finalStatus = partial ? "completed_partial" : "completed";

    await db.transaction(async (tx) => {
        const existing = await tx.query.digitalCodes.findFirst({
            where: eq(digitalCodes.orderItemId, targetItem.id),
        });
        if (existing) return;

        if (ibosolMode) {
            const codeValue = formatIbosolCode(creds);
            await tx.insert(digitalCodes).values({
                variantId: targetItem.variantId,
                orderItemId: targetItem.id,
                code: encrypt(codeValue),
                status: DigitalCodeStatus.VENDU,
                expiresAt: parseIbosolExpires(creds.expiresAt),
            });
        } else {
            for (const screen of screens) {
                const isCodeMode = screen.code && !screen.username;
                let m3uUrl = screen.m3uUrl || "";
                if (!isCodeMode && !m3uUrl && screen.epgUrl) {
                    const host = screen.epgUrl.split("/xmltv")[0];
                    m3uUrl = `${host}/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
                }
                const codeValue = isCodeMode
                    ? screen.code
                    : [screen.username, screen.password, m3uUrl, screen.epgUrl || ""].join(" | ");

                await tx.insert(digitalCodes).values({
                    variantId: targetItem.variantId,
                    orderItemId: targetItem.id,
                    code: encrypt(codeValue),
                    status: DigitalCodeStatus.VENDU,
                    expiresAt: parseIbosolExpires(screen.expiresAt),
                });
            }
        }

        await tx.update(iptvProvisions).set({
            status: finalStatus,
            error: partial ? "IPTV combo not delivered" : null,
            errorCode: partial ? "PARTIAL_IPTV" : null,
            credentialsEncrypted: encrypt(JSON.stringify(event.credentials)),
            completedAt: new Date(),
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
            inArray(iptvProvisions.status, ["queued", "processing", "failed"]),
        ));

        const isWhatsApp = (order as any).deliveryMethod === DeliveryMethod.WHATSAPP;
        await tx.update(orders).set({
            status: OrderStatus.TERMINE,
            isDelivered: true,
            printStatus: isWhatsApp ? "idle" : "print_pending",
        }).where(eq(orders.id, order.id));
    });

    eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId: order.id });

    // Option A — phase 2 trigger
    if (!ibosolMode && screens.length > 0) {
        const screen = screens[0];
        const pendingIbo = (order as any).items.find((it: any) => {
            const cd = parseIbosolCustomData(it.customData);
            return cd?.awaitsPhase1 === targetItem.id;
        });

        if (pendingIbo && screen.username && screen.password) {
            // Skip if phase 2 already dispatched (idempotence — sync may run multiple times)
            const existingPhase2 = await db.query.iptvProvisions.findFirst({
                where: and(
                    eq(iptvProvisions.orderId, order.id),
                    eq(iptvProvisions.orderItemId, pendingIbo.id),
                ),
            });
            if (!existingPhase2) {
                try {
                    const baseUrl = screen.m3uUrl || screen.epgUrl || "";
                    const m = baseUrl.match(/^(https?:\/\/[^/]+)/);
                    const playlistUrl = m ? m[1] : "";

                    if (playlistUrl) {
                        const ibosolData = parseIbosolCustomData(pendingIbo.customData);
                        if (ibosolData?.mac && ibosolData.appId !== undefined) {
                            const { provisionIbosolInjectPhase2 } = await import("@/lib/iptv");
                            const customerPhone = (order as any).customerPhone || (order as any).client?.telephone || "";
                            const customerName = (order as any).client?.nomComplet || "Client";
                            await provisionIbosolInjectPhase2({
                                orderId: order.id,
                                orderNumber: order.orderNumber,
                                iboItemId: pendingIbo.id,
                                iboVariantId: pendingIbo.variantId,
                                mac: ibosolData.mac,
                                appId: ibosolData.appId,
                                playlistUrl,
                                playlistUsername: screen.username,
                                playlistPassword: screen.password,
                                customerName,
                                customerPhone,
                            });
                        }
                    }
                } catch (err: any) {
                    console.error("[Webhook] Failed to dispatch Option A phase 2:", err.message);
                }
            }
        }
    }

    const summary = ibosolMode
        ? (partial
            ? `⚠️ IBO activé, IPTV échouée (action SAV requise)`
            : (creds.iptvUsername
                ? `🔑 ${creds.mac} + IPTV ${creds.iptvUsername}`
                : `🔑 ${creds.mac} ${creds.activationCode ? "→ activé" : ""}`.trim()))
        : `🔑 ${screens[0]?.username || screens[0]?.code || "code"} / ${"•".repeat(8)}`;

    const emoji = partial ? "⚠️" : "✅";
    const title = partial ? "IBO partiel" : (ibosolMode ? "IBO livré" : "IPTV livré");

    sendTelegramNotification(
        `${emoji} *${title}*\n📋 \`${order.orderNumber}\`\n👤 ${(order as any).client?.nomComplet || "N/A"}\n${summary}`,
        ["ADMIN"]
    ).catch(() => {});
}

export async function processFailedTask(event: LoadBrainTaskEvent): Promise<void> {
    const baseOrderNumber = event.orderId?.replace(/-item-\d+$/, "") || event.orderId;
    const order = await db.query.orders.findFirst({
        where: eq(orders.orderNumber, baseOrderNumber),
    });

    if (order) {
        await db.update(iptvProvisions).set({
            status: "failed",
            error: event.error || "Unknown",
            errorCode: event.errorCode || null,
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            inArray(iptvProvisions.status, ["queued", "processing"]),
        ));
    }

    if (event.errorCode === "DEVICE_NOT_ACTIVATED") {
        sendTelegramNotification(
            `⚠️ *IBO device non activé*\n📋 \`${event.orderId}\`\n` +
            `Le client doit ouvrir l'app IBO Player sur sa TV (essai gratuit 7j) puis cliquer "Relancer" depuis /admin/iptv.`,
            ["ADMIN"]
        ).catch(() => {});
        return;
    }

    sendTelegramNotification(
        `❌ *IPTV échoué*\n📋 \`${event.orderId}\`\n❌ ${event.error || "Inconnue"}`,
        ["ADMIN"]
    ).catch(() => {});
}
