import { db } from "@/db";
import { digitalCodes, digitalCodeSlots, productVariants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";

export class AccountService {
    /**
     * Internal implementation to add a shared account with slots.
     * No auth check here, assuming it's done at a higher level (Action or API secret).
     */
    static async addSharedAccountInternal(data: {
        variantId: number;
        email: string;
        password: string;
        purchasePrice?: string;
        purchaseCurrency?: string;
        expiresAt?: string;
        slotsCount?: number;
        slotsConfig?: { profileName?: string; pinCode?: string }[];
    }) {
        const variant = await db.query.productVariants.findFirst({
            where: eq(productVariants.id, data.variantId),
        });

        if (!variant) throw new Error("Variante non trouvée");

        const fullCode = `${data.email} | ${data.password}`;
        const totalSlots = data.slotsCount || variant.totalSlots || 1;

        return await db.transaction(async (tx) => {
            const [dc] = await tx.insert(digitalCodes).values({
                variantId: data.variantId,
                code: encrypt(fullCode),
                status: "DISPONIBLE",
                purchasePrice: data.purchasePrice || null,
                purchaseCurrency: data.purchaseCurrency || "DZD",
                isDebitCompleted: false,
                expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
            }).returning();

            const slots = Array.from({ length: totalSlots }).map((_, i) => ({
                digitalCodeId: dc.id,
                slotNumber: i + 1,
                profileName: data.slotsConfig?.[i]?.profileName || `Profil ${i + 1}`,
                code: data.slotsConfig?.[i]?.pinCode ? encrypt(data.slotsConfig[i].pinCode!) : null,
                status: "DISPONIBLE" as const,
                expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
            }));

            await tx.insert(digitalCodeSlots).values(slots);
            return { accountId: dc.id, slotsCount: totalSlots };
        });
    }
}
