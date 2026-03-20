import { db } from "@/db";
import { shopSettings, users, whatsappFaqs, auditLogs } from "@/db/schema";
import { eq, desc, sql, not } from "drizzle-orm";
import { cache } from "react";
import { UserRole } from "@/lib/constants";

export class SystemQueries {

    /**
     * Internal helper to get or initialize settings.
     */
    static getSettings = cache(async () => {
        const settings = await db.query.shopSettings.findFirst();
        if (!settings) {
            const [newSettings] = await db.insert(shopSettings).values({
                shopName: "FLEXBOX DIRECT",
            }).returning();
            return newSettings;
        }
        return settings;
    });

    /**
     * Gets public-facing shop settings.
     */
    static getPublicSettings = cache(async () => {
        const settings = await this.getSettings();
        return {
            isB2bEnabled: !!settings?.isB2bEnabled,
            isMaintenanceMode: !!settings?.isMaintenanceMode,
            shopName: settings?.shopName || "FLEXBOX DIRECT"
        };
    });

    /**
     * Gets all administrative users (excluding resellers).
     */
    static getUsers = cache(async () => {
        return await db.query.users.findMany({
            where: sql`${users.role} != ${UserRole.RESELLER}`,
            orderBy: [desc(users.id)]
        });
    });

    /**
     * Gets all WhatsApp FAQs.
     */
    static getWhatsAppFaqs = cache(async () => {
        return await db.query.whatsappFaqs.findMany({
            orderBy: [desc(whatsappFaqs.id)]
        });
    });

    /**
     * Gets recent audit logs with user info.
     */
    static getAuditLogs = cache(async (limit = 100) => {
        return await db.query.auditLogs.findMany({
            orderBy: [desc(auditLogs.createdAt)],
            limit,
            with: { user: true }
        });
    });
}
