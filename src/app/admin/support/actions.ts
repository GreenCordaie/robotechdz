"use server";

import { db } from "@/db";
import { supportTickets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withAuth } from "@/lib/security";
import { z } from "zod";
import { SupportQueries } from "@/services/queries/support.queries";
import { UserRole } from "@/lib/constants";

export const getSupportTickets = withAuth(
    {
        roles: [UserRole.ADMIN, UserRole.TRAITEUR],
        schema: z.string().optional().transform(val => (val || "OUVERT") as "OUVERT" | "RESOLU")
    },
    async (status) => {
        return await SupportQueries.getTickets(status);
    }
);

export const getSupportCounts = withAuth(
    { roles: [UserRole.ADMIN, UserRole.TRAITEUR] },
    async () => {
        return await SupportQueries.getOpenCount();
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

            revalidatePath("/admin/support");
            return { success: true };
        } catch (error) {
            console.error("Failed to update ticket status:", error);
            return { success: false, error: "Failed to update status" };
        }
    }
);
