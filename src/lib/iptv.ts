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

    return { provisioned: taskIds.length, taskIds };
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
        where: and(eq(iptvProvisions.id, provisionId), inArray(iptvProvisions.status, ["failed", "queued"])),
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
    const { sql, lte } = await import("drizzle-orm");
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    // Find digital codes with IPTV credentials expiring within threshold
    const expiringCodes = await db.query.digitalCodes.findMany({
        where: and(
            eq(digitalCodes.status, "VENDU"),
            sql`${digitalCodes.expiresAt} IS NOT NULL AND ${digitalCodes.expiresAt} <= ${thresholdDate} AND ${digitalCodes.expiresAt} > NOW()`
        ),
        with: {
            orderItem: {
                with: {
                    order: { with: { client: true } },
                    variant: { with: { product: true } },
                }
            }
        },
        limit: 50,
    });

    // Filter only IPTV codes
    return expiringCodes.filter((c: any) => c.orderItem?.variant?.loadbrainSlug);
}
