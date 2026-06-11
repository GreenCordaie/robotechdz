"use server";

import { db } from "@/db";
import { g2bulkPricingRules, shopSettings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAuth, logSecurityAction } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { g2bulkPricingService } from "@/services/g2bulk-pricing.service";
import { TierService } from "@/services/tier.service";

// ---------------------------------------------------------------------------
// Validation schemas (mirror BSV)
// ---------------------------------------------------------------------------

const scopeTypeEnum = z.enum(["global", "category", "brand", "sku"]);
const markupTypeEnum = z.enum(["pct", "fixed_dzd"]);

const markupValueSchema = z.string().refine(
    (s) => Number.isFinite(Number(s)) && Number(s) >= 0,
    { message: "markupValue doit être un nombre positif" },
);

const ruleBaseSchema = z.object({
    scopeType: scopeTypeEnum,
    scopeValue: z.string().min(1).max(200),
    markupType: markupTypeEnum,
    markupValue: markupValueSchema,
    notes: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

export const getAllG2BulkPricingRulesAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const rows = await db
                .select()
                .from(g2bulkPricingRules)
                .orderBy(asc(g2bulkPricingRules.scopeType), asc(g2bulkPricingRules.scopeValue));
            return { success: true as const, data: rows };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

export const getG2BulkUsdRateAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const settings = await db
                .select({ rate: shopSettings.usdExchangeRate })
                .from(shopSettings)
                .limit(1);
            const rate = settings[0]?.rate != null ? Number(settings[0].rate) : 270;
            return { success: true as const, data: { rate } };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

export const createG2BulkPricingRuleAction = withAuth(
    { roles: [UserRole.ADMIN], schema: ruleBaseSchema },
    async (input, user) => {
        try {
            const scopeValue = input.scopeType === "global" ? "*" : input.scopeValue.trim();

            const [row] = await db
                .insert(g2bulkPricingRules)
                .values({
                    scopeType: input.scopeType,
                    scopeValue,
                    markupType: input.markupType,
                    markupValue: input.markupValue,
                    notes: input.notes ?? null,
                    isActive: input.isActive ?? true,
                })
                .returning();

            g2bulkPricingService.invalidateCache();
            await logSecurityAction({
                userId: user.id,
                action: "G2BULK_PRICING_RULE_CREATE",
                entityType: "g2bulk_pricing_rule",
                entityId: String(row.id),
                newData: row,
            });
            revalidatePath("/admin/g2bulk-pricing");
            return { success: true as const, data: row };
        } catch (error: unknown) {
            const msg = String((error as Error)?.message ?? error);
            if (msg.includes("g2bulk_pricing_rules_scope_unique")) {
                return { success: false as const, error: "Une règle active existe déjà pour ce scope. Désactivez ou éditez-la." };
            }
            return { success: false as const, error: msg };
        }
    },
);

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export const updateG2BulkPricingRuleAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: ruleBaseSchema.extend({ id: z.number().int().positive() }),
    },
    async (input, user) => {
        try {
            const scopeValue = input.scopeType === "global" ? "*" : input.scopeValue.trim();
            const old = await db.query.g2bulkPricingRules.findFirst({ where: eq(g2bulkPricingRules.id, input.id) });
            if (!old) return { success: false as const, error: "Règle introuvable" };

            const [row] = await db
                .update(g2bulkPricingRules)
                .set({
                    scopeType: input.scopeType,
                    scopeValue,
                    markupType: input.markupType,
                    markupValue: input.markupValue,
                    notes: input.notes ?? null,
                    isActive: input.isActive ?? true,
                    updatedAt: new Date(),
                })
                .where(eq(g2bulkPricingRules.id, input.id))
                .returning();

            g2bulkPricingService.invalidateCache();
            await logSecurityAction({
                userId: user.id,
                action: "G2BULK_PRICING_RULE_UPDATE",
                entityType: "g2bulk_pricing_rule",
                entityId: String(input.id),
                oldData: old,
                newData: row,
            });
            revalidatePath("/admin/g2bulk-pricing");
            return { success: true as const, data: row };
        } catch (error: unknown) {
            const msg = String((error as Error)?.message ?? error);
            if (msg.includes("g2bulk_pricing_rules_scope_unique")) {
                return { success: false as const, error: "Une règle active existe déjà pour ce scope." };
            }
            return { success: false as const, error: msg };
        }
    },
);

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export const deleteG2BulkPricingRuleAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        try {
            const old = await db.query.g2bulkPricingRules.findFirst({ where: eq(g2bulkPricingRules.id, id) });
            if (!old) return { success: false as const, error: "Règle introuvable" };
            if (old.scopeType === "global") {
                return { success: false as const, error: "Impossible de supprimer la règle globale. Désactivez-la ou changez sa valeur." };
            }

            await db.delete(g2bulkPricingRules).where(eq(g2bulkPricingRules.id, id));
            g2bulkPricingService.invalidateCache();
            await logSecurityAction({
                userId: user.id,
                action: "G2BULK_PRICING_RULE_DELETE",
                entityType: "g2bulk_pricing_rule",
                entityId: String(id),
                oldData: old,
            });
            revalidatePath("/admin/g2bulk-pricing");
            return { success: true as const };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ---------------------------------------------------------------------------
// USD RATE
// (Shared shop_settings — same row as BSV. Updating here updates BSV too.)
// ---------------------------------------------------------------------------

export const setG2BulkUsdRateAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            rate: z.string().refine(
                (s) => Number.isFinite(Number(s)) && Number(s) > 0 && Number(s) < 100000,
                { message: "Taux invalide (doit être > 0 et < 100000)" },
            ),
        }),
    },
    async ({ rate }, user) => {
        try {
            const existing = await db.select({ id: shopSettings.id, old: shopSettings.usdExchangeRate }).from(shopSettings).limit(1);
            if (existing.length === 0) {
                await db.insert(shopSettings).values({ usdExchangeRate: rate });
            } else {
                await db
                    .update(shopSettings)
                    .set({ usdExchangeRate: rate })
                    .where(eq(shopSettings.id, existing[0].id));
            }
            g2bulkPricingService.invalidateCache();
            await logSecurityAction({
                userId: user.id,
                action: "G2BULK_USD_RATE_UPDATE",
                entityType: "shop_settings",
                entityId: existing[0]?.id ? String(existing[0].id) : (null as never),
                oldData: existing[0]?.old != null ? { rate: existing[0].old } : null,
                newData: { rate },
            });
            revalidatePath("/admin/g2bulk-pricing");
            return { success: true as const, data: { rate: Number(rate) } };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ---------------------------------------------------------------------------
// SIMULATOR
// ---------------------------------------------------------------------------

export const simulateG2BulkPricingAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({
            priceCentsUsd: z.number().int().nonnegative(),
            category: z.string().min(1),
            brand: z.string().min(1),
            sku: z.string().min(1),
            tierDiscountPct: z.number().min(0).max(100),
            customDiscountPct: z.number().min(0).max(100).optional(),
            resellerId: z.number().int().positive().optional(),
        }),
    },
    async (input) => {
        try {
            const ctx = {
                resellerId: input.resellerId ?? 0,
                tierDiscountPct: input.tierDiscountPct,
                customDiscountPct: input.customDiscountPct,
            };
            const computed = await g2bulkPricingService.computePrice(
                {
                    priceCentsUsd: input.priceCentsUsd,
                    category: input.category,
                    brand: input.brand,
                    sku: input.sku,
                },
                ctx,
            );
            return { success: true as const, data: computed };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

/** Helper for the admin UI dropdown — current tier list. */
export const getG2BulkTiersForSimulatorAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const tiers = await TierService.listAll();
            return {
                success: true as const,
                data: tiers.map((t) => ({ id: t.id, name: t.name, discountPct: Number(t.discountPct) })),
            };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);
