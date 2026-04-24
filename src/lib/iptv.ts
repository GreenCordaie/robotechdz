import "server-only";
import { db } from "@/db";
import { orders, orderItems, productVariants, iptvProvisions, digitalCodes } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { lbClient, isLoadBrainEnabled } from "@/lib/loadbrain";

/**
 * Check if an order item is an IPTV product (has LoadBrain slug).
 */
export function isIptvItem(item: { variant?: { loadbrainSlug?: string | null } | null }): boolean {
    return !!item.variant?.loadbrainSlug;
}

/**
 * Check if any item in the list is IPTV.
 */
export function hasIptvItems(items: Array<{ variant?: { loadbrainSlug?: string | null } | null }>): boolean {
    return items.some(isIptvItem);
}

/**
 * Provision all IPTV items in an order via LoadBrain.
 * Called after payOrder() — fire-and-forget, webhook completes the flow.
 */
export async function provisionIptvOrder(orderId: number): Promise<{ provisioned: number; taskIds: string[] }> {
    if (!isLoadBrainEnabled() || !lbClient) {
        console.warn("[IPTV] LoadBrain disabled — skipping provisioning");
        return { provisioned: 0, taskIds: [] };
    }

    const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: {
            client: true,
            items: {
                with: {
                    variant: { with: { product: true } }
                }
            }
        }
    });

    if (!order) {
        console.error(`[IPTV] Order #${orderId} not found`);
        return { provisioned: 0, taskIds: [] };
    }

    const iptvItems = (order as any).items.filter((item: any) => item.variant?.loadbrainSlug);
    if (iptvItems.length === 0) return { provisioned: 0, taskIds: [] };

    const customerPhone = (order as any).customerPhone || (order as any).client?.telephone || "";
    const customerName = (order as any).client?.nomComplet || "Client";
    const taskIds: string[] = [];

    for (const item of iptvItems) {
        const slug = item.variant.loadbrainSlug;
        const itemOrderId = iptvItems.length > 1
            ? `${order.orderNumber}-item-${item.id}`
            : order.orderNumber;

        try {
            console.log(`[IPTV] Provisioning ${slug} for order ${itemOrderId}`);

            const result = await lbClient.provisionProduct(slug, {
                orderId: itemOrderId,
                customerId: String((order as any).clientId || order.id),
                customerInfo: {
                    name: customerName,
                    phone: customerPhone,
                    orderNumber: order.orderNumber,
                },
            });

            // Create tracking record
            await db.insert(iptvProvisions).values({
                orderId: order.id,
                orderItemId: item.id,
                variantId: item.variantId,
                taskId: result.taskId,
                loadbrainSlug: slug,
                status: result.status || "queued",
            });

            taskIds.push(result.taskId);
            console.log(`[IPTV] Task ${result.taskId} created for ${slug} (${result.status})`);
        } catch (err: any) {
            console.error(`[IPTV] Failed to provision ${slug}:`, err.message);

            // Record failure — store slug as taskId for retry via provisionProduct()
            await db.insert(iptvProvisions).values({
                orderId: order.id,
                orderItemId: item.id,
                variantId: item.variantId,
                taskId: `dispatch-failed-${item.id}`,
                loadbrainSlug: slug,
                status: "failed",
                error: err.message,
            }).catch(() => {});

            // Alert admin
            const { sendTelegramNotification } = await import("@/lib/telegram");
            sendTelegramNotification(
                `❌ *IPTV Provisioning échoué*\n\n` +
                `📋 Commande: \`${order.orderNumber}\`\n` +
                `🏷️ Plan: ${slug}\n` +
                `❌ ${err.message}`,
                ["ADMIN"]
            ).catch(() => {});
        }
    }

    // Poll LoadBrain for completion (fallback if webhook doesn't arrive)
    if (taskIds.length > 0) {
        pollAndCompleteProvisions(order.id, taskIds).catch(err =>
            console.error(`[IPTV] Poll error for order #${order.id}:`, err.message)
        );
    }

    return { provisioned: taskIds.length, taskIds };
}

/**
 * Poll LoadBrain tasks and complete provisions if webhook doesn't arrive.
 * Runs in background — checks every 5s for 60s.
 */
async function pollAndCompleteProvisions(orderId: number, taskIds: string[]) {
    if (!lbClient) return;

    const { encrypt } = await import("@/lib/encryption");
    const { eventBus, SystemEvent } = await import("@/lib/events");
    const { OrderStatus, DeliveryMethod, DigitalCodeStatus } = await import("@/lib/constants");

    for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s

        // Check if already completed via webhook
        const provisions = await db.query.iptvProvisions.findMany({
            where: eq(iptvProvisions.orderId, orderId),
        });
        const allDone = provisions.every(p => p.status === "completed" || p.status === "failed");
        if (allDone && provisions.some(p => p.status === "completed")) {
            console.log(`[IPTV] Order #${orderId} already completed via webhook`);
            return;
        }

        // Poll each pending task
        for (const taskId of taskIds) {
            const provision = provisions.find(p => p.taskId === taskId);
            if (!provision || provision.status !== "queued") continue;

            try {
                const task = await lbClient!.getTask(taskId);
                if (task.task.status === "completed" && task.task.credentials?.screens?.length) {
                    console.log(`[IPTV] Poll: task ${taskId} completed — injecting credentials`);

                    const screens = task.task.credentials.screens;
                    for (const screen of screens) {
                        // Build M3U URL from EPG if missing
                        let m3uUrl = screen.m3uUrl || "";
                        if (!m3uUrl && screen.epgUrl) {
                            const host = screen.epgUrl.split("/xmltv")[0];
                            m3uUrl = `${host}/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
                        } else if (!m3uUrl && screen.username && screen.password) {
                            m3uUrl = `http://azerty365.net:80/get.php?username=${screen.username}&password=${screen.password}&type=m3u_plus`;
                        }

                        const codeString = [
                            screen.username,
                            screen.password,
                            m3uUrl,
                            screen.epgUrl || "",
                        ].join(" | ");

                        // Check idempotency
                        const existing = await db.query.digitalCodes.findFirst({
                            where: eq(digitalCodes.orderItemId, provision.orderItemId),
                        });
                        if (existing) continue;

                        await db.insert(digitalCodes).values({
                            variantId: provision.variantId!,
                            orderItemId: provision.orderItemId,
                            code: encrypt(codeString),
                            status: DigitalCodeStatus.VENDU,
                            expiresAt: screen.expiresAt && screen.expiresAt !== "pending" ? new Date(screen.expiresAt) : null,
                        });
                    }

                    // Update provision
                    await db.update(iptvProvisions).set({
                        status: "completed",
                        credentialsEncrypted: encrypt(JSON.stringify(task.task.credentials)),
                        completedAt: new Date(),
                    }).where(eq(iptvProvisions.id, provision.id));

                    // Check if all provisions are done → mark order TERMINE
                    const updatedProvisions = await db.query.iptvProvisions.findMany({
                        where: eq(iptvProvisions.orderId, orderId),
                    });
                    if (updatedProvisions.every(p => p.status === "completed")) {
                        await db.update(orders).set({
                            status: OrderStatus.TERMINE,
                            isDelivered: true,
                            printStatus: "idle",
                        }).where(eq(orders.id, orderId));

                        eventBus.publish(SystemEvent.ORDER_DELIVERED, { orderId });
                        console.log(`[IPTV] Order #${orderId} completed via polling`);
                    }
                    return; // Done
                } else if (task.task.status === "failed") {
                    await db.update(iptvProvisions).set({
                        status: "failed",
                        error: task.task.error || "Unknown error",
                    }).where(eq(iptvProvisions.id, provision.id));

                    const { sendTelegramNotification } = await import("@/lib/telegram");
                    sendTelegramNotification(
                        `❌ *IPTV échoué (poll)*\n📋 Commande #${orderId}\n❌ ${task.task.error}`,
                        ["ADMIN"]
                    ).catch(() => {});
                    return;
                }
            } catch {}
        }
    }
    console.log(`[IPTV] Poll timeout for order #${orderId} — waiting for webhook`);
}

/**
 * Get IPTV provision status for an order.
 */
export async function getIptvStatus(orderId: number) {
    return db.query.iptvProvisions.findMany({
        where: eq(iptvProvisions.orderId, orderId),
    });
}

/**
 * Retry a failed IPTV provision.
 * If dispatch failed (no real taskId), re-provisions via provisionProduct().
 * If LoadBrain task failed, uses retryTask().
 */
export async function retryIptvProvision(provisionId: number): Promise<{ success: boolean; error?: string }> {
    if (!lbClient) return { success: false, error: "LoadBrain disabled" };

    const provision = await db.query.iptvProvisions.findFirst({
        where: and(eq(iptvProvisions.id, provisionId), eq(iptvProvisions.status, "failed")),
        with: { order: true },
    });

    if (!provision) return { success: false, error: "Provision not found or not failed" };

    try {
        let result: any;

        if (provision.taskId.startsWith("dispatch-failed")) {
            // Original dispatch failed — re-provision from scratch
            const orderNumber = (provision as any).order?.orderNumber || `retry-${provisionId}`;
            result = await lbClient.provisionProduct(provision.loadbrainSlug, {
                orderId: orderNumber,
                customerId: String((provision as any).order?.clientId || provision.orderId),
                customerInfo: { retry: true },
            });
        } else {
            // LoadBrain task exists — use retryTask
            result = await lbClient.retryTask(provision.taskId);
        }

        await db.update(iptvProvisions).set({
            taskId: result.taskId || provision.taskId,
            status: "queued",
            error: null,
            errorCode: null,
        }).where(eq(iptvProvisions.id, provisionId));

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Get credentials for an order directly from LoadBrain.
 */
export async function getCredentialsByOrder(orderNumber: string) {
    if (!lbClient) return null;
    try {
        return await lbClient.getCredentialsByOrder(orderNumber);
    } catch {
        return null;
    }
}

/**
 * Cancel an IPTV order in LoadBrain.
 */
export async function cancelIptvOrder(orderNumber: string): Promise<{ success: boolean; error?: string }> {
    if (!lbClient) return { success: false, error: "LoadBrain disabled" };
    try {
        await lbClient.cancelOrder(orderNumber);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Resend webhook for a task.
 */
export async function resendIptvWebhook(taskId: string): Promise<{ success: boolean; error?: string }> {
    if (!lbClient) return { success: false, error: "LoadBrain disabled" };
    try {
        await lbClient.resendWebhook(taskId);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Validate a LoadBrain slug exists in the product mappings.
 */
export async function validateLoadBrainSlug(slug: string): Promise<boolean> {
    if (!lbClient) return false;
    try {
        const products = await lbClient.listProducts();
        return (products as any).products?.some((p: any) => p.productId === slug) || false;
    } catch {
        return false;
    }
}

/**
 * Check for IPTV provisions expiring within N days.
 */
export async function checkExpiringProvisions(daysThreshold: number = 3) {
    const { sql } = await import("drizzle-orm");
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    return db.query.iptvProvisions.findMany({
        where: and(
            eq(iptvProvisions.status, "completed"),
            sql`${iptvProvisions.completedAt} IS NOT NULL`
        ),
        with: {
            order: { with: { client: true } },
            variant: { with: { product: true } },
        },
        orderBy: [desc(iptvProvisions.createdAt)],
    });
}
