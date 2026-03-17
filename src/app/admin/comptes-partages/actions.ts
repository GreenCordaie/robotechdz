"use server";

import { db } from "@/db";
import { digitalCodes, productVariants, products, digitalCodeSlots } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export async function getSharedAccountsInventory() {
    // We want variants where isSharing is true
    // And their digitalCodes (accounts) with their slots
    const results = await db.query.productVariants.findMany({
        where: eq(productVariants.isSharing, true),
        with: {
            product: true,
            digitalCodes: {
                where: eq(digitalCodes.status, "DISPONIBLE"),
                with: {
                    slots: true
                },
                orderBy: [desc(digitalCodes.createdAt)]
            }
        }
    });

    return results;
}
