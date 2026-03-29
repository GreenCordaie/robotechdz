import { db } from "@/db";
import { digitalCodes, digitalCodeSlots, productVariants, clients } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";
import { orders } from "@/db/schema";
import { like } from "drizzle-orm";

async function generateUniquePin(tx: any): Promise<string> {
    for (let i = 0; i < 10; i++) {
        const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const existing = await tx.query.digitalCodeSlots.findFirst({
            where: eq(digitalCodeSlots.code, encrypt(pin))
        });
        if (!existing) return pin;
    }
    throw new Error('Impossible de générer un PIN unique après 10 tentatives');
}

export class AccountService {
    /**
     * Internal implementation to add a shared account with slots.
     * No auth check here, assuming it's done at a higher level (Action or API secret).
     */
    static async findActiveSlotByPhone(phone: string) {
        const phoneDigits = phone.replace(/\D/g, '').slice(-9);

        // Also lookup client by telephone to find orders via clientId
        const client = await db.query.clients.findFirst({
            where: like(clients.telephone, `%${phoneDigits}%`)
        });

        const recentOrders = await db.query.orders.findMany({
            where: client
                ? or(like(orders.customerPhone, `%${phoneDigits}%`), eq(orders.clientId, client.id))
                : like(orders.customerPhone, `%${phoneDigits}%`),
            with: {
                items: {
                    with: {
                        slots: {
                            with: {
                                digitalCode: {
                                    with: {
                                        variant: {
                                            with: { product: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: (o, { desc }) => [desc(o.createdAt)],
            limit: 10
        });

        for (const order of recentOrders) {
            for (const item of order.items || []) {
                for (const slot of item.slots || []) {
                    if (slot.status === 'VENDU') {
                        const productName = slot.digitalCode?.variant?.product?.name?.toLowerCase() || '';
                        if (productName.includes('netflix')) {
                            return { slot, account: slot.digitalCode };
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Internal implementation to add a shared account with slots.
     * No auth check here, assuming it's done at a higher level (Action or API secret).
     */
    static async addSharedAccountInternal(data: {
        variantId: number;
        email: string;
        password: string;
        outlookPassword?: string;
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
                outlookPassword: data.outlookPassword ? encrypt(data.outlookPassword) : null,
                status: "DISPONIBLE",
                purchasePrice: data.purchasePrice || null,
                purchaseCurrency: data.purchaseCurrency || "DZD",
                isDebitCompleted: false,
                expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
            }).returning();

            const generatedPins: { slotIndex: number; pin: string }[] = [];
            const slots = [];

            for (let i = 0; i < totalSlots; i++) {
                let pin = data.slotsConfig?.[i]?.pinCode;
                if (!pin) {
                    pin = await generateUniquePin(tx);
                    generatedPins.push({ slotIndex: i, pin });
                }

                slots.push({
                    digitalCodeId: dc.id,
                    slotNumber: i + 1,
                    profileName: data.slotsConfig?.[i]?.profileName || `Profil ${i + 1}`,
                    code: encrypt(pin),
                    status: "DISPONIBLE" as const,
                    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
                });
            }

            await tx.insert(digitalCodeSlots).values(slots);
            return { accountId: dc.id, slotsCount: totalSlots, generatedPins };
        });
    }
}
