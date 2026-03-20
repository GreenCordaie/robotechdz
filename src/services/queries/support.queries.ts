import { db } from "@/db";
import { supportTickets } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { cache } from "react";

export class SupportQueries {

    /**
     * Gets support tickets with optional status filter.
     * Enriches order data if present.
     */
    static getTickets = cache(async (status: "OUVERT" | "RESOLU" = "OUVERT") => {
        const results: any = await db.query.supportTickets.findMany({
            where: eq(supportTickets.status, status),
            with: {
                order: {
                    with: {
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
                fullCodes: (item.codes || []).map((c: any) => ({ id: c.id, code: c.code })),
                fullSlots: (item.slots || []).map((s: any) => ({
                    id: s.id,
                    code: s.code,
                    slotNumber: s.slotNumber,
                    profileName: s.profileName,
                    parentCode: s.digitalCode.code
                }))
            }));

            return {
                ...ticket,
                order: {
                    ...ticket.order,
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
