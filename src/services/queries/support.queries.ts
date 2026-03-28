
import { db } from "@/db";
import { supportTickets, webhookEvents, clients, orders, whatsappLidMapping } from "@/db/schema";
import { desc, eq, and, sql, or } from "drizzle-orm";
import { cache } from "react";

export class SupportQueries {
    /**
     * Gets all unique phone numbers that have sent messages or have tickets.
     * Returns a summarized list for the sidebar.
     */
    static getConversations = cache(async () => {
        // Get unique phones from tickets AND webhooks
        const ticketPhones = await db.select({ phone: supportTickets.customerPhone }).from(supportTickets);
        const webhookPhones = await db.select({ phone: webhookEvents.customerPhone }).from(webhookEvents);

        const allPhones = Array.from(new Set([
            ...ticketPhones.map(t => t.phone),
            ...webhookPhones.map(w => w.phone)
        ])).filter(Boolean) as string[];

        // Use a Map to group multiple identifiers (LID, JID, phone) by their canonical representation
        const mergedConversations = new Map<string, any>();

        // 0. Fetch metadata (lastSeenAt)
        const allMetadata = await db.query.supportConversationMetadata.findMany();
        const lastSeenMap = new Map(allMetadata.map(m => [m.phone, m.lastSeenAt]));

        for (const rawPhone of allPhones) {
            const phone = rawPhone || "unknown";

            // 1. Identification: Check if we already have a mapping
            const mapping = await db.query.whatsappLidMapping.findFirst({
                where: eq(whatsappLidMapping.lid, phone)
            });
            const mappedName = mapping?.clientName;
            const mappedPhone = mapping?.phone;

            // 2. Identify by Order or Client table
            const rawLastNine = phone.replace(/\D/g, '').slice(-9);
            const client = (rawLastNine.length >= 8) ? await db.query.clients.findFirst({
                where: sql`telephone LIKE ${'%' + rawLastNine}`
            }) : null;

            let foundOrder = await db.query.orders.findFirst({
                where: or(
                    (rawLastNine.length >= 8) ? sql`RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 9) = ${rawLastNine}` : undefined,
                    client?.id ? eq(orders.clientId, client.id) : undefined
                ),
                orderBy: [desc(orders.createdAt)],
                with: { client: true }
            });

            // 3. SCAVENGE FALLBACK
            if (!foundOrder && phone.includes('@')) {
                const recentMsgs = await db.query.webhookEvents.findMany({
                    where: eq(webhookEvents.customerPhone, phone),
                    orderBy: [desc(webhookEvents.processedAt)],
                    limit: 15
                });

                for (const msg of recentMsgs) {
                    const body = (msg.payload as any)?.payload?.body || "";
                    const match = body.match(/Commande(?:\s*:\s*)?#([A-Z0-9]+)/);
                    if (match?.[1]) {
                        const scavengedOrder = await db.query.orders.findFirst({
                            where: eq(orders.orderNumber, match[1]),
                            with: { client: true }
                        });
                        if (scavengedOrder) {
                            foundOrder = scavengedOrder;
                            break;
                        }
                    }
                }
            }

            // Identification priority: Mapped Name > Order Client Name > Clients Table > Raw Identifier
            const finalName = mappedName || foundOrder?.client?.nomComplet || client?.nomComplet || null;
            // Phone priority: Mapped Phone > Order Phone > Raw phone
            const displayPhone = mappedPhone || foundOrder?.customerPhone || phone;

            // Canonical key for grouping (avoid duplicates in sidebar)
            const canonicalKey = displayPhone.replace(/\D/g, '').slice(-9) || displayPhone;

            // Get last message info for THIS specific identifier
            const supportWhere = eq(supportTickets.customerPhone, phone);
            const webhookWhere = eq(webhookEvents.customerPhone, phone);

            const lastTicket = await db.query.supportTickets.findFirst({
                where: supportWhere,
                orderBy: [desc(supportTickets.createdAt)]
            });

            const lastWebhook = await db.query.webhookEvents.findFirst({
                where: webhookWhere,
                orderBy: [desc(webhookEvents.processedAt)]
            });

            const lastMessageAt = lastTicket && lastWebhook
                ? (lastTicket.createdAt! > lastWebhook.processedAt ? lastTicket.createdAt : lastWebhook.processedAt)
                : (lastTicket?.createdAt || lastWebhook?.processedAt || new Date());

            const lastMessageText = lastTicket && lastWebhook
                ? (lastTicket.createdAt! > lastWebhook.processedAt ? lastTicket.message : (lastWebhook.payload as any)?.payload?.body)
                : (lastTicket?.message || (lastWebhook?.payload as any)?.payload?.body || "");

            // Calculate unread count for THIS identifier
            const lastSeen = lastSeenMap.get(displayPhone) || lastSeenMap.get(canonicalKey) || new Date(0);

            // Count webhook messages from client after lastSeen
            const unreadRes = await db.execute(sql`
                SELECT COUNT(*) as count 
                FROM ${webhookEvents} 
                WHERE customer_phone = ${phone} 
                AND (payload->'payload'->>'fromMe')::boolean = false 
                AND processed_at > ${lastSeen.toISOString()}
            `);
            const phoneUnreadCount = Number((unreadRes[0] as any)?.count || 0);

            const conversationData = {
                phone: displayPhone,
                clientName: finalName,
                lastMessageAt,
                lastMessageText,
                status: lastTicket?.status || 'OUVERT',
                unreadCount: phoneUnreadCount
            };

            // Merge logic
            if (!mergedConversations.has(canonicalKey)) {
                mergedConversations.set(canonicalKey, conversationData);
            } else {
                const existing = mergedConversations.get(canonicalKey);
                // Keep the latest message info
                if (lastMessageAt && existing.lastMessageAt && lastMessageAt.getTime() > existing.lastMessageAt.getTime()) {
                    existing.lastMessageAt = lastMessageAt;
                    existing.lastMessageText = lastMessageText;
                }
                // Accumulate unread counts
                existing.unreadCount += phoneUnreadCount;
                // If any linked identifier has an "OUVERT" status, keep it open
                if (conversationData.status === 'OUVERT') {
                    existing.status = 'OUVERT';
                }
                // Prefer the display phone with digits if possible
                if (!existing.phone.match(/\d/) && displayPhone.match(/\d/)) {
                    existing.phone = displayPhone;
                }
                // Prefer name if discovered in this pass
                if (!existing.clientName && finalName) {
                    existing.clientName = finalName;
                }
            }
        }

        return Array.from(mergedConversations.values()).sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
    });

    /**
     * Gets full message history for a specific phone number.
     */
    static getConversationMessages = cache(async (phone: string) => {
        // Resolve JID via mapping table
        const mapping = await db.query.whatsappLidMapping.findFirst({
            where: eq(whatsappLidMapping.lid, phone)
        });

        const realPhone = mapping?.phone || phone;
        const rawLastNine = realPhone.replace(/\D/g, '').slice(-9);

        // Find all related LIDs for this phone
        const relatedLIDs = await db.select({ lid: whatsappLidMapping.lid })
            .from(whatsappLidMapping)
            .where(eq(whatsappLidMapping.phone, realPhone))
            .then(rows => rows.map(r => r.lid));

        const matchConditions = [
            sql`RIGHT(REGEXP_REPLACE(customer_phone, '[^0-9]', '', 'g'), 9) = ${rawLastNine}`,
            ...relatedLIDs.map(lid => eq(supportTickets.customerPhone, lid)),
            eq(supportTickets.customerPhone, phone),
            eq(supportTickets.customerPhone, realPhone)
        ];

        const ticketHistory = await db.query.supportTickets.findMany({
            where: or(...matchConditions),
            orderBy: (t, { asc }) => [asc(t.createdAt)]
        });

        const webhookHistory = await db.query.webhookEvents.findMany({
            where: or(...matchConditions),
            orderBy: (w, { asc }) => [asc(w.processedAt)]
        });

        const allMessages = [
            ...ticketHistory.map(t => ({
                id: t.id.toString(),
                text: t.message,
                fromMe: false,
                timestamp: t.createdAt!,
                type: 'TICKET' as const
            })),
            ...webhookHistory.map(w => {
                const payload = w.payload as any;
                return {
                    id: w.externalId,
                    text: payload?.payload?.body || "",
                    fromMe: payload?.payload?.fromMe === true || payload?.payload?.fromMe === 'true',
                    timestamp: w.processedAt,
                    type: 'WHATSAPP' as const,
                    status: payload?.payload?.status || 'sent'
                };
            })
        ];

        return allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    /**
     * Gets tickets filtered by status.
     */
    static getTickets = cache(async (status: "OUVERT" | "RESOLU" = "OUVERT") => {
        return await db.query.supportTickets.findMany({
            where: eq(supportTickets.status, status),
            orderBy: [desc(supportTickets.createdAt)]
        });
    });

    /**
     * Gets unread count.
     */
    static getOpenCount = cache(async () => {
        const res = await db.execute(sql`SELECT COUNT(*) as count FROM ${supportTickets} WHERE ${supportTickets.status} = 'OUVERT'`);
        return { open: Number(res[0]?.count || 0) };
    });
}
