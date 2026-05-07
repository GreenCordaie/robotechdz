import "server-only";
import { db } from "@/db";
import { orders, orderItems, productVariants, iptvProvisions, digitalCodes } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { lbClient, lbConfig, isLoadBrainEnabled } from "@/lib/loadbrain";
import { parseIbosolCustomData } from "@/lib/ibosol-credentials";
import { getProviderSlug } from "@/lib/loadbrain-providers";

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

    const allIptvItems = (order as any).items.filter((item: any) => item.variant?.loadbrainSlug);
    if (allIptvItems.length === 0) return { provisioned: 0, taskIds: [] };

    // Skip items that already have a provision row (idempotence: protège contre
    // les double-appels et permet la relance après un completed_partial).
    const existingProvisions = await db.query.iptvProvisions.findMany({
        where: eq(iptvProvisions.orderId, orderId),
    });
    const provisionedItemIds = new Set(existingProvisions.map(p => p.orderItemId));

    // Option A — phase 2 (ibo-inject avec awaitsPhase1) doit attendre la phase 1
    // → on les skip ici, le webhook handler les déclenchera après la phase 1.
    const iptvItems = allIptvItems.filter((it: any) => {
        if (provisionedItemIds.has(it.id)) return false;
        const cd = parseIbosolCustomData(it.customData);
        if (cd?.awaitsPhase1) return false;
        return true;
    });
    if (iptvItems.length === 0) {
        console.log(`[IPTV] All items for order #${orderId} already provisioned or awaiting phase 1 — skipping`);
        return { provisioned: 0, taskIds: [] };
    }

    const customerPhone = (order as any).customerPhone || (order as any).client?.telephone || "";
    const customerName = (order as any).client?.nomComplet || "Client";
    const taskIds: string[] = [];

    for (let idx = 0; idx < iptvItems.length; idx++) {
        const item = iptvItems[idx];
        const slug = item.variant.loadbrainSlug;
        const itemOrderId = iptvItems.length > 1
            ? `${order.orderNumber}-item-${item.id}`
            : order.orderNumber;

        // LoadBrain has a 3s Chrome launch cooldown between provisions
        if (idx > 0) {
            await new Promise(r => setTimeout(r, 5000));
        }

        try {
            console.log(`[IPTV] Provisioning ${slug} for order ${itemOrderId}`);

            const isIbosolSlug = slug.startsWith("ibo-");
            const ibosolData = isIbosolSlug ? parseIbosolCustomData(item.customData) : null;
            // NOTE: IronMax `deliveryMethod: "code"` was rolled back on 2026-05-07 because
            // LoadBrain's getCodeCredentials lookup fails ("code not found in /code/usedcode"
            // → LINE_CREATION_FAILED) even when the code IS created on the panel. The
            // "credentials" path is slower (~6-10s) but reliable. Re-enable when LoadBrain
            // fixes the race / lookup bug.
            const iptvDelivery: string = isIbosolSlug ? "" : (item.customData || "credentials");

            // Resolve slug → providerId + planId from LoadBrain
            const mapping = await lbClient.listProducts();
            let product = (mapping as any).products?.find((p: any) => p.productId === slug);

            // Fallback for Ibosol: IBOSOL doesn't expose site_product_mappings,
            // resolve providerId + planId from the catalog by displayName keyword.
            if (!product && slug.startsWith("ibo-")) {
                const iboRes = await fetch(`${lbConfig!.baseUrl}/api/v1/catalog`, {
                    headers: { "X-API-Key": lbConfig!.apiKey },
                });
                const catalog = await iboRes.json();
                const iboProvider = (catalog.data?.providers || []).find((p: any) => p.type === "ibosol");
                if (iboProvider) {
                    // Keywords matching prod displayNames:
                    // "Check MAC Address", "IBO Player 1 Year", "IBO Player Lifetime", "Inject IPTV Playlist"
                    const slugToKeyword: Record<string, string> = {
                        "ibo-check": "Check MAC",
                        "ibo-activate-yearly": "1 Year",
                        "ibo-activate-lifetime": "Lifetime",
                        "ibo-inject": "Inject",
                    };
                    const keyword = slugToKeyword[slug];
                    const plan = keyword
                        ? iboProvider.plans?.find((p: any) => p.displayName?.includes(keyword))
                        : null;
                    if (plan) {
                        product = { providerId: iboProvider.id, planId: plan.id, screenCount: 1 };
                    }
                }
            }

            if (!product) throw new Error(`LoadBrain slug "${slug}" not mapped`);

            const customerInfo: Record<string, unknown> = {
                name: customerName,
                phone: customerPhone,
                orderNumber: order.orderNumber,
            };
            if (isIbosolSlug) {
                if (!ibosolData?.mac) throw new Error(`MAC address required for Ibosol product "${slug}"`);
                customerInfo.mac = ibosolData.mac;
                customerInfo.appId = ibosolData.appId;

                if (ibosolData.combo) {
                    customerInfo.iptvProvider = getProviderSlug(ibosolData.combo.iptvProviderId);
                    customerInfo.iptvProviderId = ibosolData.combo.iptvProviderId;
                    customerInfo.iptvPlanId = ibosolData.combo.iptvPlanId;
                }
            }

            const provisionPayload: Record<string, unknown> = {
                orderId: itemOrderId,
                customerId: String((order as any).clientId || order.id),
                customerInfo,
                providerId: product.providerId,
                planId: product.planId,
                screenCount: product.screenCount || 1,
                webhookUrl: `${lbConfig!.siteUrl.replace(/\/$/, "")}/api/loadbrain/webhook`,
                webhookSecret: lbConfig!.webhookSecret,
            };
            // Only IPTV (non-Ibosol) supports the deliveryMethod toggle
            if (!isIbosolSlug) {
                provisionPayload.deliveryMethod = iptvDelivery;
            }

            const res = await fetch(`${lbConfig!.baseUrl}/api/v1/provision`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-API-Key": lbConfig!.apiKey },
                body: JSON.stringify(provisionPayload),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Provision failed");
            const result = json.data;

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
 * Polling fallback : pour chaque provision en queued/processing depuis > thresholdMs,
 * vérifie le statut côté LoadBrain via getTask. Si la task est completed côté LoadBrain
 * mais pas chez nous, on simule l'arrivée du webhook (idempotent grâce aux checks
 * existants dans handleComplete).
 *
 * Couvre les cas :
 *   - webhook perdu (réseau, signature rejetée par notre app)
 *   - app down pendant le POST de LoadBrain
 *   - re-déploiement qui a tué la requête en vol
 *
 * Appelable :
 *   - Manuellement via /admin/iptv (bouton "Synchroniser")
 *   - Automatiquement au refresh de la liste (silencieux, best-effort)
 */
export async function syncStaleProvisions(thresholdMs: number = 3 * 60 * 1000): Promise<{ checked: number; recovered: number; errors: number }> {
    if (!isLoadBrainEnabled() || !lbClient) {
        return { checked: 0, recovered: 0, errors: 0 };
    }

    const cutoff = new Date(Date.now() - thresholdMs);
    const stale = await db.query.iptvProvisions.findMany({
        where: and(
            inArray(iptvProvisions.status, ["queued", "processing"]),
        ),
    });
    const stuckProvisions = stale.filter(p =>
        p.createdAt && p.createdAt < cutoff &&
        !p.taskId.startsWith("dispatch-failed-")
    );

    if (stuckProvisions.length === 0) {
        return { checked: 0, recovered: 0, errors: 0 };
    }

    let recovered = 0;
    let errors = 0;
    const { sendTelegramNotification } = await import("@/lib/telegram");
    const { processCompletedTask, processFailedTask } = await import("@/lib/iptv-webhook-processor");

    for (const provision of stuckProvisions) {
        try {
            const task = await lbClient.getTask(provision.taskId);
            const taskData = (task as any).task || task;

            if (taskData.status === "completed") {
                // Apply credentials locally — works even when our public webhook URL
                // returned 404 (stale prod deploy) or signature was rejected.
                await processCompletedTask({
                    orderId: taskData.orderId,
                    status: "completed",
                    credentials: taskData.credentials,
                    completedAt: taskData.completedAt,
                });
                recovered++;
                console.log(`[IPTV] Stale provision ${provision.id} (task ${provision.taskId}) recovered — credentials applied`);
            } else if (taskData.status === "failed") {
                await processFailedTask({
                    orderId: taskData.orderId,
                    status: "failed",
                    error: taskData.error,
                    errorCode: taskData.errorCode,
                    completedAt: taskData.completedAt,
                });
                recovered++;
            }
            // status still queued/processing → leave as is, retry next sync
        } catch (err: any) {
            errors++;
            console.error(`[IPTV] Sync failed for provision ${provision.id}:`, err.message);
        }
    }

    if (recovered > 0) {
        sendTelegramNotification(
            `🔄 *Sync IPTV*\nRécupéré ${recovered} provision(s) bloquée(s) sur ${stuckProvisions.length} vérifiées.`,
            ["ADMIN"]
        ).catch(() => {});
    }

    return { checked: stuckProvisions.length, recovered, errors };
}

/**
 * Option A — Phase 2 dispatcher.
 * Called by the webhook handler after the IPTV phase 1 completes successfully.
 * Provisions an `ibo-inject` item with playlistUrl/Username/Password derived from
 * the phase 1 IPTV credentials.
 */
export async function provisionIbosolInjectPhase2(input: {
    orderId: number;
    orderNumber: string;
    iboItemId: number;
    iboVariantId: number;
    mac: string;
    appId: number;
    playlistUrl: string;
    playlistUsername: string;
    playlistPassword: string;
    customerName: string;
    customerPhone: string;
}): Promise<{ success: boolean; taskId?: string; error?: string }> {
    if (!isLoadBrainEnabled() || !lbClient) {
        return { success: false, error: "LoadBrain disabled" };
    }

    try {
        // Resolve ibo-inject planId via catalog (IBOSOL has no site_product_mappings)
        const iboRes = await fetch(`${lbConfig!.baseUrl}/api/v1/catalog`, {
            headers: { "X-API-Key": lbConfig!.apiKey },
        });
        const catalog = await iboRes.json();
        const iboProvider = (catalog.data?.providers || []).find((p: any) => p.type === "ibosol");
        if (!iboProvider) throw new Error("IBOSOL provider not found in catalog");
        const injectPlan = iboProvider.plans?.find((p: any) => p.displayName?.includes("Inject"));
        if (!injectPlan) throw new Error("ibo-inject plan not found in IBOSOL catalog");

        const itemOrderId = `${input.orderNumber}-item-${input.iboItemId}`;
        const provisionPayload = {
            orderId: itemOrderId,
            customerId: String(input.orderId),
            customerInfo: {
                name: input.customerName,
                phone: input.customerPhone,
                orderNumber: input.orderNumber,
                mac: input.mac,
                appId: input.appId,
                playlistUrl: input.playlistUrl,
                playlistUsername: input.playlistUsername,
                playlistPassword: input.playlistPassword,
            },
            providerId: iboProvider.id,
            planId: injectPlan.id,
            screenCount: 1,
            webhookUrl: `${lbConfig!.siteUrl.replace(/\/$/, "")}/api/loadbrain/webhook`,
            webhookSecret: lbConfig!.webhookSecret,
        };

        const res = await fetch(`${lbConfig!.baseUrl}/api/v1/provision`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-API-Key": lbConfig!.apiKey },
            body: JSON.stringify(provisionPayload),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Phase 2 provision failed");
        const result = json.data;

        await db.insert(iptvProvisions).values({
            orderId: input.orderId,
            orderItemId: input.iboItemId,
            variantId: input.iboVariantId,
            taskId: result.taskId,
            loadbrainSlug: "ibo-inject",
            status: result.status || "queued",
        });

        console.log(`[IPTV] Option A phase 2 dispatched: ${result.taskId} (order ${input.orderNumber})`);
        return { success: true, taskId: result.taskId };
    } catch (err: any) {
        console.error("[IPTV] Phase 2 dispatch failed:", err.message);

        await db.insert(iptvProvisions).values({
            orderId: input.orderId,
            orderItemId: input.iboItemId,
            variantId: input.iboVariantId,
            taskId: `dispatch-failed-${input.iboItemId}`,
            loadbrainSlug: "ibo-inject",
            status: "failed",
            error: err.message,
        }).catch(() => {});

        const { sendTelegramNotification } = await import("@/lib/telegram");
        sendTelegramNotification(
            `❌ *Phase 2 IBO inject échouée*\n\n` +
            `📋 Commande: \`${input.orderNumber}\`\n` +
            `🔑 IPTV créée mais inject IBO échec\n` +
            `❌ ${err.message}\n\n` +
            `→ Action SAV : relancer depuis /admin/iptv`,
            ["ADMIN"]
        ).catch(() => {});

        return { success: false, error: err.message };
    }
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
