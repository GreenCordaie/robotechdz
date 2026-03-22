import "server-only";
import { db } from "@/db";
import { supportTickets } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { cache } from "react";
import { decrypt } from "@/lib/encryption";

export class SupportQueries {

    /**
     * Gets support tickets with optional status filter.
     * Enriches order data and decrypts credentials if present.
     */
    static getTickets = cache(async (status: "OUVERT" | "RESOLU" = "OUVERT") => {
        const results: any = await db.query.supportTickets.findMany({
            where: eq(supportTickets.status, status),
            with: {
                order: {
                    with: {
                        client: true,
                        items: {
                            with: {
                                codes: true,
                                slots: { with: { digitalCode: true } }
                            }
                        }
                    }
                }
            },
            orderBy: [desc(supportTickets.createdAt)],
        });

        return results.map((ticket: any) => {
            if (!ticket.order) return ticket;

            const enrichedItems = ticket.order.items.map((item: any) => ({
                ...item,
                fullCodes: (item.codes || []).map((c: any) => ({
                    id: c.id,
                    code: decrypt(c.code) || c.code
                })),
                fullSlots: (item.slots || []).map((s: any) => ({
                    id: s.id,
                    code: s.code ? (decrypt(s.code) || s.code) : null,
                    slotNumber: s.slotNumber,
                    profileName: s.profileName,
                    parentCode: s.digitalCode?.code ? (decrypt(s.digitalCode.code) || s.digitalCode.code) : null
                }))
            }));

            return {
                ...ticket,
                order: {
                    ...ticket.order,
                    customerPhone: ticket.order.customerPhone || ticket.order.client?.telephone,
                    items: enrichedItems
                }
            };
        });
    });

    /**
     * Gets the count of open support tickets.
     */
    static getOpenCount = cache(async () => {
        const result = await db.select({ count: count() })
            .from(supportTickets)
            .where(eq(supportTickets.status, "OUVERT"));

        return { open: result[0]?.count || 0 };
    });
}
