"use server";

import { db } from "@/db";
import { iptvProvisions, digitalCodes, orders, orderItems, productVariants } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { withAuth } from "@/lib/security";
import { UserRole, DigitalCodeStatus } from "@/lib/constants";
import { decrypt, encrypt } from "@/lib/encryption";
import { OrderService } from "@/services/order.service";
import { z } from "zod";

export const getIptvProvisions = withAuth(
    { roles: [UserRole.ADMIN, UserRole.CAISSIER, UserRole.TRAITEUR] },
    async () => {
        try {
            const provisions = await db.query.iptvProvisions.findMany({
                with: {
                    order: { with: { client: true } },
                    orderItem: true,
                    variant: { with: { product: true } },
                },
                orderBy: [desc(iptvProvisions.createdAt)],
                limit: 100,
            });

            return {
                success: true,
                provisions: provisions.map((p: any) => {
                    let credentials = null;
                    if (p.credentialsEncrypted) {
                        try {
                            const decrypted = decrypt(p.credentialsEncrypted);
                            if (decrypted) credentials = JSON.parse(decrypted);
                        } catch {}
                    }

                    return {
                        id: p.id,
                        taskId: p.taskId,
                        loadbrainSlug: p.loadbrainSlug,
                        status: p.status,
                        error: p.error,
                        errorCode: p.errorCode,
                        credentials,
                        completedAt: p.completedAt,
                        createdAt: p.createdAt,
                        order: {
                            id: p.order?.id,
                            orderNumber: p.order?.orderNumber,
                            status: p.order?.status,
                            customerPhone: p.order?.customerPhone,
                            client: p.order?.client ? {
                                nomComplet: p.order.client.nomComplet,
                                telephone: p.order.client.telephone,
                            } : null,
                        },
                        variant: {
                            name: p.variant?.name,
                            product: p.variant?.product?.name,
                        },
                    };
                }),
            };
        } catch (error) {
            return { success: false, error: (error as Error).message, provisions: [] };
        }
    }
);

export const retryIptvProvisionAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ provisionId: z.number() }),
    },
    async ({ provisionId }) => {
        try {
            const { retryIptvProvision } = await import("@/lib/iptv");
            return await retryIptvProvision(provisionId);
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const resendWebhookAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ taskId: z.string() }),
    },
    async ({ taskId }) => {
        try {
            const { resendIptvWebhook } = await import("@/lib/iptv");
            return await resendIptvWebhook(taskId);
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const cancelIptvOrderAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ orderNumber: z.string(), provisionId: z.number() }),
    },
    async ({ orderNumber, provisionId }) => {
        try {
            const { cancelIptvOrder } = await import("@/lib/iptv");
            const result = await cancelIptvOrder(orderNumber);
            if (result.success) {
                await db.update(iptvProvisions).set({ status: "cancelled" }).where(eq(iptvProvisions.id, provisionId));
            }
            return result;
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const manualCredentialEntryAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            provisionId: z.number(),
            username: z.string().min(1),
            password: z.string().min(1),
            m3uUrl: z.string().optional(),
            epgUrl: z.string().optional(),
        }),
    },
    async ({ provisionId, username, password, m3uUrl, epgUrl }) => {
        try {
            const provision = await db.query.iptvProvisions.findFirst({
                where: eq(iptvProvisions.id, provisionId),
            });
            if (!provision) return { success: false, error: "Provision non trouvée" };

            const codeString = [username, password, m3uUrl || "", epgUrl || ""].join(" | ");
            const credentials = { screens: [{ screenNumber: 1, username, password, m3uUrl: m3uUrl || "", epgUrl: epgUrl || "" }] };

            await db.transaction(async (tx) => {
                await tx.insert(digitalCodes).values({
                    variantId: provision.variantId!,
                    orderItemId: provision.orderItemId,
                    code: encrypt(codeString),
                    status: DigitalCodeStatus.VENDU,
                });
                await tx.update(iptvProvisions).set({
                    status: "completed",
                    credentialsEncrypted: encrypt(JSON.stringify(credentials)),
                    completedAt: new Date(),
                    error: null,
                }).where(eq(iptvProvisions.id, provisionId));
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

export const renewIptvAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ taskId: z.string(), provisionId: z.number() }),
    },
    async ({ taskId, provisionId }) => {
        try {
            const { lbClient } = await import("@/lib/loadbrain");
            if (!lbClient) return { success: false, error: "LoadBrain disabled" };
            const result = await lbClient.renewSubscription(taskId);
            await db.update(iptvProvisions).set({
                status: "queued",
                error: null,
                taskId: (result as any).taskId || taskId,
            }).where(eq(iptvProvisions.id, provisionId));
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }
);

/**
 * Admin SAV: manually inject an IPTV playlist into an already-activated IBO device.
 * Creates an #ADM- order and runs it through the standard payment + provisioning pipeline.
 */
export const manualInjectIptvAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.CAISSIER],
        schema: z.object({
            mac: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/),
            appId: z.number().int().min(1).max(10),
            iptvVariantId: z.number().int(),
            iptvProviderId: z.string().min(1),
            iptvPlanId: z.string().min(1),
            iptvProductName: z.string().min(1),
            iptvPrice: z.string(),
            customPrice: z.string(),
            customerPhone: z.string().optional(),
        }),
    },
    async (input, user) => {
        try {
            // Generate admin order number
            const countResult = await db.select({ count: sql<number>`count(*)` }).from(orders);
            const c = (Number(countResult[0]?.count || 0) % 999) + 1;
            const orderNumber = `#ADM-${c}-${Date.now().toString().slice(-3)}`;

            const customDataJson = JSON.stringify({
                type: "ibosol",
                mac: input.mac,
                appId: input.appId,
                combo: {
                    iptvVariantId: input.iptvVariantId,
                    iptvProviderId: input.iptvProviderId,
                    iptvPlanId: input.iptvPlanId,
                    iptvProductName: input.iptvProductName,
                    iptvPrice: input.iptvPrice,
                },
            });

            // Find ibo-inject variant in DB
            const injectVariant = await db.query.productVariants.findFirst({
                where: eq(productVariants.loadbrainSlug, "ibo-inject"),
            });
            if (!injectVariant) {
                return { success: false, error: "Variant ibo-inject introuvable" };
            }

            const [order] = await db
                .insert(orders)
                .values({
                    orderNumber,
                    status: "EN_ATTENTE",
                    totalAmount: input.customPrice,
                    deliveryMethod: input.customerPhone ? "WHATSAPP" : "TICKET",
                    customerPhone: input.customerPhone || null,
                })
                .returning();

            await db.insert(orderItems).values({
                orderId: order.id,
                variantId: injectVariant.id,
                name: `Inject ${input.iptvProductName} → ${input.mac}`,
                price: input.customPrice,
                quantity: 1,
                customData: customDataJson,
            });

            // Pay (admin user) — triggers provisionIptvOrder via payOrder
            await OrderService.payOrder(order.id, user.id, {
                remise: 0,
                montantPaye: parseFloat(input.customPrice),
            });

            return { success: true, orderNumber };
        } catch (err) {
            return { success: false, error: (err as Error).message };
        }
    }
);
