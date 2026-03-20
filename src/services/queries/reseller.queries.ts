import { db } from "@/db";
import { resellers } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { cache } from "react";

export class ResellerQueries {

    /**
     * Gets all resellers with their wallet balance.
     */
    static getAll = cache(async () => {
        return await db.query.resellers.findMany({
            orderBy: [desc(resellers.createdAt)],
            with: { wallet: true }
        });
    });

    /**
     * Gets a specific reseller by ID.
     */
    static getById = cache(async (id: number) => {
        return await db.query.resellers.findFirst({
            where: eq(resellers.id, id),
            with: { wallet: true }
        });
    });
}
