"use server";

import { db } from "@/db";
import { supportTickets, webhookEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { UserRole } from "@/lib/constants";

export const getSupportTickets = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.TRAITEUR],
        schema: z.string().optional().transform(val => (val || "OUVERT") as "OUVERT" | "RESOLU")
    },
    async (status) => {
        const { SupportQueries } = await import("@/services/queries/support.queries");
        return await SupportQueries.getTickets(status);
    }
);

export const getSupportCounts = withAuth(
    { roles: [UserRole.ADMIN, UserRole.TRAITEUR], schema: z.any().optional() },
    async () => {
        try {
            const { SupportQueries } = await import("@/services/queries/support.queries");
            const res = await SupportQueries.getOpenCount();
            return { success: true, count: res.open };
        } catch (error) {
            return { success: false, error: "Failed to fetch counts" };
        }
    }
);

export const updateTicketStatus = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.TRAITEUR],
        schema: z.object({ ticketId: z.number(), status: z.enum(["OUVERT", "RESOLU"]) })
    },
    async ({ ticketId, status }) => {
        try {
            await db.update(supportTickets)
                .set({ status, updatedAt: new Date() })
                .where(eq(supportTickets.id, ticketId));

            return { success: true };
        } catch (error) {
            console.error("Failed to update ticket status:", error);
            return { success: false, error: "Failed to update status" };
        }
    }
);

export const getConversationsAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.TRAITEUR], schema: z.any().optional() },
    async () => {
        const { SupportQueries } = await import("@/services/queries/support.queries");
        return await SupportQueries.getConversations();
    }
);

export const getConversationMessagesAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.TRAITEUR], schema: z.string() },
    async (phone) => {
        const { SupportQueries } = await import("@/services/queries/support.queries");
        return await SupportQueries.getConversationMessages(phone);
    }
);

export const sendSupportMessageAction = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.TRAITEUR],
        schema: z.object({ phone: z.string(), message: z.string() })
    },
    async ({ phone, message }) => {
        try {
            const settings = await db.query.shopSettings.findFirst();
            if (!settings) return { success: false, error: "Configurations non trouvées" };

            const { sendWhatsAppMessage } = await import("@/lib/whatsapp");
            const res = await sendWhatsAppMessage(phone, message, {
                whatsappApiUrl: settings.whatsappApiUrl || undefined,
                whatsappApiKey: settings.whatsappApiKey || undefined,
                whatsappInstanceName: settings.whatsappInstanceName || undefined
            });

            if (res.success) {
                // Log the message in webhook_events so it appears in history
                // We use the real WhatsApp ID if available, otherwise fallback to admin_ prefix
                await db.insert(webhookEvents).values({
                    provider: 'whatsapp',
                    externalId: res.id || `admin_${Date.now()}_${phone}`,
                    customerPhone: phone,
                    payload: {
                        event: "message",
                        payload: { fromMe: true, body: message, type: "text", status: 'sent' }
                    } as any,
                    processedAt: new Date()
                });
                return { success: true };
            }
            return res;
        } catch (error) {
            console.error("Error sending support message:", error);
            return { success: false, error: "Échec de l'envoi du message" };
        }
    }
);

export const markConversationAsReadAction = withAuth(
    { roles: [UserRole.ADMIN, UserRole.TRAITEUR], schema: z.string() },
    async (phone) => {
        try {
            const settings = await db.query.shopSettings.findFirst();
            if (!settings) return { success: false };

            const { sendWhatsAppSeen } = await import("@/lib/whatsapp");
            await sendWhatsAppSeen(phone, {
                whatsappApiUrl: settings.whatsappApiUrl || undefined,
                whatsappApiKey: settings.whatsappApiKey || undefined,
                whatsappInstanceName: settings.whatsappInstanceName || undefined
            });

            // Update local lastSeenAt
            const { supportConversationMetadata } = await import("@/db/schema");
            const { db } = await import("@/db");
            const { eq } = await import("drizzle-orm");

            await db.insert(supportConversationMetadata)
                .values({ phone, lastSeenAt: new Date() })
                .onConflictDoUpdate({
                    target: supportConversationMetadata.phone,
                    set: { lastSeenAt: new Date() }
                });

            return { success: true };
        } catch (error) {
            console.error("Error marking as read:", error);
            return { success: false };
        }
    }
);
