"use server";

import { db } from "@/db";
import { bsvPricingRules, shopSettings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAuth, logSecurityAction } from "@/lib/security";
import { UserRole } from "@/lib/constants";
import { bsvPricingService } from "@/services/bsv-pricing.service";
import { TierService } from "@/services/tier.service";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const scopeTypeEnum = z.enum(["global", "category", "brand", "sku"]);
const markupTypeEnum = z.enum(["pct", "fixed_dzd"]);

// Markup value as string to preserve precision through the wire.
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

export const getAllPricingRulesAction = withAuth(
    { roles: [UserRole.ADMIN] },
    async () => {
        try {
            const rows = await db
                .select()
                .from(bsvPricingRules)
                .orderBy(asc(bsvPricingRules.scopeType), asc(bsvPricingRules.scopeValue));
            return { success: true as const, data: rows };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

export const getUsdRateAction = withAuth(
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

export const createPricingRuleAction = withAuth(
    { roles: [UserRole.ADMIN], schema: ruleBaseSchema },
    async (input, user) => {
        try {
            // Global rule must always have scope_value '*'.
            const scopeValue = input.scopeType === "global" ? "*" : input.scopeValue.trim();

            // Conflict resolution: rely on the partial unique index
            // (scope_type, scope_value) WHERE is_active = true. Catch below if it fires.
            const [row] = await db
                .insert(bsvPricingRules)
                .values({
                    scopeType: input.scopeType,
                    scopeValue,
                    markupType: input.markupType,
                    markupValue: input.markupValue,
                    notes: input.notes ?? null,
                    isActive: input.isActive ?? true,
                })
                .returning();

            bsvPricingService.invalidateCache();
            await logSecurityAction({
                userId: user.id,
                action: "BSV_PRICING_RULE_CREATE",
                entityType: "bsv_pricing_rule",
                entityId: String(row.id),
                newData: row,
            });
            revalidatePath("/admin/bsv-pricing");
            return { success: true as const, data: row };
        } catch (error: any) {
            const msg = String(error?.message ?? error);
            if (msg.includes("bsv_pricing_rules_scope_unique")) {
                return { success: false as const, error: "Une règle active existe déjà pour ce scope. Désactivez ou éditez-la." };
            }
            return { success: false as const, error: msg };
        }
    },
);

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

export const updatePricingRuleAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: ruleBaseSchema.extend({ id: z.number().int().positive() }),
    },
    async (input, user) => {
        try {
            const scopeValue = input.scopeType === "global" ? "*" : input.scopeValue.trim();
            const old = await db.query.bsvPricingRules.findFirst({ where: eq(bsvPricingRules.id, input.id) });
            if (!old) return { success: false as const, error: "Règle introuvable" };

            const [row] = await db
                .update(bsvPricingRules)
                .set({
                    scopeType: input.scopeType,
                    scopeValue,
                    markupType: input.markupType,
                    markupValue: input.markupValue,
                    notes: input.notes ?? null,
                    isActive: input.isActive ?? true,
                    updatedAt: new Date(),
                })
                .where(eq(bsvPricingRules.id, input.id))
                .returning();

            bsvPricingService.invalidateCache();
            await logSecurityAction({
                userId: user.id,
                action: "BSV_PRICING_RULE_UPDATE",
                entityType: "bsv_pricing_rule",
                entityId: String(input.id),
                oldData: old,
                newData: row,
            });
            revalidatePath("/admin/bsv-pricing");
            return { success: true as const, data: row };
        } catch (error: any) {
            const msg = String(error?.message ?? error);
            if (msg.includes("bsv_pricing_rules_scope_unique")) {
                return { success: false as const, error: "Une règle active existe déjà pour ce scope." };
            }
            return { success: false as const, error: msg };
        }
    },
);

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export const deletePricingRuleAction = withAuth(
    {
        roles: [UserRole.ADMIN],
        schema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }, user) => {
        try {
            const old = await db.query.bsvPricingRules.findFirst({ where: eq(bsvPricingRules.id, id) });
            if (!old) return { success: false as const, error: "Règle introuvable" };
            // Safety: never delete the global fallback — disable instead.
            if (old.scopeType === "global") {
                return { success: false as const, error: "Impossible de supprimer la règle globale. Désactivez-la ou changez sa valeur." };
            }

            await db.delete(bsvPricingRules).where(eq(bsvPricingRules.id, id));
            bsvPricingService.invalidateCache();
            await logSecurityAction({
                userId: user.id,
                action: "BSV_PRICING_RULE_DELETE",
                entityType: "bsv_pricing_rule",
                entityId: String(id),
                oldData: old,
            });
            revalidatePath("/admin/bsv-pricing");
            return { success: true as const };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ---------------------------------------------------------------------------
// USD RATE
// ---------------------------------------------------------------------------

export const setUsdRateAction = withAuth(
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
            bsvPricingService.invalidateCache();
            await logSecurityAction({
                userId: user.id,
                action: "BSV_USD_RATE_UPDATE",
                entityType: "shop_settings",
                entityId: existing[0]?.id ? String(existing[0].id) : null as any,
                oldData: existing[0]?.old != null ? { rate: existing[0].old } : null,
                newData: { rate },
            });
            revalidatePath("/admin/bsv-pricing");
            return { success: true as const, data: { rate: Number(rate) } };
        } catch (error) {
            return { success: false as const, error: (error as Error).message };
        }
    },
);

// ---------------------------------------------------------------------------
// SIMULATOR
// ---------------------------------------------------------------------------

export const simulatePricingAction = withAuth(
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
            const computed = await bsvPricingService.computePrice(
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
export const getTiersForSimulatorAction = withAuth(
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
