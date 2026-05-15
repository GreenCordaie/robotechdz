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
    /** ISO 8601 timestamp from LoadBrain — required for ordering out-of-sequence webhooks */
    completedAt?: string;
}

/**
 * Parse an ISO timestamp from a LoadBrain event, falling back to "now".
 * Used to compare event recency against existing provision state.
 */
function eventTime(event: LoadBrainTaskEvent): Date {
    if (event.completedAt) {
        const d = new Date(event.completedAt);
        if (!isNaN(d.getTime())) return d;
    }
    return new Date();
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

    // Timestamp idempotency guard — drop stale events that arrive after a more recent state.
    // Protects against out-of-order webhook delivery: e.g. a slow `failed` retry arriving
    // after `completed` has already landed (network reordering, LoadBrain retry storms).
    const existingProvision = await db.query.iptvProvisions.findFirst({
        where: and(
            eq(iptvProvisions.orderId, order.id),
            eq(iptvProvisions.orderItemId, targetItem.id),
        ),
    });
    const incomingAt = eventTime(event);
    if (existingProvision?.completedAt && existingProvision.completedAt >= incomingAt) {
        console.log(`[LoadBrain] Drop stale completed event for ${event.orderId} — existing completedAt=${existingProvision.completedAt.toISOString()} >= incoming=${incomingAt.toISOString()}`);
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
                // Three webhook shapes from LoadBrain:
                //  1. Pure code-only        → screen.code present, no username (gift-card style)
                //  2. Pure credentials      → username + password + m3u, no code
                //  3. IronMax "code" mode   → username + password + m3u + code (additive)
                const hasCredentials = !!screen.username;
                const isPureCode = !!screen.code && !hasCredentials;
                let m3uUrl = screen.m3uUrl || "";
                if (hasCredentials && !m3uUrl && screen.epgUrl) {
                    const host = screen.epgUrl.split("/xmltv")[0];
                    m3uUrl = `${host}/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
                }

                let codeValue: string;
                if (isPureCode) {
                    codeValue = screen.code;
                } else {
                    // Pipe-delimited; append the optional activation code at position 5 when present.
                    const parts = [screen.username, screen.password, m3uUrl, screen.epgUrl || ""];
                    if (screen.code) parts.push(screen.code);
                    codeValue = parts.join(" | ");
                }

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

    // EPIC 6.2 — auto-WhatsApp credentials ready si l'order est B2B (reseller)
    // + EPIC 1 / Phase G — dispatch outbound webhook credentials.ready
    // Fire-and-forget, no-op safe si WhatsApp/webhook non configurés.
    const resellerIdMaybe = (order as { resellerId?: number | null }).resellerId;
    if (resellerIdMaybe) {
        try {
            const { ResellerNotifications } = await import("@/services/reseller-notifications.service");
            const { dispatchResellerEvent } = await import("@/services/webhook-dispatcher.service");
            const { resellers } = await import("@/db/schema");
            const reseller = await db.query.resellers.findFirst({
                where: eq(resellers.id, resellerIdMaybe),
            });
            if (reseller) {
                const summary = ibosolMode
                    ? (creds.iptvUsername ? `IPTV ${creds.iptvUsername}` : `MAC ${creds.mac ?? "—"}`)
                    : (screens[0]?.username
                        ? `User ${screens[0].username}`
                        : (screens[0]?.code ? `Code ${screens[0].code.slice(0, 4)}…` : undefined));
                ResellerNotifications.notifyOrderCredentialsReady({
                    resellerId: reseller.id,
                    companyName: reseller.companyName,
                    contactPhone: reseller.contactPhone,
                    orderNumber: order.orderNumber,
                    credentialSummary: summary,
                }).catch((err) => {
                    console.warn("[loadbrain] reseller notif failed (non-bloquant):", err);
                });

                dispatchResellerEvent(resellerIdMaybe, "credentials.ready", {
                    orderNumber: order.orderNumber,
                    orderId: order.id,
                    deliveryMode: ibosolMode ? "ibosol" : "iptv",
                    summary,
                    partial,
                }).catch((err) => {
                    console.warn("[loadbrain] webhook dispatch failed (non-bloquant):", err);
                });
            }
        } catch (err) {
            console.warn("[loadbrain] reseller notif/webhook lookup failed:", err);
        }
    }

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
        // Resolve the specific item (if -item-<id> suffix is present) to scope the update
        const itemIdMatch = event.orderId?.match(/-item-(\d+)$/);
        const itemId = itemIdMatch ? parseInt(itemIdMatch[1]) : null;

        // Idempotency: never demote a completed/completed_partial provision back to failed.
        // Once credentials exist, late-arriving "failed" webhooks are stale (LoadBrain retry
        // storms, network reordering) and must be ignored.
        const existing = itemId
            ? await db.query.iptvProvisions.findFirst({
                where: and(
                    eq(iptvProvisions.orderId, order.id),
                    eq(iptvProvisions.orderItemId, itemId),
                ),
            })
            : await db.query.iptvProvisions.findFirst({
                where: eq(iptvProvisions.orderId, order.id),
            });

        if (existing && ["completed", "completed_partial"].includes(existing.status)) {
            console.log(`[LoadBrain] Drop stale failed event for ${event.orderId} — already ${existing.status} (completedAt=${existing.completedAt?.toISOString() ?? "null"})`);
            return;
        }

        // Status filter remains as belt-and-suspenders: only queued/processing get demoted.
        await db.update(iptvProvisions).set({
            status: "failed",
            error: event.error || "Unknown",
            errorCode: event.errorCode || null,
        }).where(and(
            eq(iptvProvisions.orderId, order.id),
            ...(itemId ? [eq(iptvProvisions.orderItemId, itemId)] : []),
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
