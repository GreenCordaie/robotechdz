
import { db } from "@/db";
import { supportTickets, webhookEvents, clients, orders, whatsappLidMapping } from "@/db/schema";
import { desc, eq, and, sql, or, inArray } from "drizzle-orm";
import { cache } from "react";

export class SupportQueries {
    /**
     * Gets all unique phone numbers that have sent messages or have tickets.
     * Returns a summarized list for the sidebar.
     *
     * Batched: round-trip count is constant regardless of N phones.
     *   1. union of distinct phones from tickets + webhooks (2 SELECTs)
     *   2. conversation metadata (1 SELECT)
     *   3. whatsappLidMapping batch by lid IN (...)
     *   4. clients batch by RIGHT(telephone, 9) IN (...)
     *   5. latest order per phone (DISTINCT ON) over the phone last-9 set
     *   6. latest order per clientId (DISTINCT ON) over the resolved client id set
     *   7. latest support ticket per customer_phone (DISTINCT ON)
     *   8. latest webhook event per customer_phone (DISTINCT ON)
     *   9. unread count per phone (GROUP BY) joined with a (phone, last_seen) VALUES list
     *  10. optional scavenge fallback for phones containing '@' with no order, still per-phone
     *      (rare path; preserves the original Commande#XXX matcher semantics).
     */
    static getConversations = cache(async () => {
        // Get unique phones from tickets AND webhooks
        const ticketPhones = await db.selectDistinct({ phone: supportTickets.customerPhone }).from(supportTickets);
        const webhookPhones = await db.selectDistinct({ phone: webhookEvents.customerPhone }).from(webhookEvents);

        const allPhones = Array.from(new Set([
            ...ticketPhones.map(t => t.phone),
            ...webhookPhones.map(w => w.phone)
        ])).filter(Boolean) as string[];

        // Use a Map to group multiple identifiers (LID, JID, phone) by their canonical representation
        const mergedConversations = new Map<string, any>();

        if (allPhones.length === 0) {
            return [];
        }

        // 0. Fetch metadata (lastSeenAt)
        const allMetadata = await db.query.supportConversationMetadata.findMany();
        const lastSeenMap = new Map(allMetadata.map(m => [m.phone, m.lastSeenAt]));

        // 1. BATCH: whatsappLidMapping by lid IN (allPhones)
        const mappings = await db.query.whatsappLidMapping.findMany({
            where: inArray(whatsappLidMapping.lid, allPhones)
        });
        const mappingByLid = new Map(mappings.map(m => [m.lid, m]));

        // Pre-compute the last-9-digit key per raw phone (used by clients and orders matching).
        const lastNineByPhone = new Map<string, string>();
        const last9Set = new Set<string>();
        for (const p of allPhones) {
            const last9 = (p || "").replace(/\D/g, '').slice(-9);
            lastNineByPhone.set(p, last9);
            if (last9.length >= 8) last9Set.add(last9);
        }
        const last9List = Array.from(last9Set);

        // 2. BATCH: clients whose telephone ends with one of the last-9 keys.
        const clientsByLast9 = new Map<string, typeof clients.$inferSelect>();
        if (last9List.length > 0) {
            const clientRows = await db.execute<typeof clients.$inferSelect & { match_last9: string }>(sql`
                SELECT c.*, RIGHT(REGEXP_REPLACE(c.telephone, '[^0-9]', '', 'g'), 9) AS match_last9
                FROM ${clients} c
                WHERE RIGHT(REGEXP_REPLACE(c.telephone, '[^0-9]', '', 'g'), 9) IN (${sql.join(last9List.map(v => sql`${v}`), sql`, `)})
            `);
            for (const row of clientRows as any[]) {
                // First-seen wins (mirrors findFirst non-deterministic pick, but deterministic across runs is fine).
                if (!clientsByLast9.has(row.match_last9)) {
                    clientsByLast9.set(row.match_last9, row as any);
                }
            }
        }

        // 3. BATCH: latest order per phone last-9 (DISTINCT ON).
        const ordersByPhoneLast9 = new Map<string, any>();
        if (last9List.length > 0) {
            const orderRows = await db.execute<any>(sql`
                SELECT DISTINCT ON (phone_last9) *
                FROM (
                    SELECT
                        o.*,
                        RIGHT(REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g'), 9) AS phone_last9,
                        c.id AS client_id_join,
                        c.nom_complet AS client_nom_complet,
                        c.telephone AS client_telephone
                    FROM ${orders} o
                    LEFT JOIN ${clients} c ON c.id = o.client_id
                    WHERE RIGHT(REGEXP_REPLACE(o.customer_phone, '[^0-9]', '', 'g'), 9) IN (${sql.join(last9List.map(v => sql`${v}`), sql`, `)})
                ) sub
                ORDER BY phone_last9, created_at DESC
            `);
            for (const row of orderRows as any[]) {
                ordersByPhoneLast9.set(row.phone_last9, row);
            }
        }

        // 4. BATCH: latest order per clientId (DISTINCT ON), for clients found via last-9 matching.
        const ordersByClientId = new Map<number, any>();
        const clientIds = Array.from(new Set(Array.from(clientsByLast9.values()).map(c => c.id).filter(Boolean))) as number[];
        if (clientIds.length > 0) {
            const orderRows = await db.execute<any>(sql`
                SELECT DISTINCT ON (o.client_id)
                    o.*,
                    c.id AS client_id_join,
                    c.nom_complet AS client_nom_complet,
                    c.telephone AS client_telephone
                FROM ${orders} o
                LEFT JOIN ${clients} c ON c.id = o.client_id
                WHERE o.client_id IN (${sql.join(clientIds.map(v => sql`${v}`), sql`, `)})
                ORDER BY o.client_id, o.created_at DESC
            `);
            for (const row of orderRows as any[]) {
                ordersByClientId.set(row.client_id, row);
            }
        }

        // 5. BATCH: latest support ticket per customer_phone (DISTINCT ON).
        const lastTicketByPhone = new Map<string, typeof supportTickets.$inferSelect>();
        const ticketRows = await db.execute<typeof supportTickets.$inferSelect>(sql`
            SELECT DISTINCT ON (customer_phone) *
            FROM ${supportTickets}
            WHERE customer_phone IN (${sql.join(allPhones.map(v => sql`${v}`), sql`, `)})
            ORDER BY customer_phone, created_at DESC
        `);
        for (const row of ticketRows as any[]) {
            lastTicketByPhone.set(row.customer_phone, row as any);
        }

        // 6. BATCH: latest webhook event per customer_phone (DISTINCT ON).
        const lastWebhookByPhone = new Map<string, typeof webhookEvents.$inferSelect>();
        const webhookRows = await db.execute<typeof webhookEvents.$inferSelect>(sql`
            SELECT DISTINCT ON (customer_phone) *
            FROM ${webhookEvents}
            WHERE customer_phone IN (${sql.join(allPhones.map(v => sql`${v}`), sql`, `)})
            ORDER BY customer_phone, processed_at DESC
        `);
        for (const row of webhookRows as any[]) {
            lastWebhookByPhone.set(row.customer_phone, row as any);
        }

        // Helper: resolve the lastSeen used by the unread-count query for a given raw phone.
        // Mirrors the original priority: lastSeenMap[displayPhone] || lastSeenMap[canonicalKey] || epoch.
        const resolveDisplayPhone = (rawPhone: string): { displayPhone: string; lastSeen: Date } => {
            const mapping = mappingByLid.get(rawPhone);
            const mappedPhone = mapping?.phone;
            const last9 = lastNineByPhone.get(rawPhone) || "";
            const order = (last9 && ordersByPhoneLast9.get(last9))
                || (clientsByLast9.get(last9) && ordersByClientId.get(clientsByLast9.get(last9)!.id))
                || null;
            const displayPhone = mappedPhone || order?.customer_phone || rawPhone;
            const canonicalKey = displayPhone.replace(/\D/g, '').slice(-9) || displayPhone;
            const lastSeen = lastSeenMap.get(displayPhone) || lastSeenMap.get(canonicalKey) || new Date(0);
            return { displayPhone, lastSeen };
        };

        // 7. BATCH: unread counts per phone, with per-phone lastSeen via a VALUES list.
        // SELECT customer_phone, COUNT(*) FROM webhook_events JOIN (VALUES (phone, last_seen), ...) v
        //   ON w.customer_phone = v.phone AND ... AND w.processed_at > v.last_seen
        const unreadByPhone = new Map<string, number>();
        const valuesTuples = allPhones.map(p => {
            const { lastSeen } = resolveDisplayPhone(p);
            return sql`(${p}, ${lastSeen.toISOString()}::timestamp)`;
        });
        const unreadRows = await db.execute<{ customer_phone: string; count: string }>(sql`
            SELECT w.customer_phone, COUNT(*)::text AS count
            FROM ${webhookEvents} w
            JOIN (VALUES ${sql.join(valuesTuples, sql`, `)}) AS v(phone, last_seen)
              ON w.customer_phone = v.phone
            WHERE (w.payload->'payload'->>'fromMe')::boolean = false
              AND w.processed_at > v.last_seen
            GROUP BY w.customer_phone
        `);
        for (const row of unreadRows as any[]) {
            unreadByPhone.set(row.customer_phone, Number(row.count || 0));
        }

        // 8. SCAVENGE FALLBACK (rare path). Only triggered for '@' phones with no batched order match.
        // Preserve original behavior. Pre-fetch the recent webhooks per such phone in one batch.
        const scavengeCandidates: string[] = [];
        for (const rawPhone of allPhones) {
            const phone = rawPhone || "unknown";
            if (!phone.includes('@')) continue;
            const last9 = lastNineByPhone.get(rawPhone) || "";
            const haveOrder = (last9 && ordersByPhoneLast9.has(last9))
                || (clientsByLast9.get(last9) && ordersByClientId.has(clientsByLast9.get(last9)!.id));
            if (!haveOrder) scavengeCandidates.push(phone);
        }
        const scavengedOrderByPhone = new Map<string, any>();
        if (scavengeCandidates.length > 0) {
            // Single fetch: last 15 webhooks per scavenge candidate (DISTINCT ON not enough — need top-15).
            const allRecent = await db.execute<any>(sql`
                SELECT customer_phone, payload, processed_at,
                       ROW_NUMBER() OVER (PARTITION BY customer_phone ORDER BY processed_at DESC) AS rn
                FROM ${webhookEvents}
                WHERE customer_phone IN (${sql.join(scavengeCandidates.map(v => sql`${v}`), sql`, `)})
            `);
            const candidateNumbersByPhone = new Map<string, string[]>();
            for (const row of allRecent as any[]) {
                if (Number(row.rn) > 15) continue;
                const body = (row.payload as any)?.payload?.body || "";
                const match = body.match(/Commande(?:\s*:\s*)?#([A-Z0-9]+)/);
                if (match?.[1]) {
                    const arr = candidateNumbersByPhone.get(row.customer_phone) || [];
                    arr.push(match[1]);
                    candidateNumbersByPhone.set(row.customer_phone, arr);
                }
            }
            const allOrderNumbers = Array.from(new Set(Array.from(candidateNumbersByPhone.values()).flat()));
            if (allOrderNumbers.length > 0) {
                const scavRows = await db.query.orders.findMany({
                    where: inArray(orders.orderNumber, allOrderNumbers),
                    with: { client: true }
                });
                const scavByNumber = new Map(scavRows.map(o => [o.orderNumber, o]));
                for (const [phone, numbers] of Array.from(candidateNumbersByPhone.entries())) {
                    for (const num of numbers) {
                        const ord = scavByNumber.get(num);
                        if (ord) {
                            scavengedOrderByPhone.set(phone, ord);
                            break;
                        }
                    }
                }
            }
        }

        // 9. Assemble in JS — preserves original merging semantics.
        for (const rawPhone of allPhones) {
            const phone = rawPhone || "unknown";

            const mapping = mappingByLid.get(phone);
            const mappedName = mapping?.clientName;
            const mappedPhone = mapping?.phone;

            const rawLastNine = lastNineByPhone.get(rawPhone) || "";
            const client = (rawLastNine.length >= 8) ? (clientsByLast9.get(rawLastNine) || null) : null;

            // Latest order: prefer phone-last9 match, fall back to client-id match (mirrors original `or()`).
            let foundOrder: any = (rawLastNine.length >= 8 && ordersByPhoneLast9.get(rawLastNine))
                || (client?.id ? ordersByClientId.get(client.id) : null)
                || null;

            // Hydrate the .client relation shape from joined columns (original used `with: { client: true }`).
            if (foundOrder && foundOrder.client_id_join != null && !foundOrder.client) {
                foundOrder = {
                    ...foundOrder,
                    customerPhone: foundOrder.customer_phone ?? foundOrder.customerPhone,
                    client: {
                        id: foundOrder.client_id_join,
                        nomComplet: foundOrder.client_nom_complet,
                        telephone: foundOrder.client_telephone,
                    }
                };
            } else if (foundOrder && !foundOrder.customerPhone && foundOrder.customer_phone != null) {
                foundOrder = { ...foundOrder, customerPhone: foundOrder.customer_phone };
            }

            // SCAVENGE FALLBACK
            if (!foundOrder && phone.includes('@')) {
                const scav = scavengedOrderByPhone.get(phone);
                if (scav) foundOrder = scav;
            }

            // Identification priority: Mapped Name > Order Client Name > Clients Table > Raw Identifier
            const finalName = mappedName || foundOrder?.client?.nomComplet || client?.nomComplet || null;
            // Phone priority: Mapped Phone > Order Phone > Raw phone
            const displayPhone = mappedPhone || foundOrder?.customerPhone || phone;

            // Canonical key for grouping (avoid duplicates in sidebar)
            const canonicalKey = displayPhone.replace(/\D/g, '').slice(-9) || displayPhone;

            const lastTicket = lastTicketByPhone.get(phone) || null;
            const lastWebhookRow = lastWebhookByPhone.get(phone) || null;

            const lastMessageAt = lastTicket && lastWebhookRow
                ? ((lastTicket.createdAt as Date)! > (lastWebhookRow as any).processed_at ? lastTicket.createdAt : (lastWebhookRow as any).processed_at)
                : (lastTicket?.createdAt || (lastWebhookRow as any)?.processed_at || new Date());

            const lastMessageText = lastTicket && lastWebhookRow
                ? ((lastTicket.createdAt as Date)! > (lastWebhookRow as any).processed_at ? lastTicket.message : ((lastWebhookRow as any).payload as any)?.payload?.body)
                : (lastTicket?.message || ((lastWebhookRow as any)?.payload as any)?.payload?.body || "");

            const phoneUnreadCount = unreadByPhone.get(phone) || 0;

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
                if (lastMessageAt && existing.lastMessageAt && (lastMessageAt as Date).getTime() > (existing.lastMessageAt as Date).getTime()) {
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

        return Array.from(mergedConversations.values()).sort((a, b) => (b.lastMessageAt as Date).getTime() - (a.lastMessageAt as Date).getTime());
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
