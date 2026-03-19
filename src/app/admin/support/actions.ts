"use server";

import { db } from "@/db";
import { supportTickets, orders } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getSupportTickets(status: "OUVERT" | "RESOLU" = "OUVERT") {
    try {
        const results: any = await db.query.supportTickets.findMany({
            where: eq(supportTickets.status, status),
            with: {
                order: {
                    with: {
                        items: {
                            with: {
                                codes: true,
                                slots: {
                                    with: {
                                        digitalCode: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: [desc(supportTickets.createdAt)],
        });

        // Map order items to include fullCode/fullSlot info (same as Caisse actions)
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
    } catch (error) {
        console.error("Failed to fetch support tickets:", error);
        return [];
    }
}

export async function getSupportCounts() {
    try {
        const openTickets = await db.query.supportTickets.findMany({
            where: eq(supportTickets.status, "OUVERT")
        });
        return { open: openTickets.length };
    } catch (error) {
        return { open: 0 };
    }
}

export async function updateTicketStatus(ticketId: number, status: "OUVERT" | "RESOLU") {
    try {
        await db.update(supportTickets)
            .set({ status, updatedAt: new Date() })
            .where(eq(supportTickets.id, ticketId));

        revalidatePath("/admin/support");
        return { success: true };
    } catch (error) {
        console.error("Failed to update ticket status:", error);
        return { success: false, error: "Failed to update status" };
    }
}
